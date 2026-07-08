'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

type Ctx = {
  selected: Set<string>;
  toggle: (id: string) => void;
  isSelected: (id: string) => boolean;
  toggleAll: () => void;
  allSelected: boolean;
  count: number;
};

const SelectionContext = createContext<Ctx | null>(null);

function useSelection() {
  const c = useContext(SelectionContext);
  if (!c) throw new Error('useSelection must be used within SelectionProvider');
  return c;
}

export function SelectionProvider({
  allIds,
  children,
}: {
  allIds: string[];
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)));
  }, [allIds]);

  const value = useMemo<Ctx>(
    () => ({
      selected,
      toggle,
      isSelected: (id) => selected.has(id),
      toggleAll,
      allSelected: allIds.length > 0 && selected.size === allIds.length,
      count: selected.size,
    }),
    [selected, toggle, toggleAll, allIds.length]
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function SelectCheckbox({ id }: { id: string }) {
  const { isSelected, toggle } = useSelection();
  return (
    <input
      type="checkbox"
      checked={isSelected(id)}
      onChange={() => toggle(id)}
      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
      aria-label="Select contact"
    />
  );
}

export function SelectAllCheckbox() {
  const { allSelected, toggleAll } = useSelection();
  return (
    <input
      type="checkbox"
      checked={allSelected}
      onChange={toggleAll}
      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
      aria-label="Select all on this page"
    />
  );
}

export function BulkDeleteButton() {
  const { selected, count } = useSelection();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  if (count === 0) return null;

  async function del() {
    setDeleting(true);
    await fetch('/api/contacts/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected) }),
    });
    setDeleting(false);
    setConfirming(false);
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">Delete {count}?</span>
        <button
          onClick={del}
          disabled={deleting}
          className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-3 py-2 text-slate-600 rounded-lg text-sm hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
    >
      <Trash2 size={14} /> Delete chosen ({count})
    </button>
  );
}
