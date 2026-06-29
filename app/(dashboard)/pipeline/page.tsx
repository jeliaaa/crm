import { supabase } from '@/lib/supabase';
import KanbanBoard from '@/components/KanbanBoard';

export default async function PipelinePage() {
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, phone, city, category, stage, website')
    .order('updated_at', { ascending: false })
    .limit(500);

  return (
    <div className="p-8 flex flex-col h-full">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Pipeline</h1>
      <KanbanBoard initialContacts={contacts ?? []} />
    </div>
  );
}
