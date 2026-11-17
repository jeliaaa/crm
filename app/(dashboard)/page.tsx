import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { stageBadge, STAGE_ORDER, STAGE_LABELS } from '@/lib/stages';
import { getSnapshots, tbilisiDate } from '@/lib/snapshot';
import { getCallCounts } from '@/lib/callCounts';
import { getDashboardMonthlyStats } from '@/lib/dashboardStats';
import MonthlyStatCard from '@/components/MonthlyStatCard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const snapshots = await getSnapshots(2).catch(() => []);

  // Calls today = outgoing calls the phone system logged this Tbilisi day.
  const today = tbilisiDate();
  const { byDate } = await getCallCounts(2);
  const callsToday = byDate[today] ?? 0;

  const monthly = await getDashboardMonthlyStats();

  const latest = snapshots[0];
  const prev = snapshots[1];
  const delta = latest
    ? Object.fromEntries(STAGE_ORDER.map((s) => [s, latest[s] - (prev ? prev[s] : 0)]))
    : null;

  const [
    { count: total },
    { count: leads },
    { count: calledAnswered },
    { count: followUp },
    { count: done },
    { count: lost },
  ] = await Promise.all([
    supabase.from('contacts').select('*', { count: 'exact', head: true }),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('stage', 'lead'),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('stage', 'called_answered'),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('stage', 'follow_up'),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('stage', 'done'),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('stage', 'lost'),
  ]);

  const stats: { label: string; value: number; color: string; href?: string }[] = [
    { label: 'Total Contacts', value: total ?? 0, color: 'bg-indigo-500' },
    { label: 'Leads', value: leads ?? 0, color: 'bg-blue-500' },
    { label: 'Called + answered', value: calledAnswered ?? 0, color: 'bg-emerald-500', href: '/called-answered' },
    { label: 'Follow-up', value: followUp ?? 0, color: 'bg-amber-500' },
    { label: 'Done', value: done ?? 0, color: 'bg-green-500' },
    { label: 'Lost', value: lost ?? 0, color: 'bg-red-500' },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Dashboard</h1>

      <div className="bg-emerald-600 rounded-xl p-5 shadow-sm mb-6 flex items-center justify-between">
        <div>
          <p className="text-emerald-100 text-sm font-medium">Calls today</p>
          <p className="text-white/70 text-xs mt-0.5">Outgoing calls logged by the phone system</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-4xl font-bold text-white">{(callsToday ?? 0).toLocaleString()}</span>
          <Link href="/calendar" className="text-xs text-emerald-100 hover:text-white underline">
            Calendar →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {stats.map((s) => {
          const body = (
            <>
              <div className={`w-8 h-8 ${s.color} rounded-lg mb-3`} />
              <p className="text-2xl font-bold text-slate-900">{s.value.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </>
          );
          const className = 'bg-white rounded-xl p-5 shadow-sm border border-slate-100';
          return s.href ? (
            <Link key={s.label} href={s.href} className={`${className} block hover:border-indigo-200 transition-colors`}>
              {body}
            </Link>
          ) : (
            <div key={s.label} className={className}>{body}</div>
          );
        })}
      </div>

      <div className="mb-8">
        <h2 className="font-semibold text-slate-900 mb-3">{monthly.monthLabel} vs {monthly.prevMonthLabel}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {monthly.stats.map((s) => (
            <MonthlyStatCard key={s.key} stat={s} />
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold text-slate-900">Since previous 6 PM snapshot</h2>
          <Link href="/calendar" className="text-sm text-indigo-600 hover:underline">
            Calendar →
          </Link>
        </div>
        {!delta ? (
          <p className="text-sm text-slate-400">
            No snapshots yet — take one from the{' '}
            <Link href="/calendar" className="text-indigo-600 hover:underline">Calendar</Link>{' '}
            or wait for the 6 PM run. Two are needed to show a difference.
          </p>
        ) : !prev ? (
          <p className="text-sm text-slate-400">
            Baseline recorded {latest.snapshot_date}. The first 24h difference appears after the next 6 PM snapshot.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {STAGE_ORDER.map((s) => {
              const v = delta[s];
              return (
                <span
                  key={s}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    v === 0 ? 'bg-slate-100 text-slate-400' : stageBadge(s)
                  }`}
                >
                  {STAGE_LABELS[s]}: {v > 0 ? `+${v}` : v}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
