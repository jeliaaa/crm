import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { distinctValues } from '@/lib/distinctValues';
import NewContactForm from '@/components/NewContactForm';

export const dynamic = 'force-dynamic';

export default async function NewContactPage() {
  // Existing values feed the Industry/City datalists, so hand-added contacts
  // reuse the vocabulary the scraper already established instead of inventing
  // near-duplicate spellings. Suggestions only — the fields stay free text.
  const [categories, cities] = await Promise.all([
    distinctValues('category'),
    distinctValues('city'),
  ]);

  return (
    <div className="p-8">
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-6"
      >
        <ArrowLeft size={14} /> Back to contacts
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">Add a contact</h1>
      <p className="text-sm text-slate-500 mb-6">
        For companies you found yourself. Scraped contacts arrive through{' '}
        <Link href="/scrape" className="text-indigo-600 hover:underline">
          Scrape
        </Link>
        .
      </p>

      <NewContactForm categories={categories} cities={cities} />
    </div>
  );
}
