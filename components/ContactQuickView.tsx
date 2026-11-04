'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, X } from 'lucide-react';
import ContactPanel from '@/components/ContactPanel';

// The "!" button. Opens the exact same ContactPanel as the /contacts/[id] page.
export default function ContactQuickView({
  contactId,
  onChange,
}: {
  contactId: string;
  name?: string;
  onChange?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Quick view / update"
        className="w-6 h-6 inline-flex items-center justify-center rounded-full border border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
      >
        <AlertCircle size={14} />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
              <ContactPanel contactId={contactId} onChange={onChange} />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
