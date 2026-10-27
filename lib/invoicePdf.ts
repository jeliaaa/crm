import PDFDocument from 'pdfkit';
import path from 'path';
import {
  InvoiceData, InvoiceLang, LabelKey, PROVIDER, clientIdLabel, formatDate, invoiceTotal, label, money,
  providerAddress, providerDirector, providerName,
} from './invoice';

// Noto Sans ships Georgian and Latin as separate subset files, so every run of
// text is drawn with whichever font covers it (see runs()).
const FONT_ROOT = path.join(process.cwd(), 'node_modules/@fontsource');
const FONTS = {
  'ka-400': 'noto-sans-georgian/files/noto-sans-georgian-georgian-400-normal.woff',
  'ka-700': 'noto-sans-georgian/files/noto-sans-georgian-georgian-700-normal.woff',
  'la-400': 'noto-sans-georgian/files/noto-sans-georgian-latin-400-normal.woff',
  'la-700': 'noto-sans-georgian/files/noto-sans-georgian-latin-700-normal.woff',
  'cy-400': 'noto-sans/files/noto-sans-cyrillic-400-normal.woff',
  'cy-700': 'noto-sans/files/noto-sans-cyrillic-700-normal.woff',
} as const;

const NAVY = '#1a2c50';
const GREY = '#666666';
const LIGHT = '#cccccc';
const M = 56; // page margin

const GEORGIAN = /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/;
const CYRILLIC = /[Ѐ-ԯ№]/;

type Script = 'ka' | 'cy' | 'la';
type Run = { text: string; script: Script };

// Splits a string into maximal single-script runs. The Georgian and Cyrillic
// subsets have no spaces, digits or punctuation, so those fall to Latin.
// Arrows aren't in any of the fonts, so they're drawn as an en dash.
function runs(text: string): Run[] {
  const out: Run[] = [];
  for (const ch of text.replace(/[→⇒➔➜]/g, '–')) {
    const script: Script = GEORGIAN.test(ch) ? 'ka' : CYRILLIC.test(ch) ? 'cy' : 'la';
    const last = out[out.length - 1];
    if (last && last.script === script) last.text += ch;
    else out.push({ text: ch, script });
  }
  return out;
}

type Opts = { size?: number; bold?: boolean; color?: string; align?: 'left' | 'right' | 'center'; width?: number };

class Writer {
  constructor(private doc: PDFKit.PDFDocument) {}

  private fontFor(run: Run, bold: boolean) {
    return `${run.script}-${bold ? 700 : 400}`;
  }

  width(text: string, size: number, bold: boolean): number {
    let w = 0;
    for (const r of runs(text)) w += this.doc.font(this.fontFor(r, bold)).fontSize(size).widthOfString(r.text);
    return w;
  }

  // Greedy word wrap using the mixed-font width.
  lines(text: string, size: number, bold: boolean, maxWidth: number): string[] {
    const out: string[] = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && this.width(next, size, bold) > maxWidth) {
          out.push(line);
          line = word;
        } else line = next;
      }
      out.push(line);
    }
    return out;
  }

  height(text: string, width: number, o: Opts = {}): number {
    const size = o.size ?? 9;
    return this.lines(text, size, !!o.bold, width).length * size * 1.45;
  }

  // Draws wrapped text at (x, y) and returns the y below it.
  text(text: string, x: number, y: number, o: Opts = {}): number {
    const size = o.size ?? 9;
    const bold = !!o.bold;
    const width = o.width ?? 400;
    const step = size * 1.45;
    for (const line of this.lines(text, size, bold, width)) {
      const w = this.width(line, size, bold);
      let cx = o.align === 'right' ? x + width - w : o.align === 'center' ? x + (width - w) / 2 : x;
      for (const r of runs(line)) {
        this.doc.font(this.fontFor(r, bold)).fontSize(size).fillColor(o.color ?? '#222222');
        this.doc.text(r.text, cx, y, { lineBreak: false });
        cx += this.doc.widthOfString(r.text);
      }
      y += step;
    }
    return y;
  }
}

