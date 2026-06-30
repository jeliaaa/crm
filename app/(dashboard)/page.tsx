import { supabase } from '@/lib/supabase';
import Link from 'next/link';

const STAGE_COLORS: Record<string, string> = {
  lead: 'bg-blue-100 text-blue-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  qualified: 'bg-purple-100 text-purple-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
};

export default async function DashboardPage() {
  const [
    { count: total },
    { count: leads },
    { count: contacted },
    { count: qualified },
    { count: won },
  ] = await Promise.all([
    supabase.from('contacts').select('*', { count: 'exact', head: true }),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('stage', 'lead'),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('stage', 'contacted'),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('stage', 'qualified'),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('stage', 'won'),
  ]);

  const { data: recent } = await supabase
    .from('contacts')
    .select('id, name, identification_number, head, phone, email, website, city, region, category, business_size, stage, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  const stats = [
    { label: 'Total Contacts', value: total ?? 0, color: 'bg-indigo-500' },
    { label: 'New Leads', value: leads ?? 0, color: 'bg-blue-500' },
    { label: 'Contacted', value: contacted ?? 0, color: 'bg-yellow-500' },
    { label: 'Qualified', value: qualified ?? 0, color: 'bg-purple-500' },
    { label: 'Won', value: won ?? 0, color: 'bg-green-500' },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-5 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className={`w-8 h-8 ${s.color} rounded-lg mb-3`} />
            <p className="text-2xl font-bold text-slate-900">{s.value.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="font-semibold text-slate-900">Recent Contacts</h2>
          <Link href="/contacts" className="text-sm text-indigo-600 hover:underline">
            View all →
          </Link>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {['Name', 'ID №', 'Head', 'Phone', 'Email', 'Website', 'City', 'Region', 'Industry', 'Size', 'Stage'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-slate-500 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recent?.map((c) => (
              <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
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
                <td className="px-4 py-3 text-slate-600">{c.city || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{c.region || '—'}</td>
                <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate" title={c.category || ''}>{c.category || '—'}</td>
                <td className="px-4 py-3 text-slate-600 text-xs">{c.business_size || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLORS[c.stage] ?? 'bg-slate-100 text-slate-600'}`}>
                    {c.stage}
                  </span>
                </td>
              </tr>
            ))}
            {!recent?.length && (
              <tr>
                <td colSpan={11} className="px-6 py-10 text-center text-slate-400 text-sm">
                  No contacts yet.{' '}
                  <Link href="/scrape" className="text-indigo-600 hover:underline">
                    Scrape some businesses →
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
