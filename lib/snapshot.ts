import { supabase } from './supabase';
import { STAGE_ORDER } from './stages';

// A snapshot records how many contacts sit in each stage at a moment in time.
// Taken once a day at 18:00 Tbilisi, the day-over-day difference tells you how
// many leads moved into each stage in the last 24h — regardless of how the
// change was made (modal, detail page, or Kanban drag).

export type Snapshot = {
  snapshot_date: string; // YYYY-MM-DD (Tbilisi)
  lead: number;
  follow_up: number;
  done: number;
  lost: number;
  didnt_answer: number;
  total: number;
};

export function tbilisiDate(d: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tbilisi' }).format(d);
}

export async function recordSnapshot(): Promise<Snapshot> {
  const counts = await Promise.all(
    STAGE_ORDER.map((s) =>
      supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('stage', s)
    )
  );

  const byStage = Object.fromEntries(
    STAGE_ORDER.map((s, i) => [s, counts[i].count ?? 0])
  ) as Record<(typeof STAGE_ORDER)[number], number>;

  const row: Snapshot = {
    snapshot_date: tbilisiDate(),
    lead: byStage.lead,
    follow_up: byStage.follow_up,
    done: byStage.done,
    lost: byStage.lost,
    didnt_answer: byStage.didnt_answer,
    total: STAGE_ORDER.reduce((a, s) => a + byStage[s], 0),
  };

  const { error } = await supabase
    .from('stage_snapshots')
    .upsert(row, { onConflict: 'snapshot_date' });

  if (error) throw new Error(error.message);
  return row;
}

export async function getSnapshots(limit = 90): Promise<Snapshot[]> {
  const { data, error } = await supabase
    .from('stage_snapshots')
    .select('snapshot_date, lead, follow_up, done, lost, didnt_answer, total')
    .order('snapshot_date', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as Snapshot[];
}
