'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  STAGE_ORDER,
  STAGE_LABELS,
  STAGE_BADGE,
  STAGE_BADGE_BORDER,
  type Stage,
} from '@/lib/stages';
import {
  X,
  AlertCircle,
  CalendarClock,
  MessageSquare,
  ArrowRight,
  Clock,
} from 'lucide-react';

type Activity = {
  id: string;
  type: 'status_change' | 'comment' | 'follow_up';
  from_stage: string | null;
  to_stage: string | null;
  comment: string | null;
  follow_up_date: string | null;
  created_at: string;
};

type ContactInfo = {
  id: string;
  name: string;
  stage: Stage;
  phone: string | null;
  email: string | null;
  identification_number: string | null;
  city: string | null;
  category: string | null;
};

export default function ContactQuickView({
  contactId,
  name,
  onChange,
}: {
  contactId: string;
  name: string;
  onChange?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/activities`);
      const data = await res.json();
      setContact(data.contact);
      setActivities(data.activities ?? []);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  function openModal() {
    setOpen(true);
    load();
  }

  async function post(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await load();
        router.refresh();
        onChange?.();
      }
    } finally {
      setSaving(false);
    }
  }

  async function changeStage(toStage: Stage) {
    if (contact?.stage === toStage) return;
    await post({ type: 'status_change', toStage });
  }

  async function addComment() {
    if (!comment.trim()) return;
    await post({ type: 'comment', comment });
    setComment('');
  }

  async function addFollowUp() {
    if (!followUpDate) return;
    await post({ type: 'follow_up', followUpDate, comment: followUpNote });
    setFollowUpDate('');
    setFollowUpNote('');
  }

  return (
    <>
      <button
        onClick={openModal}
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
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between p-5 border-b border-slate-100">
                <div>
                  <h2 className="font-bold text-slate-900 text-lg leading-tight">{name}</h2>
                  {contact && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                      {contact.identification_number && (
                        <span className="font-mono">{contact.identification_number}</span>
                      )}
                      {contact.phone && <span>· {contact.phone}</span>}
                      {contact.city && <span>· {contact.city}</span>}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="text-slate-400 hover:text-slate-700 shrink-0"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="overflow-y-auto p-5 space-y-6">
                {/* Status */}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Status</p>
                  <div className="flex flex-wrap gap-2">
                    {STAGE_ORDER.map((s) => {
                      const active = contact?.stage === s;
                      return (
                        <button
                          key={s}
                          disabled={saving || !contact}
                          onClick={() => changeStage(s)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors disabled:opacity-50 ${
                            active
                              ? STAGE_BADGE_BORDER[s]
                              : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {STAGE_LABELS[s]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Add follow-up */}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <CalendarClock size={14} className="text-slate-400" /> Add a follow-up
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      type="text"
                      value={followUpNote}
                      onChange={(e) => setFollowUpNote(e.target.value)}
                      placeholder="Note (optional)"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      onClick={addFollowUp}
                      disabled={saving || !followUpDate}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Add comment */}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <MessageSquare size={14} className="text-slate-400" /> Add a comment
                  </p>
                  <div className="flex gap-2">
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={2}
                      placeholder="Write a comment…"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                    <button
                      onClick={addComment}
                      disabled={saving || !comment.trim()}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 self-start"
                    >
                      Post
                    </button>
                  </div>
                </div>

                {/* History */}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1.5">
                    <Clock size={14} className="text-slate-400" /> History
                  </p>
                  {loading ? (
                    <p className="text-sm text-slate-400">Loading…</p>
                  ) : activities.length === 0 ? (
                    <p className="text-sm text-slate-400">No activity yet.</p>
                  ) : (
                    <ol className="space-y-3">
                      {activities.map((a) => (
                        <li key={a.id} className="flex gap-3 text-sm">
                          <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                          <div className="flex-1">
                            <ActivityLine activity={a} />
                            <p className="text-xs text-slate-400 mt-0.5">
                              {formatDateTime(a.created_at)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function ActivityLine({ activity: a }: { activity: Activity }) {
  if (a.type === 'status_change') {
    return (
      <p className="text-slate-700 flex items-center gap-1.5 flex-wrap">
        Status changed
        {a.from_stage && (
          <>
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STAGE_BADGE[a.from_stage as Stage] ?? 'bg-slate-100 text-slate-600'}`}>
              {STAGE_LABELS[a.from_stage as Stage] ?? a.from_stage}
            </span>
            <ArrowRight size={12} className="text-slate-400" />
          </>
        )}
        <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STAGE_BADGE[a.to_stage as Stage] ?? 'bg-slate-100 text-slate-600'}`}>
          {STAGE_LABELS[a.to_stage as Stage] ?? a.to_stage}
        </span>
        {a.comment && <span className="text-slate-500">— {a.comment}</span>}
      </p>
    );
  }
  if (a.type === 'follow_up') {
    return (
      <p className="text-slate-700">
        <span className="inline-flex items-center gap-1 font-medium text-amber-700">
          <CalendarClock size={13} /> Follow-up
        </span>{' '}
        scheduled for <span className="font-medium">{formatDate(a.follow_up_date)}</span>
        {a.comment && <span className="text-slate-500"> — {a.comment}</span>}
      </p>
    );
  }
  return (
    <p className="text-slate-700">
      <MessageSquare size={13} className="inline text-slate-400 mr-1" />
      {a.comment}
    </p>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
