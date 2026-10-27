import {
  AlignmentType, BorderStyle, Document, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import {
  InvoiceData, InvoiceLang, LabelKey, PROVIDER, clientIdLabel, formatDate, invoiceTotal, label, money,
  providerAddress, providerDirector, providerName,
} from './invoice';

// Sylfaen ships with Word on Windows and covers Georgian and Latin; other
// systems substitute a font that does.
const FONT = 'Sylfaen';
const NAVY = '1A2C50';
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

function cell(children: Paragraph[], width: number, o: { fill?: string; span?: number } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: o.span,
    margins: { top: 70, bottom: 70, left: 100, right: 100 },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
    children,
  });
}

export async function renderInvoiceDocx(inv: InvoiceData, lang: InvoiceLang): Promise<Buffer> {
  const L = (k: LabelKey) => label(lang, k);
  const total = invoiceTotal(inv.items);
  const W = 9638; // 17cm text width in DXA (A4 minus 2cm margins)
  const left = Math.round(W * 0.55);
  const right = W - left;

  const provider = [
    p(providerName(lang), { size: 13, bold: true, color: NAVY }),
    ...([
      providerAddress(lang),
      PROVIDER.idNumber && `${label(lang, 'idCompany')}: ${PROVIDER.idNumber}`,
      PROVIDER.email,
      PROVIDER.phone,
    ].filter(Boolean) as string[]).map((t) => p(t, { size: 8.5, color: GREY })),
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
              p(`${L('no')} ${inv.number}`, { color: GREY, align: AlignmentType.RIGHT }),
            ],
            right
          ),
        ],
      }),
    ],
  });

  const client = [
    p(L('billTo'), { size: 8, bold: true, color: '888888' }),
    p(inv.client.name, { size: 11, bold: true }),
    ...([
      inv.client.idNumber && `${clientIdLabel(lang, inv.clientType)}: ${inv.client.idNumber}`,
      inv.client.address,
      inv.client.email,
      inv.client.phone,
    ].filter(Boolean) as string[]).map((t) => p(t, { color: '444444' })),
  ];
  const dates = [
    p(L('date'), { size: 8, color: '888888', align: AlignmentType.RIGHT }),
    p(formatDate(inv.date), { size: 10, align: AlignmentType.RIGHT, after: 100 }),
    ...(inv.dueDate
      ? [
          p(L('dueDate'), { size: 8, color: '888888', align: AlignmentType.RIGHT }),
          p(formatDate(inv.dueDate), { size: 10, align: AlignmentType.RIGHT }),
        ]
      : []),
  ];
  const bill = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [left, right],
    borders: noBorders,
    rows: [new TableRow({ children: [cell(client, left), cell(dates, right)] })],
  });

  const cw = [0.07, 0.38, 0.17, 0.14, 0.24].map((f) => Math.round(f * W));
  const aligns: Align[] = [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.RIGHT];
  const heads = [L('no'), `${L('translation')} — ${L('languagePair')}`, L('documents'), L('pages'), L('price')];
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
      const vals = [String(idx + 1), it.languagePair || '—', String(it.documents), String(it.pages), money(it.price)];
      return new TableRow({ children: vals.map((v, i) => cell([p(v, { align: aligns[i], after: 0 })], cw[i], { fill })) });
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
  const bank = PROVIDER.bank;
  const director = providerDirector(lang);

  const body: (Paragraph | Table)[] = [
    header,
    new Paragraph({ spacing: { after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 1 } }, children: [] }),
    bill,
    gap(),
    services,
    gap(),
  ];
  if (bank.iban || bank.name) {
    body.push(p(L('bank'), { size: 8, bold: true, color: '888888' }), p(`${L('recipient')}: ${providerName(lang)}`, { color: '333333' }));
    if (bank.name) body.push(p(`${L('bankName')}: ${bank.name}`, { color: '333333' }));
    if (bank.iban) body.push(p(`IBAN: ${bank.iban}`, { color: '333333' }));
    if (bank.swift) body.push(p(`SWIFT: ${bank.swift}`, { color: '333333' }));
    body.push(gap());
  }
  body.push(p(`${L('reference')}: ${inv.number}`, { bold: true, color: NAVY, after: 160 }));
  if (inv.notes) body.push(p(L('notes'), { size: 8, bold: true, color: '888888' }), p(inv.notes, { color: '333333', after: 160 }));
  if (director) body.push(p(`${L('director')}: ${director}`, { color: '333333' }));
  body.push(p(`${L('signature')}: ___________________`, { color: '999999' }));

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
