// "Often responses" dropdown. Second status on a contact once they've been called + answered: how much
// they need the service. Stored as contacts.interest_level (0-5).

export const INTEREST_LEVELS: { value: number; label: string }[] = [
  { value: 0, label: 'არ მჭირდება / არასოდეს დამჭირვებია' },
  { value: 1, label: 'წელიწადში 1-2-ჯერ მჭირდება / ძალიან იშვიათად' },
  { value: 2, label: 'ნათესავი მიკეთებს / ან დიდი ხნის თანამშრომლობა გვაქვს ვერ შევცვლი' },
  { value: 3, label: 'სხვასთან ვთანამშრომლობ თუმცა განვიხილავ უკეთესი პირობების შემთხვევაში' },
  { value: 4, label: 'უახლოეს პერიოდში დამჭირდება' },
  { value: 5, label: 'მჭირდება შემდეგ კვირაში / urgent' },
];

export function interestLabel(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  const l = INTEREST_LEVELS.find((x) => x.value === n);
  return l ? `${l.value} - ${l.label}` : String(v);
}

export const INTEREST_BADGE = [
  'bg-slate-200 text-slate-600',
  'bg-slate-100 text-slate-600',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-700',
  'bg-orange-100 text-orange-700',
  'bg-red-100 text-red-700',
];

// Per-contact rating 1-5, independent of the "Often responses" dropdown.
export const RATING_VALUES = [1, 2, 3, 4, 5] as const;

export function ratingLabel(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  return `${v} / 5`;
}
