import { NextResponse } from 'next/server';
import { getSnapshots, recordSnapshot } from '@/lib/snapshot';

export const dynamic = 'force-dynamic';

// Report data for the calendar (protected by app auth via middleware).
export async function GET() {
  try {
    const snapshots = await getSnapshots();
    return NextResponse.json({ snapshots });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load snapshots';
    return NextResponse.json({ error: msg, snapshots: [] }, { status: 500 });
  }
}

// Manual "Snapshot now" button.
export async function POST() {
  try {
    const snapshot = await recordSnapshot();
    return NextResponse.json({ ok: true, snapshot });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Snapshot failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
