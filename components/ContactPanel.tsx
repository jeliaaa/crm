'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Contact } from '@/lib/supabase';
import { INTEREST_LEVELS, interestLabel } from '@/lib/interest';
import {
  STAGE_ORDER,
  STAGE_LABELS,
  STAGE_BADGE,
  STAGE_BADGE_BORDER,
  type Stage,
} from '@/lib/stages';
import { formatPhone, phoneHref } from '@/lib/phone';
import type { InvoiceFormat, InvoiceLang } from '@/lib/invoice';
import {
  FileText,
  FileType2,
  Loader2,
  Plus,
  Trash2,
  Phone,
  Globe,
  MapPin,
  Tag,
  ExternalLink,
  Hash,
  User,
  Building2,
  Gauge,
  CalendarClock,
  MessageSquare,
  ArrowRight,
  Clock,
} from 'lucide-react';

type Activity = {
  id: string;
  type: 'status_change' | 'comment' | 'follow_up' | 'interest_change';
  from_stage: string | null;
  to_stage: string | null;
  comment: string | null;
  follow_up_date: string | null;
  created_at: string;
};

type ContactInfo = Contact;

type InvLine = { documentType: string; notarized: boolean; languagePair: string; pages: string; price: string };
const emptyInvLine = (): InvLine => ({ documentType: '', notarized: true, languagePair: '', pages: '1', price: '' });
const INV_LANGS: { value: InvoiceLang; label: string }[] = [
  { value: 'ka', label: 'ქართული' },
  { value: 'en', label: 'English' },
  { value: 'both', label: 'Both' },
];
const toNum = (v: string) => {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const invInput =
  'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

// The one contact view: used as the full page (/contacts/[id]) and inside the
// "!" quick-view modal, so both always show and do exactly the same things.
export default function ContactPanel({
  contactId,
  onChange,
}: {
  contactId: string;
  onChange?: () => void;
}) {
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const router = useRouter();

  const [invLines, setInvLines] = useState<InvLine[]>([emptyInvLine()]);
  const [invLang, setInvLang] = useState<InvoiceLang>('ka');
  const [invDue, setInvDue] = useState('');
  const [invNotes, setInvNotes] = useState('');
  const [invBusy, setInvBusy] = useState<InvoiceFormat | null>(null);
  const [invError, setInvError] = useState('');

  const setInvLine = (i: number, patch: Partial<InvLine>) =>
    setInvLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const invTotal = invLines.reduce((s, l) => s + toNum(l.price), 0);

  async function generateInvoice(format: InvoiceFormat) {
    if (!contact) return;
    setInvError('');
    setInvBusy(format);
    try {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang: invLang,
          format,
          invoice: {
            number: `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`,
            date: d.toISOString().slice(0, 10),
            dueDate: invDue,
            client: {
              name: contact.name,
              address: [contact.address, contact.city]
                .filter(Boolean)
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(', '),
              email: contact.email || '',
              phone: contact.phone || '',
            },
            notes: invNotes,
            items: invLines.map((l) => ({
              documentType: l.documentType,
              notarized: l.notarized,
              languagePair: l.languagePair,
              pages: toNum(l.pages),
              price: toNum(l.price),
            })),
          },
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Failed (${res.status})`);
      }
      const blob = await res.blob();
      const fname =
        /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || `invoice.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setInvError((e as Error).message);
    } finally {
      setInvBusy(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/activities`);
      const data = await res.json();
      setContact(data.contact);
      setNotes(data.contact?.notes ?? '');
      setActivities(data.activities ?? []);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await load();
        router.refresh();
        onChange?.();
      }
    } finally {
      setSaving(false);
    }
  }

  async function changeStage(toStage: Stage) {
    if (contact?.stage === toStage) return;
    await post({ type: 'status_change', toStage });
  }

  async function changeInterest(value: string) {
    await post({ type: 'interest_change', toLevel: value === '' ? null : Number(value) });
  }

  async function addComment() {
    if (!comment.trim()) return;
    await post({ type: 'comment', comment });
    setComment('');
  }

  async function addFollowUp() {
    if (!followUpDate) return;
    await post({ type: 'follow_up', followUpDate, comment: followUpNote });
    setFollowUpDate('');
    setFollowUpNote('');
  }

  async function saveNotes() {
    setSaving(true);
    try {
      await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!contact) {
    return <p className="text-sm text-slate-400">{loading ? 'Loading…' : 'Contact not found.'}</p>;
  }

  const websiteHref = contact.website
    ? contact.website.startsWith('http') ? contact.website : `https://${contact.website}`
    : null;
  const showInterest = contact.stage === 'called_answered' || contact.interest_level != null;
  const chip = 'inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full';

  return (
    <div className="space-y-6">
      {/* Details */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 leading-tight">{contact.name}</h1>
        {contact.established_year && <p className="text-slate-400 text-sm">Est. {contact.established_year}</p>}
        {contact.created_at && (
          <p className="text-slate-400 text-sm">Added {new Date(contact.created_at).toLocaleDateString()}</p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          {contact.identification_number && (
            <div className="flex items-center gap-2 text-slate-700">
              <Hash size={14} className="text-slate-400 shrink-0" />
              <span className="font-mono">{contact.identification_number}</span>
            </div>
          )}
          {contact.head && (
            <div className="flex items-center gap-2 text-slate-700">
              <User size={14} className="text-slate-400 shrink-0" />
              {contact.head}
            </div>
          )}
          {contact.phone && (
            <div className="flex items-center gap-2 text-slate-700">
              <Phone size={14} className="text-slate-400 shrink-0" />
              <a href={phoneHref(contact.phone)} className="hover:text-indigo-600">{formatPhone(contact.phone)}</a>
            </div>
          )}
          {contact.mobile && contact.mobile !== contact.phone && (
            <div className="flex items-center gap-2 text-slate-700">
              <Phone size={14} className="text-slate-400 shrink-0" />
              <a href={phoneHref(contact.mobile)} className="hover:text-indigo-600">{formatPhone(contact.mobile)}</a>
            </div>
          )}
          {contact.email && (
            <div className="flex items-center gap-2 text-slate-700">
              <span className="text-slate-400 text-xs shrink-0">@</span>
              <a href={`mailto:${contact.email}`} className="hover:text-indigo-600">{contact.email}</a>
            </div>
          )}
          {websiteHref && (
            <div className="flex items-center gap-2 text-slate-700">
              <Globe size={14} className="text-slate-400 shrink-0" />
              <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 flex items-center gap-1">
                {contact.website?.replace(/^https?:\/\//, '')} <ExternalLink size={11} />
              </a>
            </div>
          )}
          {contact.address && (
            <div className="flex items-start gap-2 text-slate-700 col-span-2">
              <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
              {contact.address}
            </div>
          )}
          {(contact.region || contact.city || contact.ownership_type || contact.business_size || contact.categories?.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 col-span-2">
              {contact.region && <span className={`${chip} bg-slate-100 text-slate-600`}><MapPin size={10} /> {contact.region}</span>}
              {contact.city && <span className={`${chip} bg-slate-100 text-slate-600`}><MapPin size={10} /> {contact.city}</span>}
              {contact.business_size && <span className={`${chip} bg-amber-50 text-amber-700`}><Building2 size={10} /> {contact.business_size}</span>}
              {contact.ownership_type && <span className={`${chip} bg-slate-100 text-slate-600`}>{contact.ownership_type}</span>}
              {contact.categories?.map((cat) => (
                <span key={cat} className={`${chip} bg-indigo-50 text-indigo-600`}><Tag size={10} /> {cat}</span>
              ))}
            </div>
          )}
          {contact.description && (
            <p className="text-slate-500 text-sm col-span-2 border-t border-slate-100 pt-3">{contact.description}</p>
          )}
          {contact.source_url && (
            <div className="col-span-2">
              <a href="https://br.geostat.ge/" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 hover:text-indigo-500 flex items-center gap-1">
                Source: Statistical Business Register <ExternalLink size={10} />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div>
        <p className="text-sm font-medium text-slate-700 mb-2">Notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Add notes about this contact…"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={saveNotes}
            disabled={saving || notes === (contact.notes ?? '')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
          >
            Save notes
          </button>
          {notesSaved && <span className="text-green-600 text-sm">Saved!</span>}
        </div>
      </div>

                {/* Status */}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Status</p>
                  <div className="flex flex-wrap gap-2">
                    {STAGE_ORDER.map((s) => {
                      const active = contact?.stage === s;
                      return (
                        <button
                          key={s}
                          disabled={saving}
                          onClick={() => changeStage(s)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors disabled:opacity-50 ${
                            active
                              ? STAGE_BADGE_BORDER[s]
                              : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {STAGE_LABELS[s]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Interest level (second status, once called + answered) */}
                {showInterest && (
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                      <Gauge size={14} className="text-slate-400" /> Interest level
                    </p>
                    <select
                      value={contact.interest_level ?? ''}
                      disabled={saving}
                      onChange={(e) => changeInterest(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      <option value="">— not set —</option>
                      {INTEREST_LEVELS.map((l) => (
                        <option key={l.value} value={l.value}>{l.value} - {l.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Add follow-up */}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <CalendarClock size={14} className="text-slate-400" /> Add a follow-up
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      type="text"
                      value={followUpNote}
                      onChange={(e) => setFollowUpNote(e.target.value)}
                      placeholder="Note (optional)"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      onClick={addFollowUp}
                      disabled={saving || !followUpDate}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Add comment */}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <MessageSquare size={14} className="text-slate-400" /> Add a comment
                  </p>
                  <div className="flex gap-2">
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={2}
                      placeholder="Write a comment…"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                    <button
                      onClick={addComment}
                      disabled={saving || !comment.trim()}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 self-start"
                    >
                      Post
                    </button>
                  </div>
                </div>

                {/* Create invoice */}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <FileText size={14} className="text-slate-400" /> Create invoice
                  </p>
                  <div className="space-y-2">
                    {invLines.map((l, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_2rem] gap-2 items-center border border-slate-100 rounded-lg p-2">
                        <input className={invInput} aria-label="Document type" placeholder="Document type, e.g. წესდება" value={l.documentType} onChange={(e) => setInvLine(i, { documentType: e.target.value })} />
                        <input className={invInput} aria-label="Language pair" placeholder="ინგლისური → ქართული" value={l.languagePair} onChange={(e) => setInvLine(i, { languagePair: e.target.value })} />
                        <button
                          type="button"
                          disabled={invLines.length === 1}
                          onClick={() => setInvLines((ls) => ls.filter((_, idx) => idx !== i))}
                          className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30"
                        >
                          <Trash2 size={14} />
                        </button>
                        <div className="col-span-2 grid grid-cols-[4.5rem_5.5rem_1fr] gap-2 items-center">
                          <input className={invInput} inputMode="numeric" title="Pages" aria-label="Pages" placeholder="Pages" value={l.pages} onChange={(e) => setInvLine(i, { pages: e.target.value })} />
                          <input className={invInput} inputMode="decimal" aria-label="Price" placeholder="₾ price" value={l.price} onChange={(e) => setInvLine(i, { price: e.target.value })} />
                          <div className="flex items-center gap-3 justify-end text-xs text-slate-600">
                            {[
                              { v: true, text: 'Notarized' },
                              { v: false, text: 'No notary' },
                            ].map((o) => (
                              <label key={String(o.v)} className="inline-flex items-center gap-1 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`inv-notary-${i}`}
                                  checked={l.notarized === o.v}
                                  onChange={() => setInvLine(i, { notarized: o.v })}
                                  className="accent-indigo-600"
                                />
                                {o.text}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <button
                      type="button"
                      onClick={() => setInvLines((ls) => [...ls, emptyInvLine()])}
                      className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800"
                    >
                      <Plus size={14} /> Add line
                    </button>
                    <p className="text-sm text-slate-500">
                      Total <span className="ml-1 font-semibold text-slate-900">{invTotal.toFixed(2)} ₾</span>
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Due date</label>
                      <input type="date" className={invInput} value={invDue} onChange={(e) => setInvDue(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Language</label>
                      <div className="inline-flex w-full rounded-lg border border-slate-200 overflow-hidden">
                        {INV_LANGS.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => setInvLang(o.value)}
                            className={`flex-1 px-2 py-2 text-sm ${invLang === o.value ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <input className={`${invInput} mt-2`} placeholder="Notes (optional)" value={invNotes} onChange={(e) => setInvNotes(e.target.value)} />
                  <div className="flex gap-2 mt-3">
                    {(['pdf', 'docx'] as InvoiceFormat[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        disabled={invBusy !== null || !contact}
                        onClick={() => generateInvoice(f)}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-60"
                      >
                        {invBusy === f ? <Loader2 size={14} className="animate-spin" /> : f === 'pdf' ? <FileText size={14} /> : <FileType2 size={14} />}
                        Download .{f}
                      </button>
                    ))}
                  </div>
                  {invError && <p className="mt-2 text-sm text-red-600">{invError}</p>}
                </div>

                {/* History */}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1.5">
                    <Clock size={14} className="text-slate-400" /> History
                  </p>
                  {loading ? (
                    <p className="text-sm text-slate-400">Loading…</p>
                  ) : activities.length === 0 ? (
                    <p className="text-sm text-slate-400">No activity yet.</p>
                  ) : (
                    <ol className="space-y-3">
                      {activities.map((a) => (
                        <li key={a.id} className="flex gap-3 text-sm">
                          <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                          <div className="flex-1">
                            <ActivityLine activity={a} />
                            <p className="text-xs text-slate-400 mt-0.5">
                              {formatDateTime(a.created_at)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
    </div>
  );
}

function ActivityLine({ activity: a }: { activity: Activity }) {
  if (a.type === 'status_change') {
    return (
      <p className="text-slate-700 flex items-center gap-1.5 flex-wrap">
        Status changed
        {a.from_stage && (
          <>
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STAGE_BADGE[a.from_stage as Stage] ?? 'bg-slate-100 text-slate-600'}`}>
              {STAGE_LABELS[a.from_stage as Stage] ?? a.from_stage}
            </span>
            <ArrowRight size={12} className="text-slate-400" />
          </>
        )}
        <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STAGE_BADGE[a.to_stage as Stage] ?? 'bg-slate-100 text-slate-600'}`}>
          {STAGE_LABELS[a.to_stage as Stage] ?? a.to_stage}
        </span>
        {a.comment && <span className="text-slate-500">— {a.comment}</span>}
      </p>
    );
  }
  if (a.type === 'interest_change') {
    const lv = (v: string | null) => (v === null ? 'not set' : interestLabel(v));
    return (
      <p className="text-slate-700 flex items-center gap-1.5 flex-wrap">
        Interest changed
        <span className="text-slate-500">{lv(a.from_stage)}</span>
        <ArrowRight size={12} className="text-slate-400" />
        <span className="font-medium">{lv(a.to_stage)}</span>
      </p>
    );
  }
  if (a.type === 'follow_up') {
    return (
      <p className="text-slate-700">
        <span className="inline-flex items-center gap-1 font-medium text-amber-700">
          <CalendarClock size={13} /> Follow-up
        </span>{' '}
        scheduled for <span className="font-medium">{formatDate(a.follow_up_date)}</span>
        {a.comment && <span className="text-slate-500"> — {a.comment}</span>}
      </p>
    );
  }
  return (
    <p className="text-slate-700">
      <MessageSquare size={13} className="inline text-slate-400 mr-1" />
      {a.comment}
    </p>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
