'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Contact, Stage } from '@/lib/supabase';
import { ArrowLeft, Phone, Globe, MapPin, Tag, ExternalLink } from 'lucide-react';

const STAGES: Stage[] = ['lead', 'contacted', 'qualified', 'won', 'lost'];

const STAGE_COLORS: Record<Stage, string> = {
  lead: 'bg-blue-100 text-blue-700 border-blue-200',
  contacted: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  qualified: 'bg-purple-100 text-purple-700 border-purple-200',
  won: 'bg-green-100 text-green-700 border-green-200',
  lost: 'bg-red-100 text-red-700 border-red-200',
};

export default function ContactDetail({ contact }: { contact: Contact }) {
  const [stage, setStage] = useState<Stage>(contact.stage);
  const [notes, setNotes] = useState(contact.notes || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  async function save() {
    setSaving(true);
    await fetch(`/api/contacts/${contact.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, notes }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  const websiteHref = contact.website
    ? contact.website.startsWith('http') ? contact.website : `https://${contact.website}`
    : null;

  return (
    <div className="p-8 max-w-2xl">
      <Link href="/contacts" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-6">
        <ArrowLeft size={14} /> Back to contacts
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden mb-6">
        <div className="p-6 border-b border-slate-100">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">{contact.name}</h1>
          {contact.established_year && (
            <p className="text-slate-400 text-sm">Est. {contact.established_year}</p>
          )}
        </div>

        <div className="p-6 grid grid-cols-2 gap-4 text-sm">
          {contact.phone && (
            <div className="flex items-center gap-2 text-slate-700">
              <Phone size={14} className="text-slate-400 shrink-0" />
              <a href={`tel:${contact.phone}`} className="hover:text-indigo-600">{contact.phone}</a>
            </div>
          )}
          {contact.mobile && contact.mobile !== contact.phone && (
            <div className="flex items-center gap-2 text-slate-700">
              <Phone size={14} className="text-slate-400 shrink-0" />
              <a href={`tel:${contact.mobile}`} className="hover:text-indigo-600">{contact.mobile}</a>
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
          {(contact.city || contact.categories?.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 col-span-2">
              {contact.city && (
                <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                  <MapPin size={10} /> {contact.city}
                </span>
              )}
              {contact.categories?.map((cat) => (
                <span key={cat} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full">
                  <Tag size={10} /> {cat}
                </span>
              ))}
            </div>
          )}
          {contact.description && (
            <p className="text-slate-500 text-sm col-span-2 border-t border-slate-100 pt-4 mt-2">
              {contact.description}
            </p>
          )}
          {contact.source_url && (
            <div className="col-span-2">
              <a href={contact.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 hover:text-indigo-500 flex items-center gap-1">
                View on GeorgiaYP <ExternalLink size={10} />
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-5">
        <h2 className="font-semibold text-slate-900">CRM</h2>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Pipeline stage</label>
          <div className="flex flex-wrap gap-2">
            {STAGES.map((s) => (
              <button
                key={s}
                onClick={() => setStage(s)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  stage === s
                    ? STAGE_COLORS[s]
                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder="Add notes about this contact…"
            className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {saved && <span className="text-green-600 text-sm">Saved!</span>}
        </div>
      </div>
    </div>
  );
}
