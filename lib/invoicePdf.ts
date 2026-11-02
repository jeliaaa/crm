import PDFDocument from 'pdfkit';
import path from 'path';
import {
  InvoiceData, InvoiceLang, InvoiceSettings, LabelKey, formatDate, invoiceTotal, itemDescription, label, money,
  paymentReference, providerAddress, providerDirector, providerName,
} from './invoice';
import { SIGNATURE_ASPECT, SIGNATURE_PNG_BASE64 } from './invoiceSignature';

// Noto Sans ships Georgian and Latin as separate subset files, so every run of
// text is drawn with whichever font covers it (see runs()).
const FONT_ROOT = path.join(process.cwd(), 'node_modules/@fontsource');
const FONTS = {
  'ka-400': 'noto-sans-georgian/files/noto-sans-georgian-georgian-400-normal.woff',
  'ka-700': 'noto-sans-georgian/files/noto-sans-georgian-georgian-700-normal.woff',
  'la-400': 'noto-sans-georgian/files/noto-sans-georgian-latin-400-normal.woff',
  'la-700': 'noto-sans-georgian/files/noto-sans-georgian-latin-700-normal.woff',
  // Only the latin-ext subset has the lari sign.
  'lx-400': 'noto-sans-georgian/files/noto-sans-georgian-latin-ext-400-normal.woff',
  'lx-700': 'noto-sans-georgian/files/noto-sans-georgian-latin-ext-700-normal.woff',
  'cy-400': 'noto-sans/files/noto-sans-cyrillic-400-normal.woff',
  'cy-700': 'noto-sans/files/noto-sans-cyrillic-700-normal.woff',
} as const;

const NAVY = '#2b3a4f';
const GREY = '#666666';
const LIGHT = '#cccccc';
const M = 56; // page margin

const GEORGIAN = /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/;
const CYRILLIC = /[Ѐ-ԯ№]/;
const LARI = /₾/;

type Script = 'ka' | 'cy' | 'lx' | 'la';
type Run = { text: string; script: Script };

