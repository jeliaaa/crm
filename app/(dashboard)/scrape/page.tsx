'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

type ScrapeMode = 'category' | 'location';

type ScrapeResult = {
  scraped: number;
  inserted: number;
  duplicates: number;
  totalPages: number;
  currentPage: number;
};

type MetaItem = { name: string; slug: string; count: number };

export default function ScrapePage() {
  const [mode, setMode] = useState<ScrapeMode>('category');
  const [selected, setSelected] = useState<MetaItem | null>(null);
  const [deep, setDeep] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [categories, setCategories] = useState<MetaItem[]>([]);
  const [cities, setCities] = useState<MetaItem[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState('');
  const abortRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    setMetaLoading(true);
    fetch('/api/scrape/meta')
      .then((r) => r.json())
      .then(({ categories: cats, cities: ctys, error: metaError }) => {
        setCategories(cats ?? []);
        setCities(ctys ?? []);
        if (cats?.[0]) setSelected(cats[0]);
        if (metaError && !cats?.length) {
          setError(`Could not load categories: ${metaError}. The site is likely blocking the server's IP — set SCRAPER_API_KEY in Vercel to route through a proxy.`);
        }
      })
      .catch((e) => setError(`Could not reach /api/scrape/meta: ${e.message}`))
      .finally(() => setMetaLoading(false));
  }, []);

  useEffect(() => {
    const items = mode === 'category' ? categories : cities;
    if (items.length) setSelected(items[0]);
    setPage(1);
    setTotalPages(null);
  }, [mode, categories, cities]);

  const items = mode === 'category' ? categories : cities;

  async function doScrape(p: number): Promise<ScrapeResult> {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, slug: selected?.slug, label: selected?.name, page: p, deep }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function scrapeOne() {
    if (!selected || loading) return;
    setLoading(true);
    setError('');
    try {
      const data = await doScrape(page);
      setTotalPages(data.totalPages);
      setPage(page + 1);
      setLog((prev) => [
        `[Page ${page}] ${data.inserted} new · ${data.duplicates} dupes · ${data.scraped} scraped`,
        ...prev,
      ]);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scrape failed');
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
    let total = totalPages ?? 9999;

    while (p <= total && !abortRef.current) {
      try {
        const data = await doScrape(p);
        total = data.totalPages;
        setTotalPages(data.totalPages);
        setPage(p + 1);
        setLog((prev) => [
          `[Page ${p}/${data.totalPages}] ${data.inserted} new · ${data.duplicates} dupes`,
          ...prev,
        ]);
        router.refresh();
        p++;
        if (p <= total) await new Promise((r) => setTimeout(r, 800));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Scrape failed');
        break;
      }
    }

    setLoading(false);
  }

  function stop() {
    abortRef.current = true;
  }

  const done = totalPages !== null && page > totalPages;

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Scrape Businesses</h1>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Scrape by</label>
          <div className="flex gap-2">
            {(['category', 'location'] as ScrapeMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === m
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {m === 'category' ? 'Category' : 'City'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            {mode === 'category' ? 'Category' : 'City'}
          </label>
          {metaLoading ? (
            <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
          ) : items.length > 0 ? (
            <select
              value={selected?.slug ?? ''}
              onChange={(e) => {
                const item = items.find((i) => i.slug === e.target.value);
                if (item) { setSelected(item); setPage(1); setTotalPages(null); }
              }}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {items.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}{item.count > 0 ? ` (${item.count.toLocaleString()})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={selected?.slug ?? ''}
              onChange={(e) => setSelected({ name: e.target.value, slug: e.target.value, count: 0 })}
              placeholder={mode === 'category' ? 'e.g. Advertising' : 'e.g. Tbilisi'}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
          {selected && (
            <p className="text-xs text-slate-400 mt-1">
              URL: /{mode === 'category' ? 'category' : 'location'}/{selected.slug}
            </p>
          )}
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={deep}
            onChange={(e) => setDeep(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">Deep scrape</span> — visit each company page for phone, website &amp; email
            <span className="text-slate-400 ml-1">(~3× slower, max 15 companies/page)</span>
          </span>
        </label>

        {totalPages !== null && (
          <div className={`text-sm rounded-lg px-4 py-3 ${done ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
            {done
              ? `All ${totalPages} pages done!`
              : `Page ${page - 1} of ${totalPages} scraped — ${totalPages - page + 1} remaining`}
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
            {loading ? 'Scraping…' : totalPages ? `Scrape page ${page}` : 'Start scraping'}
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
              {loading ? 'Stop' : totalPages ? `Scrape all remaining (${totalPages - page + 1})` : 'Scrape all pages'}
            </button>
          )}
        </div>

        <p className="text-xs text-slate-400">
          Vercel functions have a 60 s limit — each page call scrapes one listing page.
          Use &ldquo;Scrape all pages&rdquo; to chain them automatically.
        </p>
      </div>

      {log.length > 0 && (
        <div className="mt-6 bg-slate-900 rounded-xl p-4 font-mono text-xs text-green-400 space-y-1 max-h-64 overflow-y-auto">
          <div className="text-slate-500 mb-2">— scrape log —</div>
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
