'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Loader2, X } from 'lucide-react';
import { STAGE_ORDER, STAGE_LABELS } from '@/lib/stages';
import { INTEREST_LEVELS } from '@/lib/interest';

type Initial = { q?: string; stage?: string; city?: string; category?: string; contact?: string };

const field =
  'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500';

const chip = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
    active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
  }`;

export default function ExportContactsButton({
  cities,
  categories,
  initial,
}: {
  cities: string[];
  categories: string[];
  initial: Initial;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [q, setQ] = useState(initial.q ?? '');
  const [stages, setStages] = useState<string[]>(initial.stage ? [initial.stage] : []);
  const [interests, setInterests] = useState<string[]>([]);
  const [city, setCity] = useState(initial.city ?? '');
  const [category, setCategory] = useState(initial.category ?? '');
  const [contact, setContact] = useState(initial.contact ?? '');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [history, setHistory] = useState(true);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function download() {
    setBusy(true);
    setError('');
    try {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (stages.length) p.set('stage', stages.join(','));
      if (interests.length) p.set('interest', interests.join(','));
      if (city) p.set('city', city);
      if (category) p.set('category', category);
      if (contact) p.set('contact', contact);
      if (createdFrom) p.set('createdFrom', createdFrom);
      if (createdTo) p.set('createdTo', createdTo);
      p.set('history', history ? '1' : '0');

      const res = await fetch(`/api/contacts/export?${p}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Failed (${res.status})`);
      }
      const blob = await res.blob();
      const fname = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'contacts.xlsx';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50"
      >
        <Download size={14} /> Export Excel
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
            onClick={() => !busy && setOpen(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-bold text-slate-900 text-lg">Export to Excel</h2>
                  <p className="text-xs text-slate-500">Choose what to include, then download.</p>
                </div>
                <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <X size={20} />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Search</label>
                <input className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Any text (optional)" />
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">
                  Stage <span className="text-slate-400 font-normal">(none selected = all)</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {STAGE_ORDER.map((s) => (
                    <button key={s} type="button" onClick={() => toggle(stages, setStages, s)} className={chip(stages.includes(s))}>
                      {STAGE_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">
                  Interest level <span className="text-slate-400 font-normal">(none selected = all)</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {INTEREST_LEVELS.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      title={l.label}
                      onClick={() => toggle(interests, setInterests, String(l.value))}
                      className={chip(interests.includes(String(l.value)))}
                    >
                      {l.value}
                    </button>
                  ))}
                  <button type="button" onClick={() => toggle(interests, setInterests, 'none')} className={chip(interests.includes('none'))}>
                    Not set
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                  <select className={field} value={city} onChange={(e) => setCity(e.target.value)}>
                    <option value="">All cities</option>
                    {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">All categories</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contact info</label>
                  <select className={field} value={contact} onChange={(e) => setContact(e.target.value)}>
                    <option value="">Any contact info</option>
                    <option value="phone">Has phone number</option>
                    <option value="email">Has email</option>
                    <option value="phoneOrEmail">Has phone or email</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Added from</label>
                  <input type="date" className={field} value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Added to</label>
                  <input type="date" className={field} value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} className="accent-indigo-600" />
                Include history (status changes, interest, follow-ups, comments)
              </label>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-2">
                <button onClick={() => setOpen(false)} disabled={busy} className="px-4 py-2 text-sm text-slate-600 rounded-lg hover:bg-slate-100">
                  Cancel
                </button>
                <button
                  onClick={download}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  {busy ? 'Preparing…' : 'Filter & download'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
