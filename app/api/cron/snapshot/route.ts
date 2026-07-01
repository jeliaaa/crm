import { NextRequest, NextResponse } from 'next/server';
import { recordSnapshot } from '@/lib/snapshot';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Called by the Vercel cron (see vercel.json) at 18:00 Tbilisi daily.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const snapshot = await recordSnapshot();
    return NextResponse.json({ ok: true, snapshot });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Snapshot failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
