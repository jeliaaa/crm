import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { phoneKey, isUsablePhoneKey } from '@/lib/phone';
import { normalizeRecordingUrl } from '@/lib/recordingUrl';
import { STAGE_LABELS, type Stage } from '@/lib/stages';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// CityNet (212.72.155.180) POSTs one JSON object per hung-up call:
//
//   {"date_time":"2025-11-13 13:38:19","unique_id":"1763026699.138808","dir":"in",
//    "src":"577208418","dst":"995322114411","opr":"102","mob":"","dur":"583",
//    "rec":"https://audio.citynet.ge/listen/…wav","status":"ANSWERED","meta_data":""}
//
// Only calls we place drive the pipeline: dst is the number we dialled, so
// that's the contact. Answered and longer than 2 seconds → "Called + answered"
// (flagged for action), anything else → "Didn't answer". "Lost" stays a human
// judgement call. Inbound calls are logged and otherwise ignored.

const ANSWERED_MIN_SECONDS = 2;

const ANSWERED_STAGE: Stage = 'called_answered';
const FAILED_STAGE: Stage = 'didnt_answer';

// Stages the webhook will not overwrite. A closed deal is never reopened by a
// phone call; and a single unanswered ring shouldn't wipe out a scheduled
// follow-up, a lost verdict somebody made deliberately, or an answered call
// still waiting on an action.
const KEEP_ON_ANSWERED: string[] = ['done'];
const KEEP_ON_FAILED: string[] = ['done', 'follow_up', 'lost', 'called_answered'];

const DEFAULT_ALLOWED_IPS = ['212.72.155.180'];

type CallRow = { id: string; name: string; stage: Stage; phone: string | null; mobile: string | null };

function str(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  return null;
}

/* ---------------------------------------------------------------- auth ---- */

function clientIps(request: NextRequest): string[] {
  const forwarded = (request.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const real = request.headers.get('x-real-ip')?.trim();
  return real ? [...forwarded, real] : forwarded;
}

// Accepted either because the request carries our shared secret, or because it
// came from CityNet's IP. The PBX can only be pointed at a URL, so the token
// may ride along as ?token=… .
function authorized(request: NextRequest): boolean {
  const secret = process.env.CITYNET_WEBHOOK_SECRET;
  if (secret) {
    const provided =
      request.nextUrl.searchParams.get('token') ??
      request.headers.get('x-webhook-secret') ??
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
      null;
    if (provided === secret) return true;
  }

  const allowed = (process.env.CITYNET_ALLOWED_IPS ?? DEFAULT_ALLOWED_IPS.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return clientIps(request).some((ip) => allowed.includes(ip));
}

/* ------------------------------------------------------------- payload ---- */

function fromQueryString(text: string): Record<string, unknown> | null {
  const params = new URLSearchParams(text);
  const obj: Record<string, unknown> = {};
  params.forEach((v, k) => { obj[k] = v; });
  return Object.keys(obj).length ? obj : null;
}

// The sample payload we were given had a stray quote glued to the end, so be
// forgiving: pull the outermost {...} out of the body if a plain parse fails.
function parseLoose(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch { /* fall through */ }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch { /* fall through */ }
  }

  return trimmed.includes('=') ? fromQueryString(trimmed) : null;
}

async function readPayload(request: NextRequest): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('form-data') || contentType.includes('x-www-form-urlencoded')) {
    const form = await request.formData();
    const obj: Record<string, unknown> = {};
    form.forEach((v, k) => { obj[k] = typeof v === 'string' ? v : ''; });

    if ('dst' in obj || 'src' in obj) return obj;
    // A JSON body sent with a form content-type ends up as one long key.
    for (const [k, v] of Object.entries(obj)) {
      const nested = parseLoose(typeof v === 'string' && v.includes('{') ? v : k);
      if (nested && ('dst' in nested || 'src' in nested)) return nested;
    }
    return Object.keys(obj).length ? obj : null;
  }

  return parseLoose(await request.text());
}

