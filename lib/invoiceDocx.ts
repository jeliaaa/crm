import {
  AlignmentType, BorderStyle, Document, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun,
  WidthType,
} from 'docx';
import {
  InvoiceData, InvoiceLang, InvoiceSettings, LabelKey, formatDate, invoiceTotal, itemDescription, label, money,
  paymentReference, providerAddress, providerDirector, providerName,
} from './invoice';
import { SIGNATURE_ASPECT, SIGNATURE_PNG_BASE64 } from './invoiceSignature';

// Sylfaen ships with Word on Windows and covers Georgian and Latin; other
// systems substitute a font that does.
const FONT = 'Sylfaen';
const NAVY = '2B3A4F';
const GREY = '666666';

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };

function p(text: string, o: { size?: number; bold?: boolean; color?: string; align?: Align; after?: number } = {}) {
  return new Paragraph({
    alignment: o.align,
    spacing: { after: o.after ?? 40 },
    children: [new TextRun({ text, font: FONT, size: Math.round((o.size ?? 9) * 2), bold: o.bold, color: o.color })],
  });
}

// One paragraph per line, so the two-language service text stacks.
const lines = (text: string, o: Parameters<typeof p>[1] = {}) => text.split('\n').map((t) => p(t, o));

function cell(children: Paragraph[], width: number, o: { fill?: string; span?: number; borders?: object } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: o.span,
    margins: { top: 70, bottom: 70, left: 100, right: 100 },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
    borders: o.borders,
    children,
  });
}

