import { NextResponse } from 'next/server';
import { getCategories, getLegalForms } from '@/lib/geostat';

export const maxDuration = 30;

export async function GET() {
  try {
    const [categories, legalForms] = await Promise.all([
      getCategories('en'),
      getLegalForms('ge'), // Georgian abbreviations are how users recognize them
    ]);
    return NextResponse.json({ categories, legalForms });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch metadata';
    return NextResponse.json({ error: msg, categories: [], legalForms: [] }, { status: 500 });
  }
}
