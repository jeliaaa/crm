import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import {
  fetchRubricPage,
  YELL_LAW_CATEGORY,
  YELL_LAW_RUBRIC,
  type YellCompany,
} from '@/lib/yell';

export const maxDuration = 60;

const FILLABLE = [
  'name',
  'phone',
  'mobile',
  'email',
  'website',
  'address',
  'city',
  'description',
] as const;

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function toRow(c: YellCompany) {
  return {
    name: c.name,
    phone: c.phone,
    mobile: c.mobile,
    email: c.email,
    website: c.website,
    address: c.address,
    city: c.city,
    description: c.description,
    category: YELL_LAW_CATEGORY, // every company from this rubric
    categories: c.categories, // the company's own yell.ge rubrics
    source_url: c.source_url,
    stage: 'lead',
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { page, rub = YELL_LAW_RUBRIC } = body as { page?: number; rub?: number };

  let result;
  try {
    result = await fetchRubricPage({ rub, page: page || 1 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'yell.ge import failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const base = {
    scraped: result.companies.length,
    skippedNoContact: 0,
    inserted: 0,
    updated: 0,
    duplicates: 0,
    total: result.total,
    totalPages: result.totalPages,
    currentPage: result.page,
  };

  if (result.companies.length === 0) return NextResponse.json(base);

  // Dedupe by source_url (the yell.ge company id); back-fill empty fields and
  // merge categories on rows we already have.
  const urls = result.companies.map((c) => c.source_url);
  const { data: existingRows, error: lookupError } = await supabase
    .from('contacts')
    .select('id, source_url, name, phone, mobile, email, website, address, city, description, category, categories')
    .in('source_url', urls);

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });

  const byUrl = new Map((existingRows ?? []).map((r) => [r.source_url, r]));

  const toInsert: ReturnType<typeof toRow>[] = [];
  let updated = 0;
  let duplicates = 0;

  for (const c of result.companies) {
    const existing = byUrl.get(c.source_url);
    if (!existing) {
      toInsert.push(toRow(c));
      continue;
    }

    const row = existing as Record<string, unknown>;
    const fresh = toRow(c) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const f of FILLABLE) {
      if (isEmpty(row[f]) && !isEmpty(fresh[f])) patch[f] = fresh[f];
    }
    // The rubric category is the point of the import — set it even if the row
    // came from another source without one.
    if (isEmpty(row.category)) patch.category = YELL_LAW_CATEGORY;
    if (!isEmpty(c.categories)) {
      const current = (row.categories as string[] | null) ?? [];
      const merged = Array.from(new Set([...current, ...c.categories]));
      if (merged.length > current.length) patch.categories = merged;
    }

    if (Object.keys(patch).length > 0) {
      const { error: updErr } = await supabase.from('contacts').update(patch).eq('id', existing.id);
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
      updated++;
    } else {
      duplicates++;
    }
  }

  let inserted = 0;
  if (toInsert.length) {
    const { data, error } = await supabase
      .from('contacts')
      .upsert(toInsert, { onConflict: 'source_url', ignoreDuplicates: true })
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    inserted = data?.length ?? 0;
    duplicates += toInsert.length - inserted;
  }

  return NextResponse.json({ ...base, inserted, updated, duplicates });
}
