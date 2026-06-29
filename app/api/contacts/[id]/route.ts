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

  const { data, error } = await supabase
    .from('contacts')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await supabase.from('contacts').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
