import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { scrape, ScrapeMode } from '@/lib/scraper';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { mode, target, page, deep } = body as {
    mode: ScrapeMode;
    target: string;
    page: number;
    deep: boolean;
  };

  if (!mode || !target) {
    return NextResponse.json({ error: 'mode and target are required' }, { status: 400 });
  }

  let result;
  try {
    result = await scrape({ mode, target, page: page || 1, deep: deep || false });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Scrape failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (result.companies.length === 0) {
    return NextResponse.json({
      scraped: 0,
      inserted: 0,
      duplicates: 0,
      totalPages: result.totalPages,
      currentPage: result.currentPage,
    });
  }

  const rows = result.companies.map((c) => ({
    name: c.name,
    phone: c.phone || null,
    mobile: c.mobile || null,
    email: c.email || null,
    website: c.website || null,
    address: c.address || null,
    city: c.city || null,
    category: c.category || null,
    categories: c.categories,
    description: c.description || null,
    source_url: c.source_url || null,
    established_year: c.established_year,
    stage: 'lead',
  }));

  const { data: inserted, error } = await supabase
    .from('contacts')
    .upsert(rows, { onConflict: 'source_url', ignoreDuplicates: true })
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const insertedCount = inserted?.length ?? 0;
  const duplicates = result.companies.length - insertedCount;

  return NextResponse.json({
    scraped: result.companies.length,
    inserted: insertedCount,
    duplicates,
    totalPages: result.totalPages,
    currentPage: result.currentPage,
  });
}
