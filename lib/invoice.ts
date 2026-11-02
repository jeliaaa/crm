// Invoice model shared by the form, the API route and both renderers.

export type InvoiceLang = 'ka' | 'en' | 'both';
export type InvoiceFormat = 'pdf' | 'docx';

export type InvoiceItem = {
  documentType: string; // e.g. წესდება — goes straight into the description text
  notarized: boolean; // appends the "including notarization" clause
  languagePair: string;
  pages: number;
  price: number;
};

export type InvoiceData = {
  number: string;
  date: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD or ''
  client: { name: string; address: string; email: string; phone: string };
  items: InvoiceItem[];
  notes: string;
};

export const CURRENCY = 'GEL';

// Service-provider details printed on every invoice. Defaults live here; the
// invoice page's settings panel stores overrides in the `settings` table.
export type InvoiceSettings = {
  nameKa: string;
  nameEn: string;
  addressKa: string;
  addressEn: string;
  email: string;
  phone: string;
  bankName: string;
  iban: string;
  swift: string;
  directorKa: string;
  directorEn: string;
};

export const DEFAULT_SETTINGS: InvoiceSettings = {
  nameKa: 'შპს თარგმნის სახლი',
  nameEn: 'Translation House LLC',
  addressKa: 'თბილისი, ცოტნე დადიანის ქუჩა 7, ოფისი A-316',
  addressEn: '7 Tsotne Dadiani St., office A-316, Tbilisi',
  email: 'info@th.com.ge',
  phone: '',
  bankName: 'Bank of Georgia',
  iban: 'GE79BG0000000612933755',
  swift: 'BAGAGE22',
  directorKa: 'თამარი პეტაშვილი',
  directorEn: 'Tamari Petashvili',
};

const LABELS = {
  invoice: { ka: 'ინვოისი', en: 'Invoice' },
  invoiceNo: { ka: 'ინვოისის №', en: 'Invoice №' },
  date: { ka: 'თარიღი', en: 'Date' },
  dueDate: { ka: 'გადახდის ვადა', en: 'Due date' },
  billTo: { ka: 'გამოწერილია', en: 'Billed to' },
  email: { ka: 'ელ-ფოსტა', en: 'Email' },
  phone: { ka: 'ტელეფონი', en: 'Phone' },
  address: { ka: 'მისამართი', en: 'Address' },
  no: { ka: '№', en: '№' },
  service: { ka: 'მომსახურების დასახელება', en: 'Service' },
  unit: { ka: 'ერთეული', en: 'Unit' },
  quantity: { ka: 'რაოდენობა', en: 'Quantity' },
  price: { ka: 'ფასი', en: 'Price' },
  total: { ka: 'სულ', en: 'Total' },
  bank: { ka: 'საბანკო რეკვიზიტები', en: 'Bank details' },
  recipient: { ka: 'მიმღები', en: 'Beneficiary' },
  bankName: { ka: 'ბანკი', en: 'Bank' },
  reference: { ka: 'გადახდის დანიშნულება', en: 'Payment reference' },
  order: { ka: 'შეკვეთა', en: 'Order' },
  referenceNote: {
    ka: 'გთხოვთ მიუთითოთ ეს ნომერი გადარიცხვის დანიშნულებაში',
    en: 'Please quote this number in the payment details',
  },
  notes: { ka: 'შენიშვნა', en: 'Notes' },
  director: { ka: 'დირექტორი', en: 'Director' },
  pageUnit: { ka: 'გვ.', en: 'pg.' },
} satisfies Record<string, { ka: string; en: string }>;

export type LabelKey = keyof typeof LABELS;

// 'both' renders "ქართული / English" so one document serves either reader.
export function label(lang: InvoiceLang, key: LabelKey): string {
  const l = LABELS[key];
  if (lang === 'ka') return l.ka;
  if (lang === 'en') return l.en;
  return l.ka === l.en ? l.en : `${l.ka} / ${l.en}`;
}

function pick(lang: InvoiceLang, ka: string, en: string): string {
  if (lang === 'ka') return ka || en;
  if (lang === 'en') return en || ka;
  return [ka, en].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' / ');
}

export const providerName = (s: InvoiceSettings, lang: InvoiceLang) => pick(lang, s.nameKa, s.nameEn);
export const providerAddress = (s: InvoiceSettings, lang: InvoiceLang) => pick(lang, s.addressKa, s.addressEn);
export const providerDirector = (s: InvoiceSettings, lang: InvoiceLang) => pick(lang, s.directorKa, s.directorEn);

// The service line is one sentence built from the form's inputs:
// "თარგმნა — წესდება (ინგლისური → ქართული) (მათ შორის თარგმანის ნოტარიულად დამოწმება)".
// 'both' gives the Georgian sentence with the English one on the next line.
export function itemDescription(it: InvoiceItem, lang: InvoiceLang): string {
  const build = (l: 'ka' | 'en') => {
    const head = l === 'ka' ? 'თარგმნა' : 'Translation';
    const notary = l === 'ka' ? 'მათ შორის თარგმანის ნოტარიულად დამოწმება' : 'including notarization of the translation';
    let out = it.documentType ? `${head} — ${it.documentType}` : head;
    if (it.languagePair) out += ` (${it.languagePair})`;
    if (it.notarized) out += ` (${notary})`;
    return out;
  };
  if (lang === 'ka') return build('ka');
  if (lang === 'en') return build('en');
  return `${build('ka')}\n${build('en')}`;
}

// "001431-20261102" → order #1431. Any other number is used as typed.
export function paymentReference(lang: InvoiceLang, number: string): string {
  const m = /^0*(\d+)-/.exec(number);
  return `${label(lang, 'order')} #${m ? m[1] : number}`;
}

export function money(value: number): string {
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₾`;
}

export function invoiceTotal(items: InvoiceItem[]): number {
  return Math.round(items.reduce((sum, i) => sum + i.price, 0) * 100) / 100;
}

export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

export function fileBase(inv: InvoiceData, lang: InvoiceLang): string {
  const safe = inv.number.replace(/[^\w.-]+/g, '_') || 'invoice';
  return `Invoice_${safe}_${lang.toUpperCase()}`;
}

// Parses and sanity-checks the request body; returns an error string or the data.
export function parseInvoice(raw: unknown): InvoiceData | string {
  if (!raw || typeof raw !== 'object') return 'Invalid invoice';
  const r = raw as Record<string, any>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  const items: InvoiceItem[] = (Array.isArray(r.items) ? r.items : [])
    .map((i: any) => ({
      documentType: str(i?.documentType),
      notarized: i?.notarized === true,
      languagePair: str(i?.languagePair),
      pages: Math.max(0, Math.round(num(i?.pages))),
      price: Math.max(0, num(i?.price)),
    }))
    .filter((i: InvoiceItem) => i.documentType || i.languagePair || i.pages || i.price);

  if (!items.length) return 'Add at least one service line';
  const c = r.client ?? {};
  const client = { name: str(c.name), address: str(c.address), email: str(c.email), phone: str(c.phone) };
  if (!client.name) return 'Client name is required';

  return {
    number: str(r.number) || 'INV',
    date: str(r.date),
    dueDate: str(r.dueDate),
    client,
    items,
    notes: str(r.notes),
  };
}

// Merges stored overrides onto the defaults, ignoring unknown or non-string keys.
export function mergeSettings(raw: unknown): InvoiceSettings {
  const out = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof InvoiceSettings)[]) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === 'string') out[k] = v.trim();
    }
  }
  return out;
}
