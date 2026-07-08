import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Every status change counts as a "call". Return the recent ones so the
// calendar can tally calls per day.
export async function GET() {
  const since = new Date();
  since.setDate(since.getDate() - 180);

  const { data, error } = await supabase
    .from('contact_activities')
    .select('id, to_stage, created_at')
    .eq('type', 'status_change')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message, calls: [] }, { status: 500 });
  return NextResponse.json({ calls: data ?? [] });
}
