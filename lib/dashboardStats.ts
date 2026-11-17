import { supabase } from './supabase';
import { tbilisiDate } from './snapshot';

// Business-facing monthly stats for the dashboard: this calendar month
// (Tbilisi) against the previous one, for every metric a sales team
// actually watches day to day.

const PAGE = 1000;
const MAX_ROWS = 50000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

type MonthBounds = { startIso: string; endIso: string; label: string };

// Tbilisi has used a fixed UTC+4 offset (no DST) since 2017, so a literal
// offset in the ISO string gives the exact Tbilisi midnight without having
// to round-trip through Intl for every boundary.
function tbilisiMonthBounds(monthsAgo: number): MonthBounds {
  const [y0, m0] = tbilisiDate().split('-').map(Number); // m0 is 1-indexed
  let y = y0;
  let m = m0 - monthsAgo;
  while (m <= 0) {
    m += 12;
    y -= 1;
  }
  let ny = y;
  let nm = m + 1;
  if (nm > 12) {
    nm = 1;
    ny += 1;
  }
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return {
    startIso: `${y}-${pad(m)}-01T00:00:00+04:00`,
    endIso: `${ny}-${pad(nm)}-01T00:00:00+04:00`,
    label,
  };
}

async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

type CallRow = { direction: string | null; status: string | null; duration: number | null };

function fetchCallEvents(startIso: string, endIso: string): Promise<CallRow[]> {
  return fetchAll<CallRow>((from, to) =>
    supabase
      .from('call_events')
      .select('direction, status, duration')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true })
      .range(from, to)
  );
}

type CallSummary = {
  made: number;
  answered: number;
  notAnswered: number;
  answerRate: number; // 0-100
  avgAnsweredDuration: number; // seconds
};

// Same rule as everywhere else: nothing explicitly marked inbound is a call
// we placed, so a missing direction never silently drops out of "made".
function summarizeCalls(rows: CallRow[]): CallSummary {
  let made = 0;
  let answered = 0;
  let answeredDuration = 0;

  for (const r of rows) {
    if ((r.direction ?? '').toLowerCase().startsWith('in')) continue;
    made++;
    if ((r.status ?? '').toUpperCase() === 'ANSWERED') {
      answered++;
      answeredDuration += r.duration ?? 0;
    }
  }

  return {
    made,
    answered,
    notAnswered: made - answered,
    answerRate: made ? (answered / made) * 100 : 0,
    avgAnsweredDuration: answered ? answeredDuration / answered : 0,
  };
}

async function countContactsCreated(startIso: string, endIso: string): Promise<number> {
  const { count } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startIso)
    .lt('created_at', endIso);
  return count ?? 0;
}

async function countStatusChange(toStage: string, startIso: string, endIso: string): Promise<number> {
  const { count } = await supabase
    .from('contact_activities')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'status_change')
    .eq('to_stage', toStage)
    .gte('created_at', startIso)
    .lt('created_at', endIso);
  return count ?? 0;
}

export type StatKind = 'count' | 'percent' | 'duration';

export type MonthlyStat = {
  key: string;
  label: string;
  hint: string;
  kind: StatKind;
  current: number;
  previous: number;
  href?: string;
};

export type DashboardMonthlyStats = {
  monthLabel: string;
  prevMonthLabel: string;
  stats: MonthlyStat[];
};

export async function getDashboardMonthlyStats(): Promise<DashboardMonthlyStats> {
  const cur = tbilisiMonthBounds(0);
  const prev = tbilisiMonthBounds(1);

  const [curRows, prevRows, curLeads, prevLeads, curDone, prevDone, curLost, prevLost] = await Promise.all([
    fetchCallEvents(cur.startIso, cur.endIso),
    fetchCallEvents(prev.startIso, prev.endIso),
    countContactsCreated(cur.startIso, cur.endIso),
    countContactsCreated(prev.startIso, prev.endIso),
    countStatusChange('done', cur.startIso, cur.endIso),
    countStatusChange('done', prev.startIso, prev.endIso),
    countStatusChange('lost', cur.startIso, cur.endIso),
    countStatusChange('lost', prev.startIso, prev.endIso),
  ]);

  const curCalls = summarizeCalls(curRows);
  const prevCalls = summarizeCalls(prevRows);

  const curConversion = curCalls.made ? (curDone / curCalls.made) * 100 : 0;
  const prevConversion = prevCalls.made ? (prevDone / prevCalls.made) * 100 : 0;

  return {
    monthLabel: cur.label,
    prevMonthLabel: prev.label,
    stats: [
      {
        key: 'made',
        label: 'Calls made',
        hint: 'Outbound calls placed this month',
        kind: 'count',
        current: curCalls.made,
        previous: prevCalls.made,
        href: '/calls',
      },
      {
        key: 'answered',
        label: 'Calls answered',
        hint: 'Status ANSWERED, whatever the duration',
        kind: 'count',
        current: curCalls.answered,
        previous: prevCalls.answered,
        href: '/called-answered?filter=all',
      },
      {
        key: 'notAnswered',
        label: 'Calls not answered',
        hint: 'No answer, busy, or failed',
        kind: 'count',
        current: curCalls.notAnswered,
        previous: prevCalls.notAnswered,
      },
      {
        key: 'answerRate',
        label: 'Answer rate',
        hint: 'Calls answered ÷ calls made',
        kind: 'percent',
        current: curCalls.answerRate,
        previous: prevCalls.answerRate,
      },
      {
        key: 'avgDuration',
        label: 'Avg. call length',
        hint: 'Average length of answered calls',
        kind: 'duration',
        current: curCalls.avgAnsweredDuration,
        previous: prevCalls.avgAnsweredDuration,
      },
      {
        key: 'leads',
        label: 'New leads',
        hint: 'Contacts added this month',
        kind: 'count',
        current: curLeads,
        previous: prevLeads,
        href: '/contacts',
      },
      {
        key: 'done',
        label: 'Deals won',
        hint: 'Contacts moved to Done',
        kind: 'count',
        current: curDone,
        previous: prevDone,
      },
      {
        key: 'lost',
        label: 'Lost',
        hint: 'Contacts moved to Lost',
        kind: 'count',
        current: curLost,
        previous: prevLost,
      },
      {
        key: 'conversion',
        label: 'Call → win conversion',
        hint: 'Deals won ÷ calls made',
        kind: 'percent',
        current: curConversion,
        previous: prevConversion,
      },
    ],
  };
}
