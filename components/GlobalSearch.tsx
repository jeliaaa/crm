'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';
import { stageBadge, stageLabel } from '@/lib/stages';

// Sidebar omnibox. Type anything — a name, a phone number, an email, a tax
// ID, a street, a word from the notes — and matching contacts appear as you
// type. Enter opens the highlighted one, or the full result list on
// /contacts when nothing is highlighted.

type Hit = {
  id: string;
  name: string;
  identification_number: string | null;
  head: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  category: string | null;
  stage: string;
};

// Fields offered as the "matched on" line under the name, best first. name
// is missing on purpose — it's already the title of the row.
const DETAIL_FIELDS: { field: keyof Hit; label: string }[] = [
  { field: 'phone', label: 'Phone' },
  { field: 'mobile', label: 'Mobile' },
  { field: 'email', label: 'Email' },
  { field: 'identification_number', label: 'ID №' },
  { field: 'head', label: 'Head' },
  { field: 'website', label: 'Website' },
  { field: 'address', label: 'Address' },
  { field: 'city', label: 'City' },
  { field: 'region', label: 'Region' },
  { field: 'category', label: 'Industry' },
];

const MIN_QUERY = 2;

function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

// Which field the query actually hit, so a search for a phone number
// explains itself instead of showing a company name and leaving the person
// to guess. Falls back to the first detail the contact has.
function matchLine(hit: Hit, query: string): { label: string; value: string } | null {
  const needle = query.trim().toLowerCase();
  const needleDigits = digitsOf(needle);
  const present = DETAIL_FIELDS.filter(({ field }) => {
    const value = hit[field];
    return typeof value === 'string' && value.trim() !== '';
  });

  const matched = present.find(({ field }) => {
    const value = String(hit[field]);
    if (needle && value.toLowerCase().includes(needle)) return true;
    // Stored numbers keep whatever spacing they were scraped with, so digits
    // get compared against digits — the last 9 of them, the length of a
    // Georgian national number.
    if (needleDigits.length >= 4) return digitsOf(value).includes(needleDigits.slice(-9));
    return false;
  });

  const chosen = matched ?? present[0];
  return chosen ? { label: chosen.label, value: String(hit[chosen.field]) } : null;
}

export default function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced fetch. The abort controller drops the reply to a query the
  // person has already typed past, so results can't arrive out of order.
  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_QUERY) {
      setHits([]);
      setCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        setHits(json.data ?? []);
        setCount(json.count ?? 0);
      } catch {
        if (controller.signal.aborted) return;
        setHits([]);
        setCount(0);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => setActive(-1), [hits]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  // Cmd/Ctrl-K from anywhere in the CRM.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    inputRef.current?.blur();
    router.push(href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, hits.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const term = query.trim();
      if (active >= 0 && hits[active]) go(`/contacts/${hits[active].id}`);
      else if (term) go(`/contacts?q=${encodeURIComponent(term)}`);
    }
  }

  const term = query.trim();
  const showPanel = open && term.length >= MIN_QUERY;

  return (
    <div ref={containerRef} className="relative px-3 pt-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search everything…"
          aria-label="Search contacts by any field"
          className="w-full pl-8 pr-11 py-2 rounded-lg bg-slate-800 text-sm text-white placeholder:text-slate-500 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none">
          {loading ? <Loader2 size={12} className="animate-spin" /> : 'Ctrl K'}
        </span>
      </div>

      {showPanel && (
        <div className="absolute left-3 top-full mt-2 w-[420px] max-h-[70vh] overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200 z-50 py-1">
          {hits.map((hit, i) => {
            const detail = matchLine(hit, term);
            return (
              <button
                key={hit.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(`/contacts/${hit.id}`)}
                className={`w-full text-left px-3 py-2 flex items-start gap-2 ${
                  active === i ? 'bg-indigo-50' : 'hover:bg-slate-50'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800 truncate">{hit.name}</span>
                  {detail && (
                    <span className="block text-xs text-slate-500 truncate">
                      <span className="text-slate-400">{detail.label}:</span> {detail.value}
                    </span>
                  )}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${stageBadge(hit.stage)}`}>
                  {stageLabel(hit.stage)}
                </span>
              </button>
            );
          })}

          {!hits.length && (
            <p className="px-3 py-4 text-sm text-slate-400">
              {loading ? 'Searching…' : `Nothing matches “${term}”.`}
            </p>
          )}

          {hits.length > 0 && (
            <button
              type="button"
              onClick={() => go(`/contacts?q=${encodeURIComponent(term)}`)}
              className="w-full text-left px-3 py-2 mt-1 border-t border-slate-100 text-xs text-indigo-600 hover:bg-slate-50"
            >
              {count > hits.length ? `See all ${count.toLocaleString()} matches →` : 'Open in contacts →'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
