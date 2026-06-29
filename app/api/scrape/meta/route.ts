import { NextResponse } from 'next/server';
import { getCategories, getCities } from '@/lib/scraper';

export const maxDuration = 30;

export async function GET() {
  try {
    const [categories, cities] = await Promise.all([getCategories(), getCities()]);
    return NextResponse.json({ categories, cities });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch metadata';
    return NextResponse.json({ error: msg, categories: [], cities: [] }, { status: 500 });
  }
}