export function renderInvoicePdf(inv: InvoiceData, lang: InvoiceLang): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // The initial font is one of ours so pdfkit never goes looking for its
    // bundled Helvetica data files, which the server bundle may have moved.
    const doc = new PDFDocument({ size: 'A4', margin: M, font: path.join(FONT_ROOT, FONTS['la-400']) });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      for (const [k, file] of Object.entries(FONTS)) doc.registerFont(k, path.join(FONT_ROOT, file));
      draw(doc, inv, lang);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function draw(doc: PDFKit.PDFDocument, inv: InvoiceData, lang: InvoiceLang) {
  const w = new Writer(doc);
  const L = (k: LabelKey) => label(lang, k);
  const pageW = doc.page.width - M * 2;
  const total = invoiceTotal(inv.items);

  // ── Header: provider | INVOICE
  const half = pageW * 0.55;
  const rx = M + half;
  const rw = pageW - half;
  let y = M;
  let ly = w.text(providerName(lang), M, y, { size: 13, bold: true, color: NAVY, width: half });
  const provLines = [
    providerAddress(lang),
    PROVIDER.idNumber && `${label(lang, 'idCompany')}: ${PROVIDER.idNumber}`,
    PROVIDER.email,
    PROVIDER.phone,
  ].filter(Boolean) as string[];
  for (const l of provLines) ly = w.text(l, M, ly, { size: 8.5, color: GREY, width: half });

  let ry = w.text(L('invoice'), rx, y, { size: 20, bold: true, color: NAVY, align: 'right', width: rw });
  ry = w.text(`${L('no')} ${inv.number}`, rx, ry, { size: 9, color: GREY, align: 'right', width: rw });

  y = Math.max(ly, ry) + 10;
  doc.moveTo(M, y).lineTo(M + pageW, y).lineWidth(1).strokeColor(NAVY).stroke();
  y += 14;

  // ── Billed to | dates
  let by = w.text(L('billTo'), M, y, { size: 8, bold: true, color: '#888888', width: half });
  by = w.text(inv.client.name, M, by, { size: 11, bold: true, width: half });
  const clientLines = [
    inv.client.idNumber && `${clientIdLabel(lang, inv.clientType)}: ${inv.client.idNumber}`,
    inv.client.address,
    inv.client.email,
    inv.client.phone,
  ].filter(Boolean) as string[];
  for (const l of clientLines) by = w.text(l, M, by, { size: 9, color: '#444444', width: half });

  let dy = w.text(L('date'), rx, y, { size: 8, color: '#888888', align: 'right', width: rw });
  dy = w.text(formatDate(inv.date), rx, dy, { size: 10, align: 'right', width: rw }) + 4;
  if (inv.dueDate) {
    dy = w.text(L('dueDate'), rx, dy, { size: 8, color: '#888888', align: 'right', width: rw });
    dy = w.text(formatDate(inv.dueDate), rx, dy, { size: 10, align: 'right', width: rw });
  }
  y = Math.max(by, dy) + 16;

  // ── Services table: №, language pair, documents, pages, price
  const widths = [0.07, 0.38, 0.17, 0.14, 0.24].map((f) => f * pageW);
  const xs: number[] = [];
  widths.reduce((acc, cw) => (xs.push(M + acc), acc + cw), 0);
  const pad = 6;
  const cell = (text: string, i: number, cy: number, o: Opts) =>
    w.text(text, xs[i] + pad, cy, { ...o, width: widths[i] - pad * 2 });
  const alignOf = (i: number): 'left' | 'right' | 'center' => (i === 1 ? 'left' : i === 4 ? 'right' : 'center');

  const drawHead = (cy: number) => {
    const headers = [L('no'), `${L('translation')} — ${L('languagePair')}`, L('documents'), L('pages'), L('price')];
    const hh = Math.max(...headers.map((h, i) => w.height(h, widths[i] - pad * 2, { size: 8, bold: true }))) + 10;
    doc.rect(M, cy, pageW, hh).fill(NAVY);
    headers.forEach((h, i) => cell(h, i, cy + 5, { size: 8, bold: true, color: '#ffffff', align: alignOf(i) }));
    return cy + hh;
  };
  y = drawHead(y);

  inv.items.forEach((it, idx) => {
    const pair = it.languagePair || '—';
    const rh = Math.max(w.height(pair, widths[1] - pad * 2, { size: 9 }), 14) + 10;
    if (y + rh > doc.page.height - M - 40) {
      doc.addPage();
      y = drawHead(M);
    }
    if (idx % 2 === 1) doc.rect(M, y, pageW, rh).fill('#f4f6f8');
    cell(String(idx + 1), 0, y + 5, { size: 9, align: 'center' });
    cell(pair, 1, y + 5, { size: 9 });
    cell(String(it.documents), 2, y + 5, { size: 9, align: 'center' });
    cell(String(it.pages), 3, y + 5, { size: 9, align: 'center' });
    cell(money(it.price), 4, y + 5, { size: 9, align: 'right' });
    doc.moveTo(M, y + rh).lineTo(M + pageW, y + rh).lineWidth(0.5).strokeColor(LIGHT).stroke();
    y += rh;
  });

  // Total row
  const th = 24;
  doc.rect(M, y, pageW, th).fill(NAVY);
  w.text(L('total'), M + pad, y + 6, { size: 10, bold: true, color: '#ffffff', width: pageW * 0.6 });
  w.text(money(total), xs[4] + pad, y + 6, { size: 10, bold: true, color: '#ffffff', align: 'right', width: widths[4] - pad * 2 });
  y += th + 18;

  // ── Bank details
  const bank = PROVIDER.bank;
  if (bank.iban || bank.name) {
    y = w.text(L('bank'), M, y, { size: 8, bold: true, color: '#888888', width: pageW }) + 2;
    y = w.text(`${L('recipient')}: ${providerName(lang)}`, M, y, { size: 9, color: '#333333', width: pageW });
    if (bank.name) y = w.text(`${L('bankName')}: ${bank.name}`, M, y, { size: 9, color: '#333333', width: pageW });
    if (bank.iban) y = w.text(`IBAN: ${bank.iban}`, M, y, { size: 9, color: '#333333', width: pageW });
    if (bank.swift) y = w.text(`SWIFT: ${bank.swift}`, M, y, { size: 9, color: '#333333', width: pageW });
    y += 6;
  }
  y = w.text(`${L('reference')}: ${inv.number}`, M, y, { size: 9, bold: true, color: NAVY, width: pageW }) + 8;

  if (inv.notes) {
    y = w.text(L('notes'), M, y, { size: 8, bold: true, color: '#888888', width: pageW }) + 2;
    y = w.text(inv.notes, M, y, { size: 9, color: '#333333', width: pageW }) + 8;
  }

  // ── Signature
  if (y + 60 > doc.page.height - M) {
    doc.addPage();
    y = M;
  }
  y += 10;
  const director = providerDirector(lang);
  if (director) y = w.text(`${L('director')}: ${director}`, M, y, { size: 9, color: '#333333', width: pageW });
  w.text(`${L('signature')}: ___________________`, M, y + 12, { size: 9, color: '#999999', width: pageW });
}
