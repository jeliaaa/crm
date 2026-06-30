import { NextResponse } from 'next/server';
import { getCategories } from '@/lib/geostat';

export const maxDuration = 30;

export async function GET() {
  try {
    const categories = await getCategories('en');
    return NextResponse.json({ categories });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch categories';
    return NextResponse.json({ error: msg, categories: [] }, { status: 500 });
  }
}
