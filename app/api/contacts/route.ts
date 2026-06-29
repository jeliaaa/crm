import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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
