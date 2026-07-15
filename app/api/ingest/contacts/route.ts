import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const maxDuration = 30;

// Fields external services are allowed to write.
const FILLABLE = [
  'stat_id',
  'name',
  'identification_number',
  'phone',
  'mobile',
  'email',
  'website',
  'address',
  'city',
  'region',
  'category',
  'activity_code',
  'categories',
  'head',
  'partner',
  'ownership_type',
  'business_size',
  'description',
  'source_url',
  'established_year',
  'stage',
] as const;

type ContactPayload = Partial<Record<(typeof FILLABLE)[number], unknown>> & { name: string };

function toRow(c: ContactPayload) {
  const row: Record<string, unknown> = {};
  for (const f of FILLABLE) if (c[f] !== undefined) row[f] = c[f];
  return row;
}

export async function POST(request: NextRequest) {
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Ingest endpoint not configured' }, { status: 501 });
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const contacts = Array.isArray(body) ? body : [body];
  if (contacts.length === 0) {
    return NextResponse.json({ error: 'No contacts provided' }, { status: 400 });
  }
  if (!contacts.every((c) => c && typeof c === 'object' && typeof (c as ContactPayload).name === 'string' && (c as ContactPayload).name.trim())) {
    return NextResponse.json({ error: 'Every contact requires a non-empty "name"' }, { status: 400 });
  }

  const rows = (contacts as ContactPayload[]).map(toRow);

  // Contacts arriving via this endpoint are always tagged as BREVO.
  rows.forEach((r) => { r.category = 'BREVO'; });

  // Dedupe on source_url when the caller supplies one; otherwise just insert.
  const withUrl = rows.filter((r) => typeof r.source_url === 'string' && r.source_url);
  const withoutUrl = rows.filter((r) => !(typeof r.source_url === 'string' && r.source_url));

  let upserted: unknown[] = [];
  let inserted: unknown[] = [];

  if (withUrl.length) {
    const { data, error } = await supabase
      .from('contacts')
      .upsert(withUrl, { onConflict: 'source_url' })
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    upserted = data ?? [];
  }

  if (withoutUrl.length) {
    const { data, error } = await supabase.from('contacts').insert(withoutUrl).select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    inserted = data ?? [];
  }

  return NextResponse.json({ ok: true, upserted: upserted.length, inserted: inserted.length });
}
