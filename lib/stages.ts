// Single source of truth for pipeline statuses.

export type Stage = 'lead' | 'follow_up' | 'done' | 'lost' | 'didnt_answer';

export const STAGE_ORDER: Stage[] = ['lead', 'follow_up', 'done', 'lost', 'didnt_answer'];

export const STAGE_LABELS: Record<Stage, string> = {
  lead: 'Lead',
  follow_up: 'Follow-up',
  done: 'Done',
  lost: 'Lost',
  didnt_answer: "Didn't answer",
};

// Compact badge styles (table cells, chips).
export const STAGE_BADGE: Record<Stage, string> = {
  lead: 'bg-blue-100 text-blue-700',
  follow_up: 'bg-amber-100 text-amber-700',
  done: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
  didnt_answer: 'bg-slate-200 text-slate-600',
};

// Bordered styles (selectable buttons).
export const STAGE_BADGE_BORDER: Record<Stage, string> = {
  lead: 'bg-blue-100 text-blue-700 border-blue-200',
  follow_up: 'bg-amber-100 text-amber-700 border-amber-200',
  done: 'bg-green-100 text-green-700 border-green-200',
  lost: 'bg-red-100 text-red-700 border-red-200',
  didnt_answer: 'bg-slate-200 text-slate-600 border-slate-300',
};

// Kanban column styles.
export const STAGE_COLUMN: Record<Stage, { header: string; bg: string }> = {
  lead: { header: 'text-blue-600', bg: 'bg-blue-50' },
  follow_up: { header: 'text-amber-600', bg: 'bg-amber-50' },
  done: { header: 'text-green-600', bg: 'bg-green-50' },
  lost: { header: 'text-red-600', bg: 'bg-red-50' },
  didnt_answer: { header: 'text-slate-500', bg: 'bg-slate-100' },
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage as Stage] ?? stage;
}

export function stageBadge(stage: string): string {
  return STAGE_BADGE[stage as Stage] ?? 'bg-slate-100 text-slate-600';
}
