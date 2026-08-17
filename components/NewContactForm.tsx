'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { STAGE_ORDER, STAGE_LABELS, STAGE_BADGE_BORDER, type Stage } from '@/lib/stages';
import { AlertTriangle, Check } from 'lucide-react';

const EMPTY = {
  name: '',
  identification_number: '',
  head: '',
  phone: '',
  mobile: '',
  email: '',
  website: '',
  address: '',
  city: '',
  region: '',
  category: '',
  activity_code: '',
  ownership_type: '',
  business_size: '',
  established_year: '',
  description: '',
  notes: '',
};

type Fields = typeof EMPTY;
type Created = { id: string; name: string };

const INPUT =
  'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

function Field({
  label,
  name,
  value,
  onChange,
  ...rest
}: {
  label: string;
  name: keyof Fields;
  value: string;
  onChange: (name: keyof Fields, value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'name' | 'value'>) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        className={INPUT}
      />
    </label>
  );
}

export default function NewContactForm({
  categories,
  cities,
}: {
  categories: string[];
  cities: string[];
}) {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [stage, setStage] = useState<Stage>('lead');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Created | null>(null);
  const [duplicates, setDuplicates] = useState<Created[]>([]);
  const router = useRouter();

  function set(name: keyof Fields, value: string) {
    setFields((f) => ({ ...f, [name]: value }));
  }

  async function save() {
    if (!fields.name.trim()) {
      setError('Name is required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, stage }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Could not save the contact.');
        return;
      }

      setCreated({ id: data.contact.id, name: data.contact.name });
      setDuplicates(data.duplicates ?? []);
      setFields(EMPTY);
      setStage('lead');
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {created && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
          <p className="flex items-center gap-2 text-green-800 font-medium">
            <Check size={16} /> Saved “{created.name}”.
          </p>
          <p className="mt-1 text-green-700">
            <Link href={`/contacts/${created.id}`} className="underline hover:no-underline">
              Open the contact
            </Link>{' '}
            — or keep filling in the form below to add another.
          </p>
          {duplicates.length > 0 && (
            <p className="mt-2 flex items-start gap-2 text-amber-700">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                That phone number is already on{' '}
                {duplicates.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 && ', '}
                    <Link href={`/contacts/${d.id}`} className="underline hover:no-underline">
                      {d.name}
                    </Link>
                  </span>
                ))}
                . A call to it will update every contact that shares the number.
              </span>
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-5">
        <h2 className="font-semibold text-slate-900">Company</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field
              label="Name *"
              name="name"
              value={fields.name}
              onChange={set}
              placeholder="შპს Example"
              autoFocus
            />
          </div>
          <Field
            label="ID number"
            name="identification_number"
            value={fields.identification_number}
            onChange={set}
            placeholder="404123456"
          />
          <Field label="Head / contact person" name="head" value={fields.head} onChange={set} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-5">
        <h2 className="font-semibold text-slate-900">Contact details</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Phone"
            name="phone"
            value={fields.phone}
            onChange={set}
            placeholder="577 20 84 18"
            inputMode="tel"
          />
          <Field label="Mobile" name="mobile" value={fields.mobile} onChange={set} inputMode="tel" />
          <Field label="Email" name="email" value={fields.email} onChange={set} type="email" />
          <Field label="Website" name="website" value={fields.website} onChange={set} placeholder="example.ge" />
          <div className="col-span-2">
            <Field label="Address" name="address" value={fields.address} onChange={set} />
          </div>
          <Field label="City" name="city" value={fields.city} onChange={set} list="city-options" />
          <Field label="Region" name="region" value={fields.region} onChange={set} />
        </div>
        <p className="text-xs text-slate-400">
          Calls are matched on the last 9 digits, so spacing and the +995 prefix don&apos;t matter.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-5">
        <h2 className="font-semibold text-slate-900">Business</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Industry"
            name="category"
            value={fields.category}
            onChange={set}
            list="category-options"
          />
          <Field
            label="Activity code"
            name="activity_code"
            value={fields.activity_code}
            onChange={set}
            placeholder="70.20.2"
          />
          <Field label="Ownership type" name="ownership_type" value={fields.ownership_type} onChange={set} />
          <Field label="Business size" name="business_size" value={fields.business_size} onChange={set} />
          <Field
            label="Established"
            name="established_year"
            value={fields.established_year}
            onChange={set}
            type="number"
            min={1800}
            max={new Date().getFullYear()}
            placeholder="2014"
          />
        </div>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1.5">Description</span>
          <textarea
            value={fields.description}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            className={`${INPUT} resize-none`}
          />
        </label>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-5">
        <h2 className="font-semibold text-slate-900">CRM</h2>
        <div>
          <span className="block text-sm font-medium text-slate-700 mb-2">Pipeline stage</span>
          <div className="flex flex-wrap gap-2">
            {STAGE_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStage(s)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  stage === s
                    ? STAGE_BADGE_BORDER[s]
                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {STAGE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1.5">Notes</span>
          <textarea
            value={fields.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={4}
            placeholder="Anything worth remembering about this contact…"
            className={`${INPUT} resize-none`}
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !fields.name.trim()}
          className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Saving…' : 'Create contact'}
        </button>
        <Link href="/contacts" className="text-sm text-slate-500 hover:text-slate-900">
          Cancel
        </Link>
      </div>

      <datalist id="category-options">
        {categories.map((c) => <option key={c} value={c} />)}
      </datalist>
      <datalist id="city-options">
        {cities.map((c) => <option key={c} value={c} />)}
      </datalist>
    </div>
  );
}
