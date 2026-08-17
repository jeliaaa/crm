import { supabase } from './supabase';
import { CALL_ADJUSTMENTS } from './callAdjustments';
import { tbilisiDate } from './snapshot';

const MAX_ROWS = 10000;

export type CallCounts = {
  byDate: Record<string, number>; // Tbilisi YYYY-MM-DD -> calls made
  logStartDate: string | null; // first day the PBX log covers
};

// Calls made, per Tbilisi day.
//
// The real source is call_events — what the phone system actually dialled.
// Outbound only: somebody ringing us isn't outreach we made.
//
// That log only starts the day the CityNet webhook went live, so days before
// it keep using the old proxy (one status change ≈ one call) instead of
// dropping to zero and rewriting the history the calendar already shows.
export async function getCallCounts(days = 180): Promise<CallCounts> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  // Where the log begins is a property of the whole table, not of the window
  // being asked about — otherwise a quiet fortnight would look like "no log
  // yet" and double-count against the status-change fallback.
  const { data: earliest } = await supabase
    .from('call_events')
    .select('call_time, created_at')
    .order('created_at', { ascending: true })
    .limit(1);

  const first = earliest?.[0];
  const logStartDate = first ? tbilisiDate(new Date(first.call_time ?? first.created_at)) : null;

  const [{ data: events }, { data: activities }] = await Promise.all([
    supabase
      .from('call_events')
      .select('call_time, created_at, direction')
      .gte('created_at', sinceIso)
      .limit(MAX_ROWS),
    supabase
      .from('contact_activities')
      .select('created_at')
      .eq('type', 'status_change')
      .gte('created_at', sinceIso)
      .limit(MAX_ROWS),
  ]);

  const byDate: Record<string, number> = {};

  for (const e of events ?? []) {
    if ((e.direction ?? '').toLowerCase().startsWith('in')) continue;
    const day = tbilisiDate(new Date(e.call_time ?? e.created_at));
    byDate[day] = (byDate[day] ?? 0) + 1;
  }

  for (const a of activities ?? []) {
    const day = tbilisiDate(new Date(a.created_at));
    if (logStartDate && day >= logStartDate) continue; // the log covers this day
    byDate[day] = (byDate[day] ?? 0) + 1;
  }

  for (const [day, amount] of Object.entries(CALL_ADJUSTMENTS)) {
    byDate[day] = (byDate[day] ?? 0) + amount;
  }

  return { byDate, logStartDate };
}
