'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';

type Activity = {
  id: number;
  code: string;
  name: string;
  typeId: number; // 1 section, 3 division, 4 group, 5 class, 6 subclass
  parentId: number | null;
};

const LEVEL_LABEL: Record<number, string> = {
  1: 'Industry (section)',
  3: 'Division',
  4: 'Group',
  5: 'Class',
  6: 'Subclass',
};

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

type Source = 'geostat' | 'ssge';

const LIMIT = 100; // companies per request (geostat)
const SSGE_PAGE_SIZE = 20; // agencies per request (ss.ge)

export default function ScrapePage() {
  const [source, setSource] = useState<Source>('geostat');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [chain, setChain] = useState<Activity[]>([]); // section → … → deepest
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
  const ssgeTokenRef = useRef<string | null>(null);
  const router = useRouter();

  const canImport = source === 'ssge' || chain.length > 0;

  // parentId -> child activities (parentId null = top-level sections)
  const childrenByParent = useMemo(() => {
    const m = new Map<number | null, Activity[]>();
    for (const a of activities) {
      const key = a.parentId;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(a);
    }
    Array.from(m.values()).forEach((list) =>
      list.sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }))
    );
    return m;
  }, [activities]);

  // The chain of drill-down selects to render: one per chosen level, plus the
  // next level's options while the previous level is selected.
  const levels = useMemo(() => {
    const out: { index: number; options: Activity[] }[] = [];
    for (let i = 0; ; i++) {
      if (i > 0 && !chain[i - 1]) break;
      const parentId = i === 0 ? null : chain[i - 1].id;
      const options = childrenByParent.get(parentId) ?? [];
      if (options.length === 0) break;
      out.push({ index: i, options });
      if (!chain[i]) break; // this level not chosen yet → stop here
    }
    return out;
  }, [chain, childrenByParent]);

  function resetProgress() {
    setPage(1);
    setTotalPages(null);
    setTotal(null);
  }

  // Rebuild the drill-down chain up to `level`, appending the chosen activity.
  function selectAtLevel(level: number, activity: Activity | null) {
    setChain((prev) => (activity ? [...prev.slice(0, level), activity] : prev.slice(0, level)));
    resetProgress();
  }

  function changeSource(s: Source) {
    setSource(s);
    setError('');
    setLog([]);
    ssgeTokenRef.current = null;
    resetProgress();
  }

  useEffect(() => {
    setMetaLoading(true);
    fetch('/api/scrape/meta')
      .then((r) => r.json())
      .then(({ activities: acts, legalForms: forms, error: metaError }) => {
        setActivities(acts ?? []);
        setLegalForms(forms ?? []);
        const firstSection = (acts ?? []).find((a: Activity) => a.typeId === 1);
        if (firstSection) setChain([firstSection]);
        if (metaError && !acts?.length) {
          setError(`Could not load activities: ${metaError}`);
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
    if (source === 'ssge') {
      const res = await fetch('/api/import-ssge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: p, pageSize: SSGE_PAGE_SIZE, token: ssgeTokenRef.current }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.token) ssgeTokenRef.current = data.token;
      return data;
    }

    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: chain[chain.length - 1]?.code,
        sectionName: chain[0]?.name,
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
    if (!canImport || loading) return;
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
    if (!canImport || loading) return;
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
        {source === 'geostat'
          ? 'Official data from the Georgian Statistical Business Register, by industry (NACE Rev.2).'
          : 'Real-estate agencies from home.ss.ge (name, phone, email).'}
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Source</label>
          <div className="flex gap-2">
            {([
              ['geostat', 'Business Register'],
              ['ssge', 'ss.ge Agencies'],
            ] as [Source, string][]).map(([s, label]) => (
              <button
                key={s}
                onClick={() => changeSource(s)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  source === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {source === 'ssge' && (
          <div className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-4 py-3">
            Imports all real-estate agencies as category{' '}
            <span className="font-medium">&ldquo;Agencies from HOME.SS&rdquo;</span>. Each page fetches{' '}
            {SSGE_PAGE_SIZE} agencies plus their emails, so a full run takes a few minutes.
          </div>
        )}

        {source === 'geostat' && (
        <>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">Activity (NACE Rev.2)</label>
          {metaLoading ? (
            <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
          ) : (
            levels.map(({ index, options }) => (
              <div key={index}>
                <label className="block text-xs text-slate-400 mb-1">
                  {LEVEL_LABEL[options[0].typeId] ?? 'Activity'}
                </label>
                <select
                  value={chain[index]?.id ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    selectAtLevel(index, val ? options.find((o) => o.id === Number(val)) ?? null : null);
                  }}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  {index > 0 && (
                    <option value="">
                      — all of {chain[index - 1].code} —
                    </option>
                  )}
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} — {o.name}
                    </option>
                  ))}
                </select>
              </div>
            ))
          )}
          {chain.length > 0 && (
            <p className="text-xs text-slate-400">
              Importing code <span className="font-mono">{chain[chain.length - 1].code}</span> ·
              stored under industry <span className="font-medium">{chain[0].name}</span>
            </p>
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
        </>
        )}

        {total !== null && (
          <div className={`text-sm rounded-lg px-4 py-3 ${done ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
            {done
              ? `All ${total.toLocaleString()} ${source === 'ssge' ? 'agencies' : 'businesses'} imported across ${totalPages} pages.`
              : `${total.toLocaleString()} ${source === 'ssge' ? 'agencies' : 'businesses in this industry'} · ${remaining} of ${totalPages} pages left.`}
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
        )}

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={scrapeOne}
            disabled={loading || !canImport || done}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {loading
              ? 'Importing…'
              : totalPages
              ? `Import page ${page}`
              : source === 'ssge'
              ? `Import first ${SSGE_PAGE_SIZE}`
              : 'Import first 100'}
          </button>

          {!done && (
            <button
              onClick={loading ? stop : scrapeAll}
              disabled={!canImport}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors ${
                loading
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-slate-800 hover:bg-slate-900 text-white'
              }`}
            >
              {loading
                ? 'Stop'
                : remaining
                ? `Import all remaining (${remaining} pages)`
                : source === 'ssge'
                ? 'Import all agencies'
                : 'Import entire industry'}
            </button>
          )}
        </div>

        <p className="text-xs text-slate-400">
          {source === 'geostat'
            ? 'The register API is rate-limited (~50 requests/window). “Import all” automatically pauses and resumes when the limit is hit, so large industries just take a while.'
            : 'Each agency’s email is fetched individually, so “Import all” runs at a steady pace across all pages — leave it running.'}
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
