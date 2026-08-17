import { supabase } from './supabase';

// Distinct values of a filterable column, for dropdowns and datalists.
// Prefers the DISTINCT functions from database/migrate-distinct-filters.sql
// and falls back to a large sample when they aren't installed.
export async function distinctValues(column: 'category' | 'city'): Promise<string[]> {
  const rpc = column === 'category' ? 'distinct_categories' : 'distinct_cities';
  const { data, error } = await supabase.rpc(rpc);

  let values: string[];
  if (error) {
    const { data: rows } = await supabase
      .from('contacts')
      .select(column)
      .not(column, 'is', null)
      .limit(2000);
    values = (rows ?? []).map((r) => (r as Record<string, string>)[column]);
  } else {
    values = (data as { value: string }[]).map((r) => r.value);
  }

  return Array.from(new Set(values.filter(Boolean))).sort();
}
