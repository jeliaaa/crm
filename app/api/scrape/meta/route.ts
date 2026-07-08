import { NextResponse } from 'next/server';
import { getActivities, getLegalForms } from '@/lib/geostat';

export const maxDuration = 30;

export async function GET() {
  try {
    const [activities, legalForms] = await Promise.all([
      getActivities('en'),
      getLegalForms('ge'), // Georgian abbreviations are how users recognize them
    ]);
    return NextResponse.json({ activities, legalForms });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch metadata';
    return NextResponse.json({ error: msg, activities: [], legalForms: [] }, { status: 500 });
  }
}
