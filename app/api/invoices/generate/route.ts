import { NextRequest, NextResponse } from 'next/server';
import { InvoiceFormat, InvoiceLang, fileBase, parseInvoice } from '@/lib/invoice';
import { renderInvoicePdf } from '@/lib/invoicePdf';
import { renderInvoiceDocx } from '@/lib/invoiceDocx';
import { loadInvoiceSettings } from '@/lib/invoiceSettings';

export const runtime = 'nodejs';

const LANGS: InvoiceLang[] = ['ka', 'en', 'both'];
const FORMATS: InvoiceFormat[] = ['pdf', 'docx'];

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const invoice = parseInvoice(body?.invoice);
  if (typeof invoice === 'string') return NextResponse.json({ error: invoice }, { status: 400 });

  const lang = LANGS.includes(body?.lang) ? (body.lang as InvoiceLang) : 'ka';
  const format = FORMATS.includes(body?.format) ? (body.format as InvoiceFormat) : 'pdf';

  try {
    const settings = await loadInvoiceSettings();
    const buffer =
      format === 'pdf' ? await renderInvoicePdf(invoice, lang, settings) : await renderInvoiceDocx(invoice, lang, settings);
    const type =
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': type,
        'Content-Disposition': `attachment; filename="${fileBase(invoice, lang)}.${format}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not build the invoice' }, { status: 500 });
  }
}
