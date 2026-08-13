'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';

// Clears the red "needs an action" flag without moving the contact out of the
// Called + answered stage.
export default function MarkHandledButton({ contactId }: { contactId: string }) {
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function markHandled() {
    setSaving(true);
    try {
      await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_required: false }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      onClick={markHandled}
      disabled={saving}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 transition-colors"
    >
      <Check size={13} />
      {saving ? 'Saving…' : 'Mark handled'}
    </button>
  );
}
