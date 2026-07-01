import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Status changes are how a lead gets "processed" (a call outcome). We return
// the recent ones so the calendar can tally per-day activity by outcome.
export async function GET() {
  const since = new Date();
  since.setDate(since.getDate() - 120);

  const { data, error } = await supabase
    .from('contact_activities')
    .select('id, to_stage, created_at')
    .eq('type', 'status_change')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ statusChanges: data ?? [] });
}
