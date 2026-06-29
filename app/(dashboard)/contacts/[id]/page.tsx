import { supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import ContactDetail from './ContactDetail';

export default async function ContactPage({ params }: { params: { id: string } }) {
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!contact) notFound();

  return <ContactDetail contact={contact} />;
}
