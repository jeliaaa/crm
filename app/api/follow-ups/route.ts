import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabase
    .from('contact_activities')
    .select('id, contact_id, comment, follow_up_date, contacts(name, phone, email, city, stage)')
    .eq('type', 'follow_up')
    .not('follow_up_date', 'is', null)
    .order('follow_up_date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ followUps: data ?? [] });
}
