'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, CalendarClock } from 'lucide-react';
import ContactQuickView from '@/components/ContactQuickView';
import { stageBadge, stageLabel } from '@/lib/stages';

type FollowUp = {
  id: string;
  contact_id: string;
  comment: string | null;
  follow_up_date: string; // YYYY-MM-DD
  contacts: {
    name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    stage: string;
  } | null;
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function FollowUpCalendar() {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() }; // month 0-11
  });
  const [selected, setSelected] = useState<string>(() => ymd(new Date()));

  const load = useCallback(() => {
    return fetch('/api/follow-ups')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setError('');
          setFollowUps(d.followUps ?? []);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // date string -> follow-ups on that day
  const byDate = useMemo(() => {
    const m = new Map<string, FollowUp[]>();
    for (const f of followUps) {
      const key = f.follow_up_date.slice(0, 10);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(f);
    }
    return m;
  }, [followUps]);

  const todayStr = ymd(new Date());

  // Build the calendar grid (weeks starting Monday).
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const startOffset = (first.getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(cursor.year, cursor.month, d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function goToday() {
    const d = new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setSelected(ymd(d));
  }

  const selectedItems = byDate.get(selected) ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Calendar */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">{monthLabel}</h2>
          <div className="flex items-center gap-1">
            <button onClick={goToday} className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 mr-1">
              Today
            </button>
            <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
              <ChevronLeft size={18} />
            </button>
            <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-xs font-medium text-slate-400 py-1">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const key = ymd(date);
            const count = byDate.get(key)?.length ?? 0;
            const isToday = key === todayStr;
            const isSelected = key === selected;
            const isPast = key < todayStr;
            return (
              <button
                key={i}
                onClick={() => setSelected(key)}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center relative text-sm transition-colors border ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-transparent hover:bg-slate-50'
                } ${isToday ? 'font-bold text-indigo-600' : 'text-slate-700'}`}
              >
                <span>{date.getDate()}</span>
                {count > 0 && (
                  <span
                    className={`absolute bottom-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center text-white ${
                      isPast ? 'bg-red-500' : 'bg-indigo-500'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {loading && <p className="text-sm text-slate-400 mt-4">Loading follow-ups…</p>}
        {error && (
          <p className="text-sm text-red-600 mt-4">
            {error} — did you run the status-history migration?
          </p>
        )}
      </div>

      {/* Day detail */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h2 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
          <CalendarClock size={16} className="text-indigo-600" />
          {new Date(selected + 'T00:00:00').toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          {selectedItems.length} follow-up{selectedItems.length === 1 ? '' : 's'}
        </p>

        {selectedItems.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing scheduled for this day.</p>
        ) : (
          <div className="space-y-3">
            {selectedItems.map((f) => (
              <div key={f.id} className="flex items-start gap-3 border-b border-slate-100 pb-3 last:border-0">
                <ContactQuickView contactId={f.contact_id} name={f.contacts?.name ?? 'Contact'} onChange={load} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/contacts/${f.contact_id}`} className="font-medium text-indigo-600 hover:underline truncate">
                      {f.contacts?.name ?? 'Contact'}
                    </Link>
                    {f.contacts?.stage && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stageBadge(f.contacts.stage)}`}>
                        {stageLabel(f.contacts.stage)}
                      </span>
                    )}
                  </div>
                  {f.contacts?.phone && (
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{f.contacts.phone}</p>
                  )}
                  {f.comment && <p className="text-sm text-slate-600 mt-1">{f.comment}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
