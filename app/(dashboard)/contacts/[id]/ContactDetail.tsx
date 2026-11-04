'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ContactPanel from '@/components/ContactPanel';

// Full-page version of the "!" quick view: same ContactPanel, no overlay.
export default function ContactDetail({ contactId }: { contactId: string }) {
  return (
    <div className="p-8 max-w-2xl">
      <Link href="/contacts" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-6">
        <ArrowLeft size={14} /> Back to contacts
      </Link>
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <ContactPanel contactId={contactId} />
      </div>
    </div>
  );
}
