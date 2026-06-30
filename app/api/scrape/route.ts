import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { searchCategory, type RateLimitError, type NormalizedCompany } from '@/lib/geostat';

export const maxDuration = 60;

// Fields we'll back-fill on an existing contact when they're currently empty.
// Stage and notes are intentionally excluded — never clobber CRM edits.
const FILLABLE = [
  'name',
  'phone',
  'email',
  'website',
  'address',
  'city',
  'region',
  'category',
  'activity_code',
  'head',
  'partner',
  'ownership_type',
  'business_size',
  'description',
  'established_year',
  'stat_id',
  'source_url',
] as const;

type ExistingRow = {
  id: string;
  identification_number: string | null;
  categories: string[] | null;
} & Record<string, unknown>;

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

// A "sufficient" phone has at least 9 digits (Georgian numbers are 9; with the
// +995 country code, 12). Strips formatting before counting.
function hasSufficientPhone(phone: string | null): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9;
}

function hasEmail(email: string | null): boolean {
  return !!email && /\S+@\S+\.\S+/.test(email);
}

type ContactFilter = 'phone' | 'email' | 'phoneOrEmail' | 'none';

function passesContactFilter(c: NormalizedCompany, mode: ContactFilter): boolean {
  const phone = hasSufficientPhone(c.phone);
  const email = hasEmail(c.email);
  switch (mode) {
    case 'phone':
      return phone;
    case 'email':
      return email;
    case 'phoneOrEmail':
      return phone || email;
    case 'none':
    default:
      return true;
  }
}

function toRow(c: NormalizedCompany) {
  return {
    stat_id: c.stat_id,
    name: c.name,
    identification_number: c.identification_number,
    phone: c.phone,
    email: c.email,
    website: c.website,
    address: c.address,
    city: c.city,
    region: c.region,
    category: c.category,
    activity_code: c.activity_code,
    categories: c.categories,
    head: c.head,
    partner: c.partner,
    ownership_type: c.ownership_type,
    business_size: c.business_size,
    description: c.description,
    established_year: c.established_year,
    source_url: c.source_url,
    stage: 'lead',
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { code, sectionName, page, limit, contactFilter = 'phoneOrEmail' } = body as {
    code: string;
    sectionName: string;
    page: number;
    limit?: number;
    contactFilter?: ContactFilter;
  };

  if (!code || !sectionName) {
    return NextResponse.json({ error: 'code and sectionName are required' }, { status: 400 });
  }

  let result;
  try {
    result = await searchCategory({
      code,
      sectionName,
      page: page || 1,
      limit: limit || 100,
    });
  } catch (e: unknown) {
    const rl = e as RateLimitError;
    if (rl?.retryAfterMs) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfterMs: rl.retryAfterMs },
        { status: 429 }
      );
    }
    const msg = e instanceof Error ? e.message : 'Search failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // 1. Filter to companies that have usable contact info.
  const scrapedTotal = result.companies.length;
  const companies = result.companies.filter((c) => passesContactFilter(c, contactFilter));
  const skippedNoContact = scrapedTotal - companies.length;

  const baseResponse = {
    scraped: scrapedTotal,
    skippedNoContact,
    inserted: 0,
    updated: 0,
    duplicates: 0,
    total: result.total,
    totalPages: result.totalPages,
    currentPage: result.page,
  };

  if (companies.length === 0) {
    return NextResponse.json(baseResponse);
  }

  // 2. Look up existing rows by identification number (the dedupe key).
  const idNumbers = companies
    .map((c) => c.identification_number)
    .filter((x): x is string => !!x);

  const { data: existingRows, error: lookupError } = idNumbers.length
    ? await supabase
        .from('contacts')
        .select(
          'id, identification_number, categories, name, phone, email, website, address, city, region, category, activity_code, head, partner, ownership_type, business_size, description, established_year, stat_id, source_url'
        )
        .in('identification_number', idNumbers)
    : { data: [] as ExistingRow[], error: null };

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  const byIdNumber = new Map<string, ExistingRow>();
  for (const row of (existingRows as ExistingRow[]) ?? []) {
    if (row.identification_number) byIdNumber.set(row.identification_number, row);
  }

  // 3. Split into inserts (new) and fills (existing with gaps).
  const toInsert: ReturnType<typeof toRow>[] = [];
  let updated = 0;
  let duplicates = 0;

  for (const c of companies) {
    const existing = c.identification_number
      ? byIdNumber.get(c.identification_number)
      : undefined;

    if (!existing) {
      toInsert.push(toRow(c));
      continue;
    }

    // Back-fill only the fields that are currently empty.
    const patch: Record<string, unknown> = {};
    const fresh = toRow(c) as Record<string, unknown>;
    for (const f of FILLABLE) {
      if (isEmpty(existing[f]) && !isEmpty(fresh[f])) patch[f] = fresh[f];
    }
    // Merge categories (union) if the new row brings extra ones.
    if (!isEmpty(c.categories)) {
      const current = existing.categories ?? [];
      const merged = Array.from(new Set([...current, ...c.categories]));
      if (merged.length > current.length) patch.categories = merged;
    }

    if (Object.keys(patch).length > 0) {
      const { error: updErr } = await supabase
        .from('contacts')
        .update(patch)
        .eq('id', existing.id);
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
      updated++;
    } else {
      duplicates++;
    }
  }

  // 4. Bulk-insert the new ones. stat_id conflict guards against races and
  //    companies that share an id number but were filtered above.
  let insertedCount = 0;
  if (toInsert.length) {
    const { data: inserted, error } = await supabase
      .from('contacts')
      .upsert(toInsert, { onConflict: 'stat_id', ignoreDuplicates: true })
      .select('id');
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    insertedCount = inserted?.length ?? 0;
    duplicates += toInsert.length - insertedCount;
  }

  return NextResponse.json({
    ...baseResponse,
    inserted: insertedCount,
    updated,
    duplicates,
  });
}
