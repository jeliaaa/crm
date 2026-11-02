import { NextRequest, NextResponse } from 'next/server';
import { loadInvoiceSettings, saveInvoiceSettings } from '@/lib/invoiceSettings';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ data: await loadInvoiceSettings() });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  try {
    return NextResponse.json({ data: await saveInvoiceSettings(body) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not save settings';
    return NextResponse.json(
      { error: /settings/.test(msg) ? `${msg} — run database/migrate-settings.sql in Supabase first` : msg },
      { status: 500 }
    );
  }
}
