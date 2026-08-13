import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// How many answered-call contacts are still waiting for someone to act.
// Drives the red dot next to "Called + answered" in the sidebar.
export async function GET() {
  const { count, error } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('stage', 'called_answered')
    .eq('action_required', true);

  // Before the migration runs the column doesn't exist — no dot, no noise.
  if (error) return NextResponse.json({ count: 0 });
  return NextResponse.json({ count: count ?? 0 });
}
