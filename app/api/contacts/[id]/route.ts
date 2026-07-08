import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json();
  const allowed = ['stage', 'notes', 'phone', 'email', 'website', 'address'];
  const patch = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  );

  // If the stage is changing, capture the previous value so we can log the
  // status change (a "call") — this covers the contact detail page and the
  // Kanban board, which both PATCH here.
  let fromStage: string | null = null;
  if (typeof patch.stage === 'string') {
    const { data: current } = await supabase
      .from('contacts')
      .select('stage')
      .eq('id', params.id)
      .single();
    fromStage = current?.stage ?? null;
  }

  const { data, error } = await supabase
    .from('contacts')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (typeof patch.stage === 'string' && patch.stage !== fromStage) {
    await supabase.from('contact_activities').insert({
      contact_id: params.id,
      type: 'status_change',
      from_stage: fromStage,
      to_stage: patch.stage,
    });
  }

  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await supabase.from('contacts').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