export async function renderInvoiceDocx(inv: InvoiceData, lang: InvoiceLang, st: InvoiceSettings): Promise<Buffer> {
  const L = (k: LabelKey) => label(lang, k);
  const total = invoiceTotal(inv.items);
  const W = 9638; // 17cm text width in DXA (A4 minus 2cm margins)
  const left = Math.round(W * 0.55);
  const right = W - left;

  const provider = [
    p(providerName(st, lang), { size: 13, bold: true, color: NAVY }),
    ...[providerAddress(st, lang), st.email, st.phone].filter(Boolean).map((t) => p(t, { size: 8.5, color: GREY })),
  ];

  const header = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [left, right],
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          cell(provider, left),
          cell(
            [
              p(L('invoice'), { size: 20, bold: true, color: NAVY, align: AlignmentType.RIGHT }),
              p(`${L('invoiceNo')} ${inv.number}`, { color: GREY, align: AlignmentType.RIGHT }),
            ],
            right
          ),
        ],
      }),
    ],
  });

  const clientRows: [LabelKey, string][] = [
    ['address', inv.client.address],
    ['email', inv.client.email],
    ['phone', inv.client.phone],
  ];
  const client = [
    p(L('billTo'), { size: 8, bold: true, color: '888888' }),
    p(inv.client.name, { size: 10, bold: true }),
    ...clientRows.filter(([, v]) => v).map(([k, v]) => p(`${L(k)}:  ${v}`, { color: '444444' })),
  ];
  const dateLine = (k: LabelKey, v: string) => p(`${L(k)}:  ${v}`, { align: AlignmentType.RIGHT });
  const dates = [dateLine('date', formatDate(inv.date)), ...(inv.dueDate ? [dateLine('dueDate', formatDate(inv.dueDate))] : [])];
  const bill = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [left, right],
    borders: noBorders,
    rows: [new TableRow({ children: [cell(client, left), cell(dates, right)] })],
  });

  const cw = [0.07, 0.47, 0.1, 0.15, 0.21].map((f) => Math.round(f * W));
  const aligns: Align[] = [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.RIGHT];
  const heads = [L('no'), L('service'), L('unit'), L('quantity'), L('price')];
  const line = { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' };

  const rows = [
    new TableRow({
      tableHeader: true,
      children: heads.map((h, i) =>
        cell([p(h, { size: 8, bold: true, color: 'FFFFFF', align: aligns[i], after: 0 })], cw[i], { fill: NAVY })
      ),
    }),
    ...inv.items.map((it, idx) => {
      const fill = idx % 2 === 1 ? 'F4F6F8' : undefined;
      const cells = [
        [p(String(idx + 1), { align: aligns[0], after: 0 })],
        lines(itemDescription(it, lang), { align: aligns[1], after: 0 }),
        [p(L('pageUnit'), { align: aligns[2], after: 0 })],
        [p(String(it.pages), { align: aligns[3], after: 0 })],
        [p(money(it.price), { align: aligns[4], after: 0 })],
      ];
      return new TableRow({ children: cells.map((c, i) => cell(c, cw[i], { fill })) });
    }),
    new TableRow({
      children: [
        cell([p(L('total'), { size: 10, bold: true, color: 'FFFFFF', after: 0 })], cw[0] + cw[1] + cw[2] + cw[3], { fill: NAVY, span: 4 }),
        cell([p(money(total), { size: 10, bold: true, color: 'FFFFFF', align: AlignmentType.RIGHT, after: 0 })], cw[4], { fill: NAVY }),
      ],
    }),
  ];
  const services = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: cw,
    borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
    rows,
  });

  const gap = () => new Paragraph({ spacing: { after: 160 }, children: [] });

  const body: (Paragraph | Table)[] = [
    header,
    new Paragraph({ spacing: { after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 1 } }, children: [] }),
    bill,
    gap(),
    services,
    gap(),
  ];

  // Bank details: two label/value pairs per row.
  const pairs: [string, string][] = ([
    [L('recipient'), providerName(st, lang)],
    [L('bankName'), st.bankName],
    ['IBAN', st.iban],
    ['SWIFT', st.swift],
  ] as [string, string][]).filter(([, v]) => v);
  if (pairs.length) {
    const bw = [0.14, 0.36, 0.14, 0.36].map((f) => Math.round(f * W));
    const bankRows: TableRow[] = [];
    for (let i = 0; i < pairs.length; i += 2) {
      const chunk = pairs.slice(i, i + 2);
      const cells = chunk.flatMap(([k, v], j) => [
        cell([p(k, { color: GREY, after: 0 })], bw[j * 2]),
        cell([p(v, { color: '222222', after: 0 })], bw[j * 2 + 1]),
      ]);
      if (chunk.length === 1) cells.push(cell([p('', { after: 0 })], bw[2]), cell([p('', { after: 0 })], bw[3]));
      bankRows.push(new TableRow({ children: cells }));
    }
    body.push(
      p(L('bank'), { size: 8, bold: true, color: '888888' }),
      new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: bw, borders: noBorders, rows: bankRows }),
      gap()
    );
  }

  // Payment reference: shaded box with a navy left bar.
  const bar = { style: BorderStyle.SINGLE, size: 24, color: NAVY };
  body.push(
    new Table({
      width: { size: W, type: WidthType.DXA },
      columnWidths: [W],
      borders: noBorders,
      rows: [
        new TableRow({
          children: [
            cell(
              [
                p(`${L('reference')}: ${paymentReference(lang, inv.number)}`, { bold: true, color: '222222', after: 20 }),
                p(L('referenceNote'), { size: 7.5, color: GREY, after: 0 }),
              ],
              W,
              { fill: 'F4F6F8', borders: { left: bar, top: none, bottom: none, right: none } }
            ),
          ],
        }),
      ],
    }),
    gap()
  );

  if (inv.notes) body.push(p(L('notes'), { size: 8, bold: true, color: '888888' }), p(inv.notes, { color: '333333', after: 160 }));

  const director = providerDirector(st, lang);
  if (director) body.push(p(`${L('director')}: ${director}`, { bold: true, color: '333333', align: AlignmentType.RIGHT }));
  const sigW = 120;
  body.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new ImageRun({
          type: 'png',
          data: Buffer.from(SIGNATURE_PNG_BASE64, 'base64'),
          transformation: { width: sigW, height: Math.round(sigW / SIGNATURE_ASPECT) },
        }),
      ],
    })
  );

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 18 } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        children: body,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