// Splits a string into maximal single-script runs. The Georgian and Cyrillic
// subsets have no spaces, digits or punctuation, so those fall to Latin.
// Arrows aren't in any of the fonts, so they're drawn as an en dash.
function runs(text: string): Run[] {
  const out: Run[] = [];
  for (const ch of text.replace(/[→⇒➔➜]/g, '–')) {
    const script: Script = GEORGIAN.test(ch) ? 'ka' : CYRILLIC.test(ch) ? 'cy' : LARI.test(ch) ? 'lx' : 'la';
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

export function renderInvoicePdf(inv: InvoiceData, lang: InvoiceLang, settings: InvoiceSettings): Promise<Buffer> {
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
      draw(doc, inv, lang, settings);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function draw(doc: PDFKit.PDFDocument, inv: InvoiceData, lang: InvoiceLang, st: InvoiceSettings) {
  const w = new Writer(doc);
  const L = (k: LabelKey) => label(lang, k);
  const pageW = doc.page.width - M * 2;
  const total = invoiceTotal(inv.items);
  const rule = (ry: number, color = LIGHT, lw = 0.5) =>
    doc.moveTo(M, ry).lineTo(M + pageW, ry).lineWidth(lw).strokeColor(color).stroke();

  // ── Header: provider | INVOICE
  const half = pageW * 0.55;
  const rx = M + half;
  const rw = pageW - half;
  let y = M;
  let ly = w.text(providerName(st, lang), M, y, { size: 13, bold: true, color: NAVY, width: half });
  for (const l of [providerAddress(st, lang), st.email, st.phone].filter(Boolean)) {
    ly = w.text(l, M, ly, { size: 8.5, color: GREY, width: half });
  }

  let ry = w.text(L('invoice'), rx, y, { size: 20, bold: true, color: NAVY, align: 'right', width: rw });
  ry = w.text(`${L('invoiceNo')} ${inv.number}`, rx, ry, { size: 9, color: GREY, align: 'right', width: rw });

  y = Math.max(ly, ry) + 10;
  rule(y, NAVY, 1);
  y += 14;

  // ── Billed to | dates
  const labelW = 70;
  let by = w.text(L('billTo'), M, y, { size: 8, bold: true, color: '#888888', width: half }) + 2;
  by = w.text(inv.client.name, M, by, { size: 10, bold: true, width: half });
  const clientRows: [LabelKey, string][] = [
    ['address', inv.client.address],
    ['email', inv.client.email],
    ['phone', inv.client.phone],
  ];
  for (const [k, v] of clientRows) {
    if (!v) continue;
    w.text(L(k), M, by, { size: 9, color: GREY, width: labelW });
    by = w.text(v, M + labelW, by, { size: 9, color: '#222222', width: half - labelW });
  }

  const dateRow = (k: LabelKey, v: string, dy: number) => {
    w.text(L(k), rx, dy, { size: 9, color: GREY, width: rw });
    return w.text(v, rx, dy, { size: 9, align: 'right', width: rw });
  };
  let dy = y + 12;
  dy = dateRow('date', formatDate(inv.date), dy);
  if (inv.dueDate) dy = dateRow('dueDate', formatDate(inv.dueDate), dy);
  y = Math.max(by, dy) + 16;

  // ── Services table: №, service, unit, quantity, price
  const widths = [0.07, 0.47, 0.1, 0.15, 0.21].map((f) => f * pageW);
  const xs: number[] = [];
  widths.reduce((acc, cw) => (xs.push(M + acc), acc + cw), 0);
  const pad = 6;
  const cell = (text: string, i: number, cy: number, o: Opts) =>
    w.text(text, xs[i] + pad, cy, { ...o, width: widths[i] - pad * 2 });
  const alignOf = (i: number): 'left' | 'right' | 'center' => (i === 1 ? 'left' : i === 4 ? 'right' : 'center');

  const drawHead = (cy: number) => {
    const headers = [L('no'), L('service'), L('unit'), L('quantity'), L('price')];
    const hh = Math.max(...headers.map((h, i) => w.height(h, widths[i] - pad * 2, { size: 8, bold: true }))) + 10;
    doc.rect(M, cy, pageW, hh).fill(NAVY);
    headers.forEach((h, i) => cell(h, i, cy + 5, { size: 8, bold: true, color: '#ffffff', align: alignOf(i) }));
    return cy + hh;
  };
  y = drawHead(y);

  inv.items.forEach((it, idx) => {
    const desc = itemDescription(it, lang);
    const rh = Math.max(w.height(desc, widths[1] - pad * 2, { size: 9 }), 14) + 10;
    if (y + rh > doc.page.height - M - 40) {
      doc.addPage();
      y = drawHead(M);
    }
    if (idx % 2 === 1) doc.rect(M, y, pageW, rh).fill('#f4f6f8');
    cell(String(idx + 1), 0, y + 5, { size: 9, align: 'center' });
    cell(desc, 1, y + 5, { size: 9 });
    cell(L('pageUnit'), 2, y + 5, { size: 9, align: 'center' });
    cell(String(it.pages), 3, y + 5, { size: 9, align: 'center' });
    cell(money(it.price), 4, y + 5, { size: 9, align: 'right' });
    rule(y + rh);
    y += rh;
  });

  // Total row
  const th = 24;
  doc.rect(M, y, pageW, th).fill(NAVY);
  w.text(L('total'), M + pad, y + 6, { size: 10, bold: true, color: '#ffffff', width: pageW * 0.6 });
  w.text(money(total), xs[4] + pad, y + 6, { size: 10, bold: true, color: '#ffffff', align: 'right', width: widths[4] - pad * 2 });
  y += th + 18;

  // ── Bank details (two label/value pairs per row)
  const pairs: [string, string][] = [
    [L('recipient'), providerName(st, lang)],
    [L('bankName'), st.bankName],
    ['IBAN', st.iban],
    ['SWIFT', st.swift],
  ];
  const shown = pairs.filter(([, v]) => v);
  if (shown.length) {
    if (y + 110 > doc.page.height - M) {
      doc.addPage();
      y = M;
    }
    rule(y - 8);
    y = w.text(L('bank'), M, y + 4, { size: 8, bold: true, color: '#888888', width: pageW }) + 4;
    const colW = pageW / 2;
    const lw = 62;
    for (let i = 0; i < shown.length; i += 2) {
      let rowEnd = y;
      shown.slice(i, i + 2).forEach(([k, v], j) => {
        const cx = M + j * colW;
        w.text(k, cx, y, { size: 9, color: GREY, width: lw });
        rowEnd = Math.max(rowEnd, w.text(v, cx + lw, y, { size: 9, color: '#222222', width: colW - lw - 10 }));
      });
      y = rowEnd + 2;
    }
    y += 8;
  }

  // Payment reference box
  const refText = `${L('reference')}: ${paymentReference(lang, inv.number)}`;
  const noteText = L('referenceNote');
  const boxH =
    w.height(refText, pageW - 24, { size: 9, bold: true }) + w.height(noteText, pageW - 24, { size: 7.5 }) + 14;
  if (y + boxH > doc.page.height - M) {
    doc.addPage();
    y = M;
  }
  doc.rect(M, y, pageW, boxH).fill('#f4f6f8');
  doc.rect(M, y, 3, boxH).fill(NAVY);
  const refEnd = w.text(refText, M + 14, y + 6, { size: 9, bold: true, color: '#222222', width: pageW - 24 });
  w.text(noteText, M + 14, refEnd, { size: 7.5, color: GREY, width: pageW - 24 });
  y += boxH + 10;

  if (inv.notes) {
    y = w.text(L('notes'), M, y, { size: 8, bold: true, color: '#888888', width: pageW }) + 2;
    y = w.text(inv.notes, M, y, { size: 9, color: '#333333', width: pageW }) + 8;
  }

  // ── Director + signature, right-aligned under a rule
  const sigW = 120;
  const sigH = sigW / SIGNATURE_ASPECT;
  if (y + sigH + 50 > doc.page.height - M) {
    doc.addPage();
    y = M;
  }
  y += 14;
  rule(y - 8);
  const director = providerDirector(st, lang);
  if (director) {
    y = w.text(`${L('director')}: ${director}`, M + pageW * 0.4, y, {
      size: 9, bold: true, color: '#333333', align: 'right', width: pageW * 0.6,
    });
  }
  doc.image(Buffer.from(SIGNATURE_PNG_BASE64, 'base64'), M + pageW - sigW - 10, y + 2, { width: sigW });
}
