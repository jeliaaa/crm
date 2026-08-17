import { NextResponse } from 'next/server';
import { getCallCounts } from '@/lib/callCounts';

export const dynamic = 'force-dynamic';

// Calls per day for the calendar. Bucketed server-side into Tbilisi days so
// the calendar and the dashboard tile can't disagree about where midnight is.
export async function GET() {
  try {
    const { byDate, logStartDate } = await getCallCounts();
    return NextResponse.json({ callsByDate: byDate, logStartDate });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not load calls';
    return NextResponse.json({ error: message, callsByDate: {} }, { status: 500 });
  }
}
