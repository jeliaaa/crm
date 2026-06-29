'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteAllButton() {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function deleteAll() {
    setLoading(true);
    await fetch('/api/contacts', { method: 'DELETE' });
    setLoading(false);
    setConfirming(false);
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">Are you sure?</span>
        <button
          onClick={deleteAll}
          disabled={loading}
          className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? 'Deleting…' : 'Yes, delete all'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-3 py-1.5 text-slate-600 rounded-lg text-sm hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="px-4 py-2 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
    >
      Delete all
    </button>
  );
}
