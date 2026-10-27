// Invoice model shared by the form, the API route and both renderers.

export type InvoiceLang = 'ka' | 'en' | 'both';
export type InvoiceFormat = 'pdf' | 'docx';
export type ClientType = 'individual' | 'company';

export type InvoiceItem = {
  documents: number;
  pages: number;
  languagePair: string;
  price: number;
};

export type InvoiceData = {
  number: string;
  date: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD or ''
  clientType: ClientType;
  client: { name: string; idNumber: string; address: string; email: string; phone: string };
  items: InvoiceItem[];
  notes: string;
};

export const CURRENCY = 'GEL';

// The service provider is always Translation House LLC. Registration and bank
// details come from env so they stay out of the repo; empty ones are skipped.
export const PROVIDER = {
  name: { ka: 'შპს თარგმნის სახლი', en: 'Translation House LLC' },
  idNumber: process.env.INVOICE_COMPANY_ID || '',
  address: {
    ka: process.env.INVOICE_COMPANY_ADDRESS_KA || '',
    en: process.env.INVOICE_COMPANY_ADDRESS_EN || '',
  },
  email: process.env.INVOICE_COMPANY_EMAIL || '',
  phone: process.env.INVOICE_COMPANY_PHONE || '',
  bank: {
    name: process.env.INVOICE_BANK_NAME || '',
    iban: process.env.INVOICE_BANK_IBAN || '',
    swift: process.env.INVOICE_BANK_SWIFT || '',
  },
  director: {
    ka: process.env.INVOICE_DIRECTOR_KA || '',
    en: process.env.INVOICE_DIRECTOR_EN || '',
  },
};

const LABELS: Record<string, { ka: string; en: string }> = {
  invoice: { ka: 'ინვოისი', en: 'Invoice' },
  date: { ka: 'თარიღი', en: 'Date' },
  dueDate: { ka: 'გადახდის ვადა', en: 'Due date' },
  billTo: { ka: 'გამოწერილია', en: 'Billed to' },
  provider: { ka: 'მომსახურების მიმწოდებელი', en: 'Service provider' },
  idCompany: { ka: 'საიდენტიფიკაციო კოდი', en: 'Tax ID' },
  idIndividual: { ka: 'პირადი ნომერი', en: 'Personal ID' },
  email: { ka: 'ელ-ფოსტა', en: 'Email' },
  phone: { ka: 'ტელეფონი', en: 'Phone' },
  no: { ka: 'ნომ.', en: 'No.' },
  service: { ka: 'მომსახურება', en: 'Service' },
  documents: { ka: 'დოკუმენტები', en: 'Documents' },
  pages: { ka: 'გვერდები', en: 'Pages' },
  languagePair: { ka: 'ენობრივი წყვილი', en: 'Language pair' },
  price: { ka: 'ფასი', en: 'Price' },
  total: { ka: 'სულ', en: 'Total' },
  translation: { ka: 'თარგმნის მომსახურება', en: 'Translation service' },
  bank: { ka: 'საბანკო რეკვიზიტები', en: 'Bank details' },
  recipient: { ka: 'მიმღები', en: 'Beneficiary' },
  bankName: { ka: 'ბანკი', en: 'Bank' },
  reference: { ka: 'გადახდის დანიშნულება', en: 'Payment reference' },
  notes: { ka: 'შენიშვნა', en: 'Notes' },
  director: { ka: 'დირექტორი', en: 'Director' },
  signature: { ka: 'ხელმოწერა', en: 'Signature' },
};

export type LabelKey =
  | 'invoice' | 'date' | 'dueDate' | 'billTo' | 'provider' | 'idCompany' | 'idIndividual' | 'email' | 'phone'
  | 'no' | 'service' | 'documents' | 'pages' | 'languagePair' | 'price' | 'total' | 'translation' | 'bank'
  | 'recipient' | 'bankName' | 'reference' | 'notes' | 'director' | 'signature';

// 'both' renders "ქართული / English" so one document serves either reader.
export function label(lang: InvoiceLang, key: LabelKey): string {
  const l = LABELS[key];
  if (lang === 'ka') return l.ka;
  if (lang === 'en') return l.en;
  return l.ka === l.en ? l.en : `${l.ka} / ${l.en}`;
}

export function clientIdLabel(lang: InvoiceLang, type: ClientType): string {
  return label(lang, type === 'company' ? 'idCompany' : 'idIndividual');
}

export function providerAddress(lang: InvoiceLang): string {
  const { ka, en } = PROVIDER.address;
  if (lang === 'ka') return ka || en;
  if (lang === 'en') return en || ka;
  return [ka, en].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' / ');
}

export function providerName(lang: InvoiceLang): string {
  const { ka, en } = PROVIDER.name;
  return lang === 'ka' ? ka : lang === 'en' ? en : `${ka} / ${en}`;
}

export function providerDirector(lang: InvoiceLang): string {
  const { ka, en } = PROVIDER.director;
  if (lang === 'ka') return ka || en;
  if (lang === 'en') return en || ka;
  return [ka, en].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' / ');
}

export function money(value: number): string {
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY}`;
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
      documents: Math.max(0, Math.round(num(i?.documents))),
      pages: Math.max(0, Math.round(num(i?.pages))),
      languagePair: str(i?.languagePair),
      price: Math.max(0, num(i?.price)),
    }))
    .filter((i: InvoiceItem) => i.languagePair || i.documents || i.pages || i.price);

  if (!items.length) return 'Add at least one service line';
  const c = r.client ?? {};
  const client = {
    name: str(c.name),
    idNumber: str(c.idNumber),
    address: str(c.address),
    email: str(c.email),
    phone: str(c.phone),
  };
  if (!client.name) return 'Client name is required';

  return {
    number: str(r.number) || 'INV',
    date: str(r.date),
    dueDate: str(r.dueDate),
    clientType: r.clientType === 'individual' ? 'individual' : 'company',
    client,
    items,
    notes: str(r.notes),
  };
}
