import { supabase } from './supabase';

// Duplicates are only flagged, never removed. The matching rules live in
// database/migrate-dedupe.sql (contact_duplicates); this just reads them.

export type DuplicateCopy = {
  id: string;
  name: string;
  stage: string;
  createdAt: string;
  strength: 'certain' | 'probable';
};

export type DuplicateInfo = {
  // Earliest record of this company, which may be the row itself.
  first: { id: string; name: string; stage: string; createdAt: string };
  isFirst: boolean;
  // The other copies, oldest first.
  others: DuplicateCopy[];
};

type Row = {
  contact_id: string;
  dup_id: string;
  dup_name: string;
  dup_stage: string;
  dup_created_at: string;
  strength: 'certain' | 'probable';
};

// Duplicate info for the given contacts, keyed by contact id. Contacts with no
// copies are absent. Returns an empty map if the migration has not been run,
// so the contacts page keeps working.
export async function loadDuplicateInfo(
  contacts: { id: string; name: string; stage: string; created_at: string }[]
): Promise<Map<string, DuplicateInfo>> {
  const out = new Map<string, DuplicateInfo>();
  if (contacts.length === 0) return out;

  const { data, error } = await supabase.rpc('contact_duplicates', {
    p_ids: contacts.map((c) => c.id),
  });
  if (error || !data) return out;

  const self = new Map(contacts.map((c) => [c.id, c]));
  const byContact = new Map<string, Row[]>();
  for (const r of data as Row[]) {
    (byContact.get(r.contact_id) ?? byContact.set(r.contact_id, []).get(r.contact_id)!).push(r);
  }

  byContact.forEach((rows, id) => {
    const me = self.get(id)!;
    const others: DuplicateCopy[] = rows
      .map((r) => ({
        id: r.dup_id,
        name: r.dup_name,
        stage: r.dup_stage,
        createdAt: r.dup_created_at,
        strength: r.strength,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const mine = { id: me.id, name: me.name, stage: me.stage, createdAt: me.created_at };
    const earliest = others[0].createdAt < mine.createdAt ? others[0] : mine;
    out.set(id, {
      first: { id: earliest.id, name: earliest.name, stage: earliest.stage, createdAt: earliest.createdAt },
      isFirst: earliest.id === me.id,
      others,
    });
  });
  return out;
}
