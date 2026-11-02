'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileText, FileType2, Loader2, Plus, Search, Settings, Trash2, X } from 'lucide-react';
import { DEFAULT_SETTINGS } from '@/lib/invoice';
import type { InvoiceFormat, InvoiceLang, InvoiceSettings } from '@/lib/invoice';

// Invoice builder. Everything is typed by hand; the only shortcut is the
// client search, which fills the client block from a CRM contact.

type Hit = {
  id: string;
  name: string;
  identification_number: string | null;
  head: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
};

type Line = { documentType: string; notarized: boolean; languagePair: string; pages: string; price: string };

const today = () => new Date().toISOString().slice(0, 10);
const emptyLine = (): Line => ({ documentType: '', notarized: true, languagePair: '', pages: '1', price: '' });
const emptyClient = { name: '', address: '', email: '', phone: '' };

const LANGS: { value: InvoiceLang; label: string }[] = [
  { value: 'ka', label: 'ქართული' },
  { value: 'en', label: 'English' },
  { value: 'both', label: 'Both' },
];

const SETTING_FIELDS: [keyof InvoiceSettings, string][] = [
  ['nameKa', 'Name (ქართული)'],
  ['nameEn', 'Name (English)'],
  ['addressKa', 'Address (ქართული)'],
  ['addressEn', 'Address (English)'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['bankName', 'Bank'],
  ['swift', 'SWIFT'],
  ['iban', 'IBAN'],
  ['directorKa', 'Director (ქართული)'],
  ['directorEn', 'Director (English)'],
];

const input =
  'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const labelCls = 'block text-xs font-medium text-slate-500 mb-1';

function toNumber(v: string): number {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export default function InvoiceForm() {
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [client, setClient] = useState(emptyClient);
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [notes, setNotes] = useState('');
  const [lang, setLang] = useState<InvoiceLang>('ka');
  const [busy, setBusy] = useState<InvoiceFormat | null>(null);
  const [error, setError] = useState('');

  // Default number: yyyymmdd-HHMM, editable. Set after mount to dodge a
  // server/client clock mismatch during hydration.
  useEffect(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    setNumber(`${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`);
  }, []);

  // ── provider settings (stored server-side, defaults until saved) ─────────
  const [settings, setSettings] = useState<InvoiceSettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<InvoiceSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');

  useEffect(() => {
    fetch('/api/invoices/settings')
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setSettings(j.data);
          setDraft(j.data);
        }
      })
      .catch(() => {});
  }, []);

  async function saveSettings() {
    setSaving(true);
    setSettingsMsg('');
    try {
      const res = await fetch('/api/invoices/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setSettings(json.data);
      setDraft(json.data);
      setSettingsMsg('Saved');
    } catch (e) {
      setSettingsMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ── client search ───────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const json = await res.json();
        setHits(Array.isArray(json.data) ? json.data : []);
        setActive(-1);
        setSearching(false);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function pick(h: Hit) {
    setClient({
      name: h.name || '',
      address: [h.address, h.city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', '),
      email: h.email || '',
      phone: h.mobile || h.phone || '',
    });
    setQuery('');
    setHits([]);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!hits.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? hits.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(hits[active >= 0 ? active : 0]);
    } else if (e.key === 'Escape') setOpen(false);
  }

  // ── lines ────────────────────────────────────────────────────────────────
  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + toNumber(l.price), 0);

  async function generate(format: InvoiceFormat) {
    setError('');
    setBusy(format);
    try {
      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang,
          format,
          invoice: {
            number,
            date,
            dueDate,
            client,
            notes,
            items: lines.map((l) => ({
              documentType: l.documentType,
              notarized: l.notarized,
              languagePair: l.languagePair,
              pages: toNumber(l.pages),
              price: toNumber(l.price),
            })),
          },
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Failed (${res.status})`);
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || `invoice.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Provider + meta */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-medium text-slate-500">Service provider</p>
            <p className="text-sm font-semibold text-slate-900">{settings.nameKa}</p>
            <p className="text-xs text-slate-500">{settings.nameEn}</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Invoice №</label>
              <input className={input} value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Due date</label>
              <input type="date" className={input} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
        </div>
      </section>

      {/* Provider settings */}
      <section className="bg-white border border-slate-200 rounded-xl">
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          className="w-full flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-900"
        >
          <Settings size={15} className="text-slate-400" /> Provider &amp; bank details
          <ChevronDown size={15} className={`ml-auto text-slate-400 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
        </button>
        {showSettings && (
          <div className="px-5 pb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SETTING_FIELDS.map(([key, text]) => (
                <div key={key}>
                  <label className={labelCls}>{text}</label>
                  <input className={input} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button
                type="button"
                disabled={saving}
                onClick={saveSettings}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-60"
              >
                {saving && <Loader2 size={14} className="animate-spin" />} Save details
              </button>
              <button type="button" onClick={() => setDraft(DEFAULT_SETTINGS)} className="text-sm text-slate-500 hover:text-slate-900">
                Reset to defaults
              </button>
              {settingsMsg && <span className="text-sm text-slate-500">{settingsMsg}</span>}
            </div>
          </div>
        )}
      </section>

      {/* Client */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Client</h2>

        <div ref={box} className="relative mb-4">
          <label className={labelCls}>Pick from contacts</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className={`${input} pl-9`}
              placeholder="Search by name, tax ID, phone, email, address…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKey}
            />
            {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
          </div>
          {open && query.trim().length >= 2 && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-80 overflow-auto">
              {hits.length === 0 && !searching && <p className="px-3 py-3 text-sm text-slate-400">No matching contacts</p>}
              {hits.map((h, i) => (
                <button
                  key={h.id}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(h)}
                  className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-0 ${i === active ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                >
                  <p className="text-sm font-medium text-slate-900 truncate">{h.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {[h.identification_number, h.mobile || h.phone, h.email, h.city].filter(Boolean).join(' · ') || '—'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {client.name && (
          <div className="flex mb-4">
            <button
              type="button"
              onClick={() => setClient(emptyClient)}
              className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
            >
              <X size={12} /> Clear client
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={labelCls}>Client name</label>
            <input className={input} value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Address</label>
            <input className={input} value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" className={input} value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input className={input} value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} />
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Translation services</h2>
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_5rem_8rem_2rem] gap-2 items-end border border-slate-100 rounded-lg p-3">
              <div>
                <label className={labelCls}>Document type</label>
                <input
                  className={input}
                  placeholder="e.g. წესდება"
                  value={l.documentType}
                  onChange={(e) => setLine(i, { documentType: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Language pair</label>
                <input
                  className={input}
                  placeholder="e.g. ინგლისური → ქართული"
                  value={l.languagePair}
                  onChange={(e) => setLine(i, { languagePair: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Pages</label>
                <input className={input} inputMode="numeric" value={l.pages} onChange={(e) => setLine(i, { pages: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Final price (₾)</label>
                <input className={input} inputMode="decimal" placeholder="0.00" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} />
              </div>
              <button
                type="button"
                title="Remove line"
                disabled={lines.length === 1}
                onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                className="p-2 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-slate-400 justify-self-end"
              >
                <Trash2 size={15} />
              </button>
              <fieldset className="col-span-2 sm:col-span-5 flex flex-wrap items-center gap-x-5 gap-y-1">
                <legend className="sr-only">Notary approval</legend>
                <span className="text-xs font-medium text-slate-500">Notary approval</span>
                {[
                  { v: true, text: 'Notarized' },
                  { v: false, text: 'Not notarized' },
                ].map((o) => (
                  <label key={String(o.v)} className="inline-flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name={`notary-${i}`}
                      checked={l.notarized === o.v}
                      onChange={() => setLine(i, { notarized: o.v })}
                      className="accent-indigo-600"
                    />
                    {o.text}
                  </label>
                ))}
              </fieldset>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-4">
          <button
            type="button"
            onClick={() => setLines((ls) => [...ls, emptyLine()])}
            className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800"
          >
            <Plus size={14} /> Add line
          </button>
          <p className="text-sm text-slate-500">
            Total <span className="ml-2 text-base font-semibold text-slate-900">{total.toFixed(2)} ₾</span>
          </p>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <label className={labelCls}>Notes (optional)</label>
        <textarea className={input} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </section>

      {/* Output */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className={labelCls}>Invoice language</p>
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
              {LANGS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setLang(o.value)}
                  className={`px-3 py-1.5 text-sm transition-colors ${lang === o.value ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 sm:ml-auto sm:self-end">
            {(['pdf', 'docx'] as InvoiceFormat[]).map((f) => (
              <button
                key={f}
                type="button"
                disabled={busy !== null}
                onClick={() => generate(f)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-60"
              >
                {busy === f ? <Loader2 size={14} className="animate-spin" /> : f === 'pdf' ? <FileText size={14} /> : <FileType2 size={14} />}
                Download .{f}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>
    </div>
  );
}
