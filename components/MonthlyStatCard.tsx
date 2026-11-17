import type { MonthlyStat } from '@/lib/dashboardStats';
import Link from 'next/link';

function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (!m) return `${s}s`;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function formatValue(value: number, kind: MonthlyStat['kind']): string {
  if (kind === 'percent') return `${value.toFixed(1)}%`;
  if (kind === 'duration') return formatDuration(value);
  return Math.round(value).toLocaleString();
}

function momBadge(current: number, previous: number, kind: MonthlyStat['kind']): { text: string; cls: string } {
  const neutral = { text: '—', cls: 'bg-slate-100 text-slate-400' };

  if (kind === 'percent') {
    if (current === previous) return neutral;
    const diff = current - previous;
    const cls = diff > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700';
    return { text: `${diff > 0 ? '+' : ''}${diff.toFixed(1)}pp`, cls };
  }

  if (previous === 0) {
    if (current === 0) return neutral;
    return { text: 'New', cls: 'bg-emerald-100 text-emerald-700' };
  }

  const pct = ((current - previous) / previous) * 100;
  if (pct === 0) return neutral;
  const cls = pct > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700';
  return { text: `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`, cls };
}

export default function MonthlyStatCard({ stat }: { stat: MonthlyStat }) {
  const badge = momBadge(stat.current, stat.previous, stat.kind);
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-slate-500">{stat.label}</p>
        <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${badge.cls}`}>
          {badge.text}
        </span>
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-2">{formatValue(stat.current, stat.kind)}</p>
      <p className="text-[11px] text-slate-400 mt-1" title={stat.hint}>
        vs {formatValue(stat.previous, stat.kind)} last month
      </p>
    </>
  );

  const className = 'bg-white rounded-xl p-4 shadow-sm border border-slate-100';

  return stat.href ? (
    <Link href={stat.href} className={`${className} block hover:border-indigo-200 transition-colors`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
