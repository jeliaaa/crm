import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import DeleteAllButton from '@/components/DeleteAllButton';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

const STAGE_COLORS: Record<string, string> = {
  lead: 'bg-blue-100 text-blue-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  qualified: 'bg-purple-100 text-purple-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
};

interface SearchParams {
  stage?: string;
  city?: string;
  category?: string;
  q?: string;
  page?: string;
}

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const page = Math.max(1, parseInt(searchParams.page || '1'));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('contacts')
    .select(
      'id, name, identification_number, head, phone, email, website, address, city, region, category, activity_code, categories, ownership_type, business_size, established_year, stage',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (searchParams.stage) query = query.eq('stage', searchParams.stage);
  if (searchParams.city) query = query.ilike('city', `%${searchParams.city}%`);
  if (searchParams.category) query = query.ilike('category', `%${searchParams.category}%`);
  if (searchParams.q) query = query.ilike('name', `%${searchParams.q}%`);

  const { data: contacts, count, error } = await query;
  const totalPages = Math.ceil((count || 0) / PAGE_SIZE);

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm font-mono">
          <p className="font-bold mb-1">Supabase read error:</p>
          <p>{error.message}</p>
          <p className="text-red-400 mt-1">Code: {error.code}</p>
        </div>
      </div>
    );
  }

  const [{ data: cityRows }, { data: catRows }] = await Promise.all([
    supabase.from('contacts').select('city').not('city', 'is', null).limit(200),
    supabase.from('contacts').select('category').not('category', 'is', null).limit(200),
  ]);

  const cities = Array.from(new Set(cityRows?.map((r) => r.city).filter(Boolean))).sort() as string[];
  const categories = Array.from(new Set(catRows?.map((r) => r.category).filter(Boolean))).sort() as string[];

  const buildQuery = (overrides: Record<string, string>) => {
    const p = { ...searchParams, ...overrides };
    return '?' + new URLSearchParams(Object.fromEntries(Object.entries(p).filter(([, v]) => v))).toString();
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Contacts{' '}
          <span className="text-slate-400 text-lg font-normal">({count?.toLocaleString() ?? 0})</span>
        </h1>
        <div className="flex gap-2">
          <DeleteAllButton />
          <Link
            href="/scrape"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            + Scrape more
          </Link>
        </div>
      </div>

      <form method="GET" className="flex gap-3 mb-6 flex-wrap">
        <input
          name="q"
          defaultValue={searchParams.q}
          placeholder="Search name…"
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
        <select
          name="stage"
          defaultValue={searchParams.stage || ''}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">All stages</option>
          {['lead', 'contacted', 'qualified', 'won', 'lost'].map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select
          name="city"
          defaultValue={searchParams.city || ''}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">All cities</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          name="category"
          defaultValue={searchParams.category || ''}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
        >
          Filter
        </button>
        <Link href="/contacts" className="px-4 py-2 text-slate-600 rounded-lg text-sm hover:bg-slate-100 border border-slate-200 bg-white">
          Clear
        </Link>
      </form>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {['Name', 'ID №', 'Head', 'Phone', 'Email', 'Website', 'Address', 'City', 'Region', 'Industry', 'Activity', 'Ownership', 'Size', 'Est.', 'Stage'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-slate-500 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contacts?.map((c) => (
              <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 align-top">
                <td className="px-4 py-3">
                  <Link href={`/contacts/${c.id}`} className="font-medium text-indigo-600 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600 font-mono text-xs">{c.identification_number || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{c.head || '—'}</td>
                <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                  {c.phone ? <a href={`tel:${c.phone}`} className="hover:text-indigo-600">{c.phone}</a> : '—'}
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">
                  {c.email ? <a href={`mailto:${c.email}`} className="hover:text-indigo-600">{c.email}</a> : '—'}
                </td>
                <td className="px-4 py-3">
                  {c.website ? (
                    <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline text-xs truncate max-w-[140px] block">
                      {c.website.replace(/^https?:\/\//, '')}
                    </a>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate" title={c.address || ''}>{c.address || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{c.city || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{c.region || '—'}</td>
                <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate" title={c.category || ''}>{c.category || '—'}</td>
                <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate" title={(c.categories || []).join(', ')}>
                  {c.activity_code ? <span className="font-mono mr-1">{c.activity_code}</span> : ''}
                  {(c.categories && c.categories[0]) || (c.activity_code ? '' : '—')}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs max-w-[140px] truncate" title={c.ownership_type || ''}>{c.ownership_type || '—'}</td>
                <td className="px-4 py-3 text-slate-600 text-xs">{c.business_size || '—'}</td>
                <td className="px-4 py-3 text-slate-600 text-xs">{c.established_year || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLORS[c.stage] ?? 'bg-slate-100 text-slate-600'}`}>
                    {c.stage}
                  </span>
                </td>
              </tr>
            ))}
            {!contacts?.length && (
              <tr>
                <td colSpan={15} className="px-6 py-12 text-center text-slate-400">
                  No contacts found.{' '}
                  {!searchParams.q && !searchParams.stage && !searchParams.city && !searchParams.category ? (
                    <Link href="/scrape" className="text-indigo-600 hover:underline">Start scraping →</Link>
                  ) : (
                    <Link href="/contacts" className="text-indigo-600 hover:underline">Clear filters</Link>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {page > 1 && (
            <Link href={buildQuery({ page: String(page - 1) })} className="px-3 py-1.5 rounded-lg text-sm bg-white text-slate-600 hover:bg-slate-100 border border-slate-200">
              ← Prev
            </Link>
          )}
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = Math.max(1, Math.min(page - 3, totalPages - 6)) + i;
            return (
              <Link
                key={p}
                href={buildQuery({ page: String(p) })}
                className={`px-3 py-1.5 rounded-lg text-sm ${p === page ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
              >
                {p}
              </Link>
            );
          })}
          {page < totalPages && (
            <Link href={buildQuery({ page: String(page + 1) })} className="px-3 py-1.5 rounded-lg text-sm bg-white text-slate-600 hover:bg-slate-100 border border-slate-200">
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
