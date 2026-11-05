import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const [{ data: contact, error: cErr }, { data: activities, error: aErr }] = await Promise.all([
    supabase
      .from('contacts')
      .select('*')
      .eq('id', params.id)
      .single(),
    supabase
      .from('contact_activities')
      .select('*')
      .eq('contact_id', params.id)
      .order('created_at', { ascending: false }),
  ]);

  if (cErr || !contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  return NextResponse.json({ contact, activities: activities ?? [] });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json();
  const { type, toStage, toLevel, comment, followUpDate } = body as {
    type: 'status_change' | 'comment' | 'follow_up' | 'interest_change' | 'rating_change';
    toStage?: string;
    toLevel?: number | null;
    comment?: string;
    followUpDate?: string;
  };

  if (!type) return NextResponse.json({ error: 'type is required' }, { status: 400 });

  const activity: Record<string, unknown> = { contact_id: params.id, type };

  if (type === 'status_change') {
    if (!toStage) return NextResponse.json({ error: 'toStage is required' }, { status: 400 });

    const { data: current } = await supabase
      .from('contacts')
      .select('stage')
      .eq('id', params.id)
      .single();

    if (current?.stage === toStage) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    // Moving a contact off "Called + answered" is the action itself, so the
    // red flag clears with it.
    const { error: updErr } = await supabase
      .from('contacts')
      .update({ stage: toStage, ...(toStage === 'called_answered' ? {} : { action_required: false }) })
      .eq('id', params.id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    activity.from_stage = current?.stage ?? null;
    activity.to_stage = toStage;
    if (comment?.trim()) activity.comment = comment.trim();
  } else if (type === 'interest_change') {
    if (toLevel !== null && !(Number.isInteger(toLevel) && toLevel! >= 0 && toLevel! <= 5)) {
      return NextResponse.json({ error: 'toLevel must be 0-5 or null' }, { status: 400 });
    }
    const { data: current } = await supabase
      .from('contacts')
      .select('interest_level')
      .eq('id', params.id)
      .single();
    if ((current?.interest_level ?? null) === toLevel) {
      return NextResponse.json({ ok: true, unchanged: true });
    }
    const { error: updErr } = await supabase
      .from('contacts')
      .update({ interest_level: toLevel })
      .eq('id', params.id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    activity.from_stage = current?.interest_level === null || current?.interest_level === undefined ? null : String(current.interest_level);
    activity.to_stage = toLevel === null ? null : String(toLevel);
  } else if (type === 'rating_change') {
    if (toLevel !== null && !(Number.isInteger(toLevel) && toLevel! >= 1 && toLevel! <= 5)) {
      return NextResponse.json({ error: 'toLevel must be 1-5 or null' }, { status: 400 });
    }
    const { data: current } = await supabase
      .from('contacts')
      .select('rating')
      .eq('id', params.id)
      .single();
    if ((current?.rating ?? null) === toLevel) {
      return NextResponse.json({ ok: true, unchanged: true });
    }
    const { error: updErr } = await supabase
      .from('contacts')
      .update({ rating: toLevel })
      .eq('id', params.id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    activity.from_stage = current?.rating == null ? null : String(current.rating);
    activity.to_stage = toLevel === null ? null : String(toLevel);
  } else if (type === 'comment') {
    if (!comment?.trim()) return NextResponse.json({ error: 'comment is required' }, { status: 400 });
    activity.comment = comment.trim();
  } else if (type === 'follow_up') {
    if (!followUpDate) return NextResponse.json({ error: 'followUpDate is required' }, { status: 400 });
    activity.follow_up_date = followUpDate;
    if (comment?.trim()) activity.comment = comment.trim();

    // A follow-up only makes sense while the contact is in the Follow-up
    // stage, so scheduling one moves them there (and logs the change).
    const { data: current } = await supabase
      .from('contacts')
      .select('stage')
      .eq('id', params.id)
      .single();

    if (current && current.stage !== 'follow_up') {
      await supabase.from('contacts').update({ stage: 'follow_up' }).eq('id', params.id);
      await supabase.from('contact_activities').insert({
        contact_id: params.id,
        type: 'status_change',
        from_stage: current.stage,
        to_stage: 'follow_up',
      });
    }
  } else {
    return NextResponse.json({ error: 'invalid type' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('contact_activities')
    .insert(activity)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
