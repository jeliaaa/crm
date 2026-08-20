import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { normalizeRecordingUrl, isPlayableRecording } from '@/lib/recordingUrl';
import { stageBadge, stageLabel } from '@/lib/stages';
import { ListOrdered, PlayCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

// The raw PBX log, straight out of call_events: every call CityNet ever
// pushed at us, inbound and outbound, answered or not, matched to a contact
// or not. Deliberately unfiltered — the pipeline pages show the interpreted
// version, this is the record to check them against.

type CallEvent = {
  id: string;
  unique_id: string | null;
  call_time: string | null;
  direction: string | null;
  src: string | null;
  dst: string | null;
  operator: string | null;
  mobile: string | null;
  duration: number | null;
  status: string | null;
  recording_url: string | null;
  meta_data: string | null;
  matched_phone: string | null;
  matched_contact_ids: string[] | null;
  applied_stage: string | null;
  raw: unknown;
  created_at: string;
};

// Same rule the webhook applies: anything not explicitly marked inbound is a
// call we placed, so a missing dir is never silently counted as theirs.
function isInbound(direction: string | null): boolean {
  return (direction ?? '').toLowerCase().startsWith('in');
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

// The PBX clock is Tbilisi and the server's is not, so pin the timezone —
// otherwise a row reads back hours off from what the phone actually showed.
function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Tbilisi',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function statusBadge(status: string | null): string {
  const s = (status ?? '').toUpperCase();
  if (!s) return 'bg-slate-100 text-slate-500';
  if (s === 'ANSWERED') return 'bg-emerald-100 text-emerald-700';
  if (s === 'BUSY') return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700'; // NO ANSWER, FAILED, CANCEL, …
}

const COLUMNS = [
  'When (Tbilisi)',
  'Direction',
  'Status',
  'Duration',
  'From (src)',
  'To (dst)',
  'Operator',
  'Mobile',
  'Recording',
  'Matched phone',
  'Matched contacts',
  'Applied stage',
  'Meta',
  'Unique ID',
  'Logged',
  'Raw payload',
];

export default async function AllCallsPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const [{ data, count, error }, { count: inboundCount }, { count: answeredCount }] =
    await Promise.all([
      supabase
        .from('call_events')
        .select('*', { count: 'exact' })
        // Rows whose date_time failed to parse still have a created_at, so sort
        // on both and keep the undated ones at the bottom rather than the top.
        .order('call_time', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(from, to),
      supabase.from('call_events').select('*', { count: 'exact', head: true }).ilike('direction', 'in%'),
      supabase.from('call_events').select('*', { count: 'exact', head: true }).ilike('status', 'answered'),
    ]);

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm font-mono">
          <p className="font-bold mb-1">Could not load the call log:</p>
          <p>{error.message}</p>
          <p className="text-red-400 mt-2">
            Did you run <code>database/migrate-call-webhook.sql</code>?
          </p>
        </div>
      </div>
    );
  }

  const calls = (data ?? []) as CallEvent[];
  const total = count ?? 0;
  const inbound = inboundCount ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Resolve the matched ids to names so the column is readable; a contact
  // deleted since the call was logged just keeps showing its id.
  const ids = Array.from(new Set(calls.flatMap((c) => c.matched_contact_ids ?? [])));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: contacts } = await supabase.from('contacts').select('id, name').in('id', ids);
    for (const c of contacts ?? []) names.set(c.id, c.name);
  }

  const stats = [
    { label: 'Calls logged', value: total, color: 'bg-indigo-500', hint: 'Every row in the log' },
    {
      label: 'Outbound',
      value: total - inbound,
      color: 'bg-emerald-500',
      hint: 'Calls we placed — anything not marked inbound',
    },
    { label: 'Inbound', value: inbound, color: 'bg-sky-500', hint: 'Somebody ringing us' },
    {
      label: 'Answered',
      value: answeredCount ?? 0,
      color: 'bg-green-500',
      // Not the same rule as the "Called + answered" stage, which also wants
      // more than 2 seconds of talking. This is the PBX status, nothing more.
      hint: 'Status ANSWERED, whatever the duration',
    },
  ];

  const tabs = [
    { label: 'Needs action', href: '/called-answered' },
    { label: 'All answered', href: '/called-answered?filter=all' },
    { label: 'All the calls', href: '/calls', active: true },
  ];

  const pagination = totalPages > 1 && (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <span className="text-xs text-slate-400">
        Page {page} of {totalPages} · {total.toLocaleString()} calls
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link
            href={`/calls?page=${page - 1}`}
            className="px-3 py-1.5 rounded-lg text-sm bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          >
            ← Prev
          </Link>
        )}
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          const p = Math.max(1, Math.min(page - 3, totalPages - 6)) + i;
          return (
            <Link
              key={p}
              href={`/calls?page=${p}`}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                p === page
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {p}
            </Link>
          );
        })}
        {page < totalPages && (
          <Link
            href={`/calls?page=${page + 1}`}
            className="px-3 py-1.5 rounded-lg text-sm bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-8">
      <div className="flex items-center gap-2 mb-1">
        <ListOrdered className="text-indigo-600" size={22} />
        <h1 className="text-2xl font-bold text-slate-900">All the calls</h1>
        <span className="text-slate-400 text-lg font-normal">({total.toLocaleString()})</span>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Every call the phone system has logged, exactly as it arrived — inbound and outbound,
        answered or not, matched to a contact or not. No filters.
      </p>

      <div className="flex gap-2 mb-5">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              t.active
                ? 'bg-white border-slate-200 text-slate-900 shadow-sm'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-white/70'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {stats.map((s) => (
          <div
            key={s.label}
            title={s.hint}
            className="bg-white rounded-xl p-5 shadow-sm border border-slate-100"
          >
            <div className={`w-8 h-8 ${s.color} rounded-lg mb-3`} />
            <p className="text-2xl font-bold text-slate-900">{s.value.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {pagination && <div className="mb-4">{pagination}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {COLUMNS.map((h) => (
                <th key={h} className="text-left px-4 py-3 text-slate-500 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => {
              // Rows stored before the URL was normalised on ingest are still encoded.
              const recording = normalizeRecordingUrl(c.recording_url);
              const inboundCall = isInbound(c.direction);
              const matched = c.matched_contact_ids ?? [];

              return (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 align-top">
                  <td className="px-4 py-3 text-slate-700 font-medium text-xs">
                    {formatDateTime(c.call_time)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      title={c.direction || 'no dir field — treated as outbound'}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        inboundCall ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {inboundCall ? 'Inbound' : 'Outbound'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(c.status)}`}
                    >
                      {c.status || 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{formatDuration(c.duration)}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{c.src || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{c.dst || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{c.operator || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{c.mobile || '—'}</td>
                  <td className="px-4 py-3">
                    {isPlayableRecording(recording) ? (
                      <a
                        href={recording!}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={recording!}
                        className="text-slate-400 hover:text-indigo-600 inline-block"
                      >
                        <PlayCircle size={18} />
                      </a>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                    {c.matched_phone || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[220px] truncate">
                    {matched.length ? (
                      matched.map((id, i) => (
                        <span key={id}>
                          {i > 0 && ', '}
                          <Link href={`/contacts/${id}`} className="text-indigo-600 hover:underline">
                            {names.get(id) ?? id.slice(0, 8)}
                          </Link>
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400">no match</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.applied_stage ? (
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${stageBadge(
                          c.applied_stage
                        )}`}
                      >
                        {stageLabel(c.applied_stage)}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">unchanged</span>
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-slate-500 text-xs max-w-[160px] truncate"
                    title={c.meta_data || ''}
                  >
                    {c.meta_data || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{c.unique_id || '—'}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{formatDateTime(c.created_at)}</td>
                  <td className="px-4 py-3 text-xs">
                    {c.raw ? (
                      <details>
                        <summary className="cursor-pointer text-indigo-600 hover:underline select-none">
                          JSON
                        </summary>
                        <pre className="mt-2 p-2 bg-slate-50 border border-slate-100 rounded-lg text-[11px] text-slate-600 max-w-[380px] max-h-64 overflow-auto whitespace-pre">
                          {JSON.stringify(c.raw, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!calls.length && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-6 py-12 text-center text-slate-400">
                  {page > 1 ? (
                    <>
                      Nothing on this page.{' '}
                      <Link href="/calls" className="text-indigo-600 hover:underline">
                        Back to the first →
                      </Link>
                    </>
                  ) : (
                    'No calls logged yet. They appear here as soon as CityNet posts one.'
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && <div className="mt-4">{pagination}</div>}
    </div>
  );
}
