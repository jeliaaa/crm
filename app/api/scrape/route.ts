import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { searchCategory, type RateLimitError } from '@/lib/geostat';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { code, sectionName, page, limit } = body as {
    code: string;
    sectionName: string;
    page: number;
    limit?: number;
  };

  if (!code || !sectionName) {
    return NextResponse.json({ error: 'code and sectionName are required' }, { status: 400 });
  }

  let result;
  try {
    result = await searchCategory({
      code,
      sectionName,
      page: page || 1,
      limit: limit || 100,
    });
  } catch (e: unknown) {
    const rl = e as RateLimitError;
    if (rl?.retryAfterMs) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfterMs: rl.retryAfterMs },
        { status: 429 }
      );
    }
    const msg = e instanceof Error ? e.message : 'Search failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (result.companies.length === 0) {
    return NextResponse.json({
      scraped: 0,
      inserted: 0,
      duplicates: 0,
      total: result.total,
      totalPages: result.totalPages,
      currentPage: result.page,
    });
  }

  const rows = result.companies.map((c) => ({
    stat_id: c.stat_id,
    name: c.name,
    identification_number: c.identification_number,
    phone: c.phone,
    email: c.email,
    website: c.website,
    address: c.address,
    city: c.city,
    region: c.region,
    category: c.category,
    activity_code: c.activity_code,
    categories: c.categories,
    head: c.head,
    partner: c.partner,
    ownership_type: c.ownership_type,
    business_size: c.business_size,
    description: c.description,
    established_year: c.established_year,
    source_url: c.source_url,
    stage: 'lead',
  }));

  const { data: inserted, error } = await supabase
    .from('contacts')
    .upsert(rows, { onConflict: 'stat_id', ignoreDuplicates: true })
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const insertedCount = inserted?.length ?? 0;

  return NextResponse.json({
    scraped: result.companies.length,
    inserted: insertedCount,
    duplicates: result.companies.length - insertedCount,
    total: result.total,
    totalPages: result.totalPages,
    currentPage: result.page,
  });
}