// The PBX clock is Tbilisi local time (UTC+4, no DST).
function parseCallTime(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  const d = m ? new Date(`${m[1]}T${m[2]}+04:00`) : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/* ------------------------------------------------------------- lookup ----- */

async function findContacts(key: string): Promise<{ rows: CallRow[]; degraded: boolean }> {
  const { data, error } = await supabase.rpc('find_contacts_by_phone', { p_digits: key });
  if (!error) return { rows: (data ?? []) as CallRow[], degraded: false };

  // find_contacts_by_phone() missing — database/migrate-call-webhook.sql
  // hasn't been run. Fall back to a suffix match, which only finds numbers
  // stored without separators.
  const { data: rows } = await supabase
    .from('contacts')
    .select('id, name, stage, phone, mobile')
    .or(`phone.ilike.%${key},mobile.ilike.%${key}`)
    .limit(50);
  return { rows: (rows ?? []) as CallRow[], degraded: true };
}

/* --------------------------------------------------------------- route ---- */

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'citynet call webhook', expects: 'POST' });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: Record<string, unknown> | null;
  try {
    payload = await readPayload(request);
  } catch {
    payload = null;
  }
  if (!payload) {
    return NextResponse.json({ error: 'Could not parse call payload' }, { status: 400 });
  }

  const dst = str(payload.dst);
  const src = str(payload.src);
  const direction = str(payload.dir);
  const status = str(payload.status);
  const recording = normalizeRecordingUrl(str(payload.rec));
  const uniqueId = str(payload.unique_id);
  const duration = Number.parseInt(str(payload.dur) ?? '0', 10) || 0;

  if (!dst && !src) {
    return NextResponse.json({ error: 'Payload has no src or dst number' }, { status: 400 });
  }

  const answered = status?.toUpperCase() === 'ANSWERED' && duration > ANSWERED_MIN_SECONDS;
  const targetStage: Stage = answered ? ANSWERED_STAGE : FAILED_STAGE;

  // Log the call first: unique_id is unique, so CityNet retries of a call we
  // already handled stop right here instead of re-running the stage change.
  const eventRow = {
    unique_id: uniqueId,
    call_time: parseCallTime(str(payload.date_time)),
    direction,
    src,
    dst,
    operator: str(payload.opr),
    mobile: str(payload.mob),
    duration,
    status,
    recording_url: recording,
    meta_data: str(payload.meta_data),
    raw: payload,
  };

  let eventId: string | null = null;
  let eventLogged = true;

  if (uniqueId) {
    const { data, error } = await supabase
      .from('call_events')
      .upsert(eventRow, { onConflict: 'unique_id', ignoreDuplicates: true })
      .select('id');
    if (error) eventLogged = false;
    else if (!data?.length) {
      return NextResponse.json({ ok: true, duplicate: true, unique_id: uniqueId });
    } else eventId = data[0].id;
  } else {
    const { data, error } = await supabase.from('call_events').insert(eventRow).select('id').single();
    if (error) eventLogged = false;
    else eventId = data.id;
  }

  // Inbound calls are somebody ringing us — logged above for the record, but
  // they don't move anyone along the pipeline. Anything not explicitly marked
  // inbound is treated as ours, so a missing dir never silently drops a call.
  if ((direction ?? '').toLowerCase().startsWith('in')) {
    return NextResponse.json({
      ok: true,
      direction,
      skipped: 'inbound',
      ...(eventLogged ? {} : { warning: 'call_events table missing — run database/migrate-call-webhook.sql' }),
    });
  }

  // Our own outgoing call: dst is the number we dialled.
  const key = phoneKey(dst);
  let matched: CallRow[] = [];
  let matchedPhone: string | null = null;
  let degraded = false;

  if (isUsablePhoneKey(key)) {
    const res = await findContacts(key);
    degraded = res.degraded;
    matched = res.rows;
    if (matched.length) matchedPhone = dst;
  }

  const keep = answered ? KEEP_ON_ANSWERED : KEEP_ON_FAILED;
  const results: { id: string; name: string; from: Stage; to: Stage; changed: boolean }[] = [];
  const errors: string[] = [];

  for (const contact of matched) {
    const kept = keep.includes(contact.stage);
    const newStage = kept ? contact.stage : targetStage;

    const patch: Record<string, unknown> = {};
    if (newStage !== contact.stage) patch.stage = newStage;
    if (answered && !kept) patch.action_required = true;

    if (Object.keys(patch).length) {
      const { error } = await supabase.from('contacts').update(patch).eq('id', contact.id);
      if (error) {
        errors.push(`${contact.name}: ${error.message}`);
        continue;
      }
    }

    const summary = [
      `Outgoing call to ${dst ?? '—'}`,
      `${status ?? 'UNKNOWN'}, ${formatDuration(duration)}`,
      kept ? `stage left as ${STAGE_LABELS[contact.stage] ?? contact.stage}` : null,
      recording ? `recording: ${recording}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    await supabase.from('contact_activities').insert(
      newStage !== contact.stage
        ? {
            contact_id: contact.id,
            type: 'status_change',
            from_stage: contact.stage,
            to_stage: newStage,
            comment: summary,
          }
        : { contact_id: contact.id, type: 'comment', comment: summary }
    );

    results.push({
      id: contact.id,
      name: contact.name,
      from: contact.stage,
      to: newStage,
      changed: newStage !== contact.stage,
    });
  }

  if (eventId) {
    await supabase
      .from('call_events')
      .update({
        matched_phone: matchedPhone,
        matched_contact_ids: results.map((r) => r.id),
        applied_stage: results.some((r) => r.changed) ? targetStage : null,
      })
      .eq('id', eventId);
  }

  return NextResponse.json({
    ok: errors.length === 0,
    direction,
    answered,
    duration,
    target_stage: targetStage,
    matched_phone: matchedPhone,
    matched: results.length,
    contacts: results,
    ...(errors.length ? { errors } : {}),
    ...(eventLogged ? {} : { warning: 'call_events table missing — run database/migrate-call-webhook.sql' }),
    ...(degraded ? { warning_lookup: 'find_contacts_by_phone() missing — using a loose suffix match' } : {}),
  });
}
