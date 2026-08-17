import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { STAGE_ORDER } from '@/lib/stages';
import { phoneKey, isUsablePhoneKey } from '@/lib/phone';

// Fields a person can fill in by hand. Everything else on the row is either
// scraper bookkeeping (stat_id, source_url) or derived.
const FILLABLE = [
  'name',
  'identification_number',
  'head',
  'phone',
  'mobile',
  'email',
  'website',
  'address',
  'city',
  'region',
  'category',
  'activity_code',
  'ownership_type',
  'business_size',
  'established_year',
  'description',
  'notes',
] as const;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const pageSize = 50;
  const from = (page - 1) * pageSize;

  let query = supabase
    .from('contacts')
    .select('id, name, phone, city, category, stage, website, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  const stage = searchParams.get('stage');
  const city = searchParams.get('city');
  const category = searchParams.get('category');
  const q = searchParams.get('q');

  if (stage) query = query.eq('stage', stage);
  if (city) query = query.ilike('city', `%${city}%`);
  if (category) query = query.ilike('category', `%${category}%`);
  if (q) query = query.ilike('name', `%${q}%`);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data, count, page, pageSize });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const row: Record<string, unknown> = { name };
  for (const field of FILLABLE) {
    if (field === 'name') continue;
    const value = body[field];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    row[field] = trimmed || null;
  }

  // Blank stays blank rather than becoming 0, and a stray "nineteen" is
  // dropped instead of failing the insert.
  const year = Number.parseInt(String(body.established_year ?? ''), 10);
  row.established_year = Number.isFinite(year) ? year : null;

  row.notes = typeof body.notes === 'string' ? body.notes.trim() : '';

  const stage = typeof body.stage === 'string' ? body.stage : '';
  row.stage = (STAGE_ORDER as string[]).includes(stage) ? stage : 'lead';

  // The call webhook matches on phone number and updates every contact that
  // shares it, so flag duplicates rather than silently creating a second row
  // that will move in lockstep with the first.
  const duplicates: { id: string; name: string }[] = [];
  for (const candidate of [row.phone, row.mobile]) {
    if (typeof candidate !== 'string' || !isUsablePhoneKey(phoneKey(candidate))) continue;
    const { data } = await supabase.rpc('find_contacts_by_phone', { p_digits: candidate });
    for (const c of (data ?? []) as { id: string; name: string }[]) {
      if (!duplicates.some((d) => d.id === c.id)) duplicates.push({ id: c.id, name: c.name });
    }
  }

  const { data, error } = await supabase.from('contacts').insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ contact: data, duplicates });
}

export async function DELETE() {
  const { error } = await supabase.from('contacts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
