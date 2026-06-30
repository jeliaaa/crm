'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

type Category = { code: string; name: string };

type ScrapeResult = {
  scraped: number;
  skippedNoContact: number;
  inserted: number;
  updated: number;
  duplicates: number;
  total: number;
  totalPages: number;
  currentPage: number;
};

type ContactFilter = 'phone' | 'email' | 'phoneOrEmail' | 'none';

type LegalForm = { id: number; abbreviation: string; name: string };

const LIMIT = 100; // companies per request

export default function ScrapePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Category | null>(null);
  const [legalForms, setLegalForms] = useState<LegalForm[]>([]);
  const [selectedForms, setSelectedForms] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [contactFilter, setContactFilter] = useState<ContactFilter>('phoneOrEmail');
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState('');
  const abortRef = useRef(false);
  const router = useRouter();

  function resetProgress() {
    setPage(1);
    setTotalPages(null);
    setTotal(null);
  }

  useEffect(() => {
    setMetaLoading(true);
    fetch('/api/scrape/meta')
      .then((r) => r.json())
      .then(({ categories: cats, legalForms: forms, error: metaError }) => {
        setCategories(cats ?? []);
        setLegalForms(forms ?? []);
        if (cats?.[0]) setSelected(cats[0]);
        if (metaError && !cats?.length) {
          setError(`Could not load industries: ${metaError}`);
        }
      })
      .catch((e) => setError(`Could not reach /api/scrape/meta: ${e.message}`))
      .finally(() => setMetaLoading(false));
  }, []);

  function toggleForm(id: number) {
    setSelectedForms((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    resetProgress();
  }

  async function doScrape(p: number): Promise<ScrapeResult> {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: selected?.code,
        sectionName: selected?.name,
        page: p,
        limit: LIMIT,
        contactFilter,
        legalForms: selectedForms,
      }),
    });
    if (res.status === 429) {
      const { retryAfterMs } = await res.json();
      const err = new Error('rate_limited') as Error & { retryAfterMs: number };
      err.retryAfterMs = retryAfterMs || 60000;
      throw err;
    }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  function applyResult(p: number, data: ScrapeResult) {
    setTotalPages(data.totalPages);
    setTotal(data.total);
    setPage(p + 1);
    setLog((prev) => [
      `[Page ${p}/${data.totalPages}] +${data.inserted} new · ${data.updated} filled · ${data.duplicates} dupes · ${data.skippedNoContact} no-contact`,
      ...prev,
    ]);
    router.refresh();
  }

  async function scrapeOne() {
    if (!selected || loading) return;
    setLoading(true);
    setError('');
    try {
      const data = await doScrape(page);
      applyResult(page, data);
    } catch (e: unknown) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  }

  async function scrapeAll() {
    if (!selected || loading) return;
    abortRef.current = false;
    setLoading(true);
    setError('');
    let p = page;
    let max = totalPages ?? Infinity;

    while (p <= max && !abortRef.current) {
      try {
        const data = await doScrape(p);
        max = data.totalPages;
        applyResult(p, data);
        p++;
        if (p <= max) await sleep(400);
      } catch (e: unknown) {
        const rl = e as Error & { retryAfterMs?: number };
        if (rl?.retryAfterMs) {
          const secs = Math.ceil(rl.retryAfterMs / 1000);
          setLog((prev) => [`Rate limited — waiting ${secs}s before continuing…`, ...prev]);
          await sleep(rl.retryAfterMs + 500);
          continue; // retry same page
        }
        handleError(e);
        break;
      }
    }
    setLoading(false);
  }

  function handleError(e: unknown) {
    setError(e instanceof Error ? e.message : 'Scrape failed');
  }

  function stop() {
    abortRef.current = true;
  }

  const done = totalPages !== null && page > totalPages;
  const remaining = totalPages !== null ? Math.max(0, totalPages - page + 1) : null;

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Import Businesses</h1>
      <p className="text-slate-500 text-sm mb-6">
        Official data from the Georgian Statistical Business Register, by industry (NACE Rev.2).
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Industry</label>
          {metaLoading ? (
            <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
          ) : (
            <select
              value={selected?.code ?? ''}
              onChange={(e) => {
                const c = categories.find((i) => i.code === e.target.value);
                if (c) { setSelected(c); resetProgress(); }
              }}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-700">
              Legal form{' '}
              <span className="text-slate-400 font-normal">
                {selectedForms.length ? `(${selectedForms.length} selected)` : '(all)'}
              </span>
            </label>
            {selectedForms.length > 0 && (
              <button
                type="button"
                onClick={() => { setSelectedForms([]); resetProgress(); }}
                className="text-xs text-indigo-600 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          {metaLoading ? (
            <div className="h-24 bg-slate-100 rounded-lg animate-pulse" />
          ) : (
            <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {legalForms.map((f) => (
                <label
                  key={f.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedForms.includes(f.id)}
                    onChange={() => toggleForm(f.id)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                  />
                  <span className="font-medium text-slate-700 shrink-0">{f.abbreviation}</span>
                  <span className="text-slate-400 truncate">{f.name}</span>
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1">
            Leave all unchecked to import every legal form. e.g. შპს = LLC, იმ = sole proprietor.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Contact filter</label>
          <select
            value={contactFilter}
            onChange={(e) => setContactFilter(e.target.value as ContactFilter)}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="phoneOrEmail">Has phone or email (recommended)</option>
            <option value="phone">Has phone only (~0.5% of records)</option>
            <option value="email">Has email only</option>
            <option value="none">No filter — import everything</option>
          </select>
          <p className="text-xs text-slate-400 mt-1">
            The official register rarely lists phone numbers, so phone-only keeps very few.
          </p>
        </div>

        {total !== null && (
          <div className={`text-sm rounded-lg px-4 py-3 ${done ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
            {done
              ? `All ${total.toLocaleString()} businesses imported across ${totalPages} pages.`
              : `${total.toLocaleString()} businesses in this industry · ${remaining} of ${totalPages} pages left (${LIMIT}/page).`}
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
        )}

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={scrapeOne}
            disabled={loading || !selected || done}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {loading ? 'Importing…' : totalPages ? `Import page ${page}` : 'Import first 100'}
          </button>

          {!done && (
            <button
              onClick={loading ? stop : scrapeAll}
              disabled={!selected}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors ${
                loading
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-slate-800 hover:bg-slate-900 text-white'
              }`}
            >
              {loading ? 'Stop' : remaining ? `Import all remaining (${remaining} pages)` : 'Import entire industry'}
            </button>
          )}
        </div>

        <p className="text-xs text-slate-400">
          The register API is rate-limited (~50 requests/window). &ldquo;Import all&rdquo; automatically
          pauses and resumes when the limit is hit, so large industries just take a while.
        </p>
      </div>

      {log.length > 0 && (
        <div className="mt-6 bg-slate-900 rounded-xl p-4 font-mono text-xs text-green-400 space-y-1 max-h-64 overflow-y-auto">
          <div className="text-slate-500 mb-2">— import log —</div>
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
