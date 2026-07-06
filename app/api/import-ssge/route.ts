import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getToken, importPage, SSGE_CATEGORY, type SsgeAgency } from '@/lib/ssge';

export const maxDuration = 60;

const FILLABLE = ['name', 'phone', 'email', 'website', 'address'] as const;

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

function toRow(a: SsgeAgency) {
  return {
    name: a.name,
    phone: a.phone,
    email: a.email,
    website: a.website,
    address: a.address,
    category: SSGE_CATEGORY,
    source_url: a.source_url,
    stage: 'lead',
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { page, pageSize = 20, token: passedToken } = body as {
    page: number;
    pageSize?: number;
    token?: string;
  };

  // Reuse a token across chained page calls; fetch one if not supplied.
  let token = passedToken;
  try {
    if (!token) token = await getToken();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Could not get ss.ge token';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  let result;
  try {
    result = await importPage({ page: page || 1, pageSize, token });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'ss.ge import failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const base = {
    token, // return so the client can reuse it on the next page
    scraped: result.agencies.length,
    skippedNoContact: 0,
    inserted: 0,
    updated: 0,
    duplicates: 0,
    total: result.total,
    totalPages: result.totalPages,
    currentPage: page || 1,
  };

  if (result.agencies.length === 0) return NextResponse.json(base);

  // Dedupe by source_url; back-fill empty fields on existing rows.
  const urls = result.agencies.map((a) => a.source_url);
  const { data: existingRows, error: lookupError } = await supabase
    .from('contacts')
    .select('id, source_url, name, phone, email, website, address')
    .in('source_url', urls);

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });

  const byUrl = new Map((existingRows ?? []).map((r) => [r.source_url, r]));

  const toInsert: ReturnType<typeof toRow>[] = [];
  let updated = 0;
  let duplicates = 0;

  for (const a of result.agencies) {
    const existing = byUrl.get(a.source_url);
    if (!existing) {
      toInsert.push(toRow(a));
      continue;
    }
    const fresh = toRow(a) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const f of FILLABLE) {
      if (isEmpty((existing as Record<string, unknown>)[f]) && !isEmpty(fresh[f])) patch[f] = fresh[f];
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
