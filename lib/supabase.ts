import { createClient } from '@supabase/supabase-js';

export type Stage = 'lead' | 'contacted' | 'qualified' | 'won' | 'lost';

export type Contact = {
  id: string;
  stat_id: number | null;
  name: string;
  identification_number: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  category: string | null;
  activity_code: string | null;
  categories: string[];
  head: string | null;
  partner: string | null;
  ownership_type: string | null;
  business_size: string | null;
  description: string | null;
  source_url: string | null;
  established_year: number | null;
  stage: Stage;
  notes: string;
  created_at: string;
  updated_at: string;
};

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
    // Next.js wraps global fetch and caches responses in its Data Cache by
    // default. That makes server-rendered Supabase reads return stale results
    // (e.g. an empty table cached before any contacts were scraped). Force
    // no-store so every query hits Postgres fresh.
    global: {
      fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
    },
  }
);
