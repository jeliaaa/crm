import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import ContactQuickView from '@/components/ContactQuickView';
import { stageBadge, stageLabel } from '@/lib/stages';
import { CalendarClock } from 'lucide-react';

export const dynamic = 'force-dynamic';

type FollowUp = {
  id: string;
  contact_id: string;
  comment: string | null;
  follow_up_date: string;
  created_at: string;
  contacts: {
    name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    category: string | null;
    stage: string;
  } | null;
};

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function fmt(date: string): string {
  return new Date(date).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default async function FollowUpsPage() {
  const { data, error } = await supabase
    .from('contact_activities')
    .select('id, contact_id, comment, follow_up_date, created_at, contacts!inner(name, phone, email, city, category, stage)')
    .eq('type', 'follow_up')
    .not('follow_up_date', 'is', null)
    .eq('contacts.stage', 'follow_up') // hide once the contact leaves Follow-up
    .order('follow_up_date', { ascending: true });

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm font-mono">
          <p className="font-bold mb-1">Could not load follow-ups:</p>
          <p>{error.message}</p>
          <p className="text-red-400 mt-2">
            Did you run <code>database/migrate-status-history.sql</code>?
          </p>
        </div>
      </div>
    );
  }

  const followUps = (data ?? []) as unknown as FollowUp[];
  const today = startOfToday();

  const overdue = followUps.filter((f) => f.follow_up_date < today);
  const dueToday = followUps.filter((f) => f.follow_up_date === today);
  const upcoming = followUps.filter((f) => f.follow_up_date > today);

  const groups = [
    { label: 'Overdue', items: overdue, tone: 'text-red-600', dot: 'bg-red-500' },
    { label: 'Today', items: dueToday, tone: 'text-amber-600', dot: 'bg-amber-500' },
    { label: 'Upcoming', items: upcoming, tone: 'text-slate-600', dot: 'bg-slate-400' },
  ];

  return (
    <div className="p-8">
      <div className="flex items-center gap-2 mb-6">
        <CalendarClock className="text-indigo-600" size={22} />
        <h1 className="text-2xl font-bold text-slate-900">Follow-ups</h1>
        <span className="text-slate-400 text-lg font-normal">({followUps.length})</span>
      </div>

      {followUps.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-12 text-center text-slate-400">
          No follow-ups scheduled. Open a contact&apos;s{' '}
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-slate-300 text-slate-500 align-middle">!</span>{' '}
          menu to add one.
        </div>
      )}

      <div className="space-y-8">
        {groups.map(
          (g) =>
            g.items.length > 0 && (
              <div key={g.label}>
                <h2 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${g.tone}`}>
                  <span className={`w-2 h-2 rounded-full ${g.dot}`} />
                  {g.label} <span className="text-slate-400 font-normal">({g.items.length})</span>
                </h2>
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm divide-y divide-slate-100">
                  {g.items.map((f) => (
                    <div key={f.id} className="flex items-center gap-4 px-5 py-3">
                      <ContactQuickView contactId={f.contact_id} name={f.contacts?.name ?? 'Contact'} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/contacts/${f.contact_id}`}
                            className="font-medium text-indigo-600 hover:underline truncate"
                          >
                            {f.contacts?.name ?? 'Contact'}
                          </Link>
                          {f.contacts?.stage && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stageBadge(f.contacts.stage)}`}>
                              {stageLabel(f.contacts.stage)}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                          {f.contacts?.phone && <span className="font-mono">{f.contacts.phone}</span>}
                          {f.contacts?.email && <span>{f.contacts.email}</span>}
                          {f.contacts?.city && <span>{f.contacts.city}</span>}
                        </div>
                        {f.comment && <p className="text-sm text-slate-600 mt-1">{f.comment}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-medium ${g.tone}`}>{fmt(f.follow_up_date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
        )}
      </div>
    </div>
  );
}
