'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { INTEREST_LEVELS } from '@/lib/interest';

// Second status for Called + answered contacts (interest level 0-5).
export default function InterestSelect({
  contactId,
  value,
}: {
  contactId: string;
  value: number | null;
}) {
  const [level, setLevel] = useState<string>(value === null ? '' : String(value));
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function change(next: string) {
    const prev = level;
    setLevel(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'interest_change', toLevel: next === '' ? null : Number(next) }),
      });
      if (!res.ok) setLevel(prev);
      else router.refresh();
    } catch {
      setLevel(prev);
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={level}
      disabled={saving}
      onChange={(e) => change(e.target.value)}
      title="Interest level"
      className="w-56 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 truncate"
    >
      <option value="">Interest: not set</option>
      {INTEREST_LEVELS.map((l) => (
        <option key={l.value} value={l.value}>{l.value} - {l.label}</option>
      ))}
    </select>
  );
}
