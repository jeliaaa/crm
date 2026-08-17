import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import ContactQuickView from '@/components/ContactQuickView';
import MarkHandledButton from '@/components/MarkHandledButton';
import { normalizeRecordingUrl, isPlayableRecording } from '@/lib/recordingUrl';
import { PhoneCall, PlayCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

const PAGE_LIMIT = 200;

type Row = {
  id: string;
  name: string;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  city: string | null;
  category: string | null;
  action_required: boolean;
  updated_at: string;
};

type CallEvent = {
  call_time: string | null;
  duration: number | null;
  direction: string | null;
  src: string | null;
  dst: string | null;
  recording_url: string | null;
  matched_contact_ids: string[] | null;
};

function formatDuration(seconds: number | null): string {
  if (!seconds && seconds !== 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function CalledAnsweredPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const pendingOnly = searchParams.filter !== 'all';

  let query = supabase
    .from('contacts')
    .select('id, name, phone, mobile, email, city, category, action_required, updated_at', {
      count: 'exact',
    })
    .eq('stage', 'called_answered')
    .order('action_required', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(PAGE_LIMIT);

  if (pendingOnly) query = query.eq('action_required', true);

  const [{ data, count, error }, { count: pendingCount }] = await Promise.all([
    query,
    supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('stage', 'called_answered')
      .eq('action_required', true),
  ]);

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm font-mono">
          <p className="font-bold mb-1">Could not load answered calls:</p>
          <p>{error.message}</p>
          <p className="text-red-400 mt-2">
            Did you run <code>database/migrate-call-webhook.sql</code>?
          </p>
        </div>
      </div>
    );
  }

  const contacts = (data ?? []) as Row[];

  // Latest call per contact, for the number / duration / recording columns.
  const lastCall = new Map<string, CallEvent>();
  if (contacts.length) {
    const { data: events } = await supabase
      .from('call_events')
      .select('call_time, duration, direction, src, dst, recording_url, matched_contact_ids')
      .overlaps('matched_contact_ids', contacts.map((c) => c.id))
      .order('call_time', { ascending: false })
      .limit(500);

    for (const ev of (events ?? []) as CallEvent[]) {
      for (const id of ev.matched_contact_ids ?? []) {
        if (!lastCall.has(id)) lastCall.set(id, ev);
      }
    }
  }

  const tabs = [
    { label: 'Needs action', href: '/called-answered', active: pendingOnly, count: pendingCount ?? 0 },
    { label: 'All answered', href: '/called-answered?filter=all', active: !pendingOnly },
  ];

  return (
    <div className="p-8">
      <div className="flex items-center gap-2 mb-1">
        <PhoneCall className="text-emerald-600" size={22} />
        <h1 className="text-2xl font-bold text-slate-900">Called + answered</h1>
        <span className="text-slate-400 text-lg font-normal">({count?.toLocaleString() ?? 0})</span>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Contacts who picked up the phone for more than 2 seconds. A red dot means nobody has
        followed up yet.
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
            {t.count ? (
              <span className="ml-2 inline-flex items-center justify-center min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {t.count}
              </span>
            ) : null}
          </Link>
        ))}
      </div>

      {contacts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-12 text-center text-slate-400">
          {pendingOnly
            ? 'Nothing waiting on you — every answered call has been handled.'
            : 'No answered calls yet. They appear here as soon as CityNet posts one.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm divide-y divide-slate-100">
          {contacts.map((c) => {
            const call = lastCall.get(c.id);
            // Rows stored before the URL was normalised on ingest are still encoded.
            const recording = normalizeRecordingUrl(call?.recording_url);
            const otherNumber = call
              ? call.direction === 'out'
                ? call.dst
                : call.src
              : c.phone ?? c.mobile;

            return (
              <div key={c.id} className="flex items-center gap-4 px-5 py-3">
                <span
                  title={c.action_required ? 'Needs an action' : 'Handled'}
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    c.action_required ? 'bg-red-500' : 'bg-slate-200'
                  }`}
                />
                <ContactQuickView contactId={c.id} name={c.name} />

                <div className="flex-1 min-w-0">
                  <Link
                    href={`/contacts/${c.id}`}
                    className="font-medium text-indigo-600 hover:underline truncate block"
                  >
                    {c.name}
                  </Link>
                  <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                    {otherNumber && <span className="font-mono">{otherNumber}</span>}
                    {c.email && <span>{c.email}</span>}
                    {c.city && <span>{c.city}</span>}
                    {c.category && <span>{c.category}</span>}
                  </div>
                </div>

                <div className="text-right shrink-0 text-xs">
                  <p className="text-slate-700 font-medium">
                    {formatDateTime(call?.call_time ?? c.updated_at)}
                  </p>
                  <p className="text-slate-400">{formatDuration(call?.duration ?? null)}</p>
                </div>

                {isPlayableRecording(recording) && (
                  <a
                    href={recording!}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Listen to the recording"
                    className="text-slate-400 hover:text-indigo-600 shrink-0"
                  >
                    <PlayCircle size={18} />
                  </a>
                )}

                <div className="shrink-0">
                  {c.action_required ? (
                    <MarkHandledButton contactId={c.id} />
                  ) : (
                    <span className="text-xs text-slate-400 px-3">Handled</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
