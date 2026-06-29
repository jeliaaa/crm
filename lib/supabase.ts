import { createClient } from '@supabase/supabase-js';

export type Stage = 'lead' | 'contacted' | 'qualified' | 'won' | 'lost';

export type Contact = {
  id: string;
  name: string;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  category: string | null;
  categories: string[];
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
  { auth: { persistSession: false } }
);
