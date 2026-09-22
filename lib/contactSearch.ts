import { supabase } from './supabase';
import { PHONE_KEY_LENGTH } from './phone';

// Free-text search across every field on a contact: names, phone numbers,
// emails, tax IDs, addresses, websites, notes — whatever the person typed.
//
// Two ways of doing it. If database/migrate-search.sql has run, the whole
// row is mirrored into the generated `search_text` column (trigram indexed)
// and the phone numbers into `phone_digits`, so one ilike covers everything.
// If it hasn't, we OR an ilike per column instead: same results for the
// columns PostgREST can reach, just slower, and without categories[].

export type SearchMode = 'indexed' | 'columns';

// Every text column worth matching, used in 'columns' mode. categories[] is
// missing because PostgREST can't ilike an array — that one needs the
// migration.
const TEXT_COLUMNS = [
  'name',
  'identification_number',
  'head',
  'partner',
  'phone',
  'mobile',
  'email',
  'website',
  'address',
  'city',
  'region',
  'category',
  'activity_code',
  'ownership_type',
  'business_size',
  'description',
  'notes',
] as const;

let detected: SearchMode | null = null;

// One probe per process: ask for the generated columns and see whether
// Postgres knows them. 42703 is undefined_column — anything else (a network
// blip, a paused project) stays uncached so the next call can retry.
export async function searchMode(): Promise<SearchMode> {
  if (detected) return detected;

  const { error } = await supabase.from('contacts').select('search_text, phone_digits').limit(1);
  if (!error) detected = 'indexed';
  else if (error.code === '42703' || /search_text|phone_digits/.test(error.message)) detected = 'columns';

  return detected ?? 'columns';
}

// % and _ are LIKE wildcards. Someone searching for "70.20" means the
// literal string, so escape them (and the escape character itself).
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// PostgREST's or=() grammar splits on commas and parens, so any value that
// might contain them is double-quoted, with backslashes and quotes escaped
// inside the quotes.
function quoted(pattern: string): string {
  return `"${pattern.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

function ilike(column: string, term: string): string {
  return `${column}.ilike.${quoted(likePattern(term))}`;
}

// A run of digits is a phone number, a tax ID, a Stat_ID or a year — never a
// word — so it gets matched as a number as well as a substring.
function numericGroup(digits: string, mode: SearchMode): string {
  const parts: string[] = [];

  // Stored numbers may or may not carry the 995 country code, and the
  // scraped ones are spaced however the source had them. Comparing the last
  // 9 digits — the length of a Georgian national number — lines every shape
  // up, the same trick lib/phone.ts uses for the call webhook.
  const key = digits.length > PHONE_KEY_LENGTH ? digits.slice(-PHONE_KEY_LENGTH) : digits;

  if (mode === 'indexed') {
    parts.push(ilike('phone_digits', key));
    parts.push(ilike('search_text', digits));
  } else {
    parts.push(ilike('phone', key), ilike('mobile', key));
    for (const column of TEXT_COLUMNS) parts.push(ilike(column, digits));
  }

  // Exact hits on the numeric columns: search_text only holds them as text,
  // and in 'columns' mode nothing else reaches them at all.
  const value = Number(digits);
  if (Number.isSafeInteger(value)) {
    parts.push(`stat_id.eq.${value}`);
    if (digits.length === 4) parts.push(`established_year.eq.${value}`);
  }

  // phone/mobile appear twice when the number is short enough that the
  // last-9 key is the whole thing.
  return Array.from(new Set(parts)).join(',');
}

function textGroup(term: string, mode: SearchMode): string {
  if (mode === 'indexed') return ilike('search_text', term);
  return TEXT_COLUMNS.map((column) => ilike(column, term)).join(',');
}

// Builds the or() groups for a query. Each group is OR-ed across fields, and
// chaining them onto a query ANDs the groups together — so "tbilisi law"
// finds rows where something says tbilisi *and* something says law.
export function searchGroups(raw: string, mode: SearchMode): string[] {
  const q = raw.trim();
  if (!q) return [];

  // "+995 595 27 71 71", "595-27-71-71" and "595277171" are one search, not
  // four, so phone punctuation collapses before the query is split on
  // spaces. Dots are left alone: "70.20.2" is a NACE activity code, and
  // flattening it to 70202 would stop it matching the column that holds it.
  // 4 digits is the shortest thing worth treating as a number (a year);
  // below that it's an abbreviation and reads better as text.
  const digits = q.replace(/[\s()+\-]/g, '');
  if (/^\d{4,}$/.test(digits)) return [numericGroup(digits, mode)];

  return q.split(/\s+/).map((term) => textGroup(term, mode));
}

// Convenience wrapper for callers that just have a query string.
export async function contactSearchGroups(raw: string): Promise<string[]> {
  if (!raw.trim()) return [];
  return searchGroups(raw, await searchMode());
}
