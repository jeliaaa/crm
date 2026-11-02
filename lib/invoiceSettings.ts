import { supabase } from './supabase';
import { DEFAULT_SETTINGS, InvoiceSettings, mergeSettings } from './invoice';

const KEY = 'invoice';

// Falls back to the defaults when the settings table is missing or empty so
// invoices keep working before the migration has been run.
export async function loadInvoiceSettings(): Promise<InvoiceSettings> {
  const { data, error } = await supabase.from('settings').select('value').eq('key', KEY).maybeSingle();
  if (error || !data) return { ...DEFAULT_SETTINGS };
  return mergeSettings(data.value);
}

export async function saveInvoiceSettings(raw: unknown): Promise<InvoiceSettings> {
  const value = mergeSettings(raw);
  const { error } = await supabase
    .from('settings')
    .upsert({ key: KEY, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return value;
}
