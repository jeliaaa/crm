'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RATING_VALUES } from '@/lib/interest';

// Per-contact rating 1-5.
export default function RatingSelect({
  contactId,
  value,
}: {
  contactId: string;
  value: number | null;
}) {
  const [rating, setRating] = useState<string>(value === null ? '' : String(value));
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function change(next: string) {
    const prev = rating;
    setRating(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'rating_change', toLevel: next === '' ? null : Number(next) }),
      });
      if (!res.ok) setRating(prev);
      else router.refresh();
    } catch {
      setRating(prev);
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={rating}
      disabled={saving}
      onChange={(e) => change(e.target.value)}
      title="Rating"
      className="w-28 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
    >
      <option value="">Rating: —</option>
      {RATING_VALUES.map((r) => (
        <option key={r} value={r}>{'★'.repeat(r)} ({r}/5)</option>
      ))}
    </select>
  );
}
