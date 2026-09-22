import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { contactSearchGroups } from '@/lib/contactSearch';

// Live results for the sidebar search box. Same all-fields matching the
// contacts page uses, trimmed to a handful of rows and enough columns for
// the dropdown to show *why* each one matched.

const LIMIT = 8;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') || '';
  const groups = await contactSearchGroups(q);
  if (!groups.length) return NextResponse.json({ data: [], count: 0 });

  let query = supabase
    .from('contacts')
    .select(
      'id, name, identification_number, head, phone, mobile, email, website, address, city, region, category, stage',
      { count: 'exact' }
    )
    .order('updated_at', { ascending: false })
    .limit(LIMIT);

  for (const group of groups) query = query.or(group);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data, count });
}
