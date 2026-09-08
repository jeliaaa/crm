// Client for the yell.ge business directory (yellowpages.ge).
//
// A rubric page lists 25 companies per page and carries everything we need in
// the markup — name, phones, address, description, website, email and the
// company's other rubrics:
//
//   GET www.yell.ge/companies.php?lan=geo&rub=<rubric>&SR_pg=<page>
//
// The per-company detail page (company.php?id=…) adds nothing on top of that,
// so one request per listing page is enough. Page count comes from the pager
// ("გვერდი: 1 (8)"); there is no total-results counter anywhere on the page.

import axios from 'axios';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

const BASE = 'https://www.yell.ge';
export const YELL_PAGE_SIZE = 25; // fixed by the site

// Rubric 157 = "იურიდიული მომსახურება" (legal services).
export const YELL_LAW_RUBRIC = 157;
export const YELL_LAW_CATEGORY = 'LAW COMPANIES';

const http = axios.create({
  timeout: 25000,
  responseType: 'text',
  headers: {
    Accept: 'text/html',
    Referer: `${BASE}/`,
    'Accept-Language': 'ka,en;q=0.8',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
});

const SOCIAL = /facebook|instagram|linkedin|youtube|twitter|x\.com|tiktok|t\.me/i;

export type YellCompany = {
  name: string;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  description: string | null;
  categories: string[];
  source_url: string;
};

// Georgian national numbers are 9 digits. The directory prints them in four
// shapes: "+995 32 2 477 344", "032 224 30 30", "(595) 15 13 13" and the bare
// Tbilisi local form "296 39 24" — the last one needs the 32 area code back.
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('995')) return d.slice(3);
  if (d.length === 10 && d.startsWith('0')) return d.slice(1);
  if (d.length === 9) return d;
  if (d.length === 7) return `32${d}`;
  return null;
}

// "ტელ: Tel: +995 32 2 477 344,   Mob: +995 596 655 655" -> landline + 5xx mobile.
// Georgian mobile numbers all start with 5, so the second slot goes to a mobile
// whenever the listing has one, whatever order the site printed them in.
function parsePhones(raw: string): { phone: string | null; mobile: string | null } {
  const numbers = Array.from(
    new Set(
      raw
        .split(/[,;]|ტელ:|Tel:|Mob:|Fax:|ფაქსი:/i)
        .map((part) => normalizePhone(part))
        .filter((n): n is string => !!n)
    )
  );
  const landline = numbers.find((n) => !n.startsWith('5'));
  const phone = landline ?? numbers[0] ?? null;
  return { phone, mobile: numbers.find((n) => n !== phone) ?? null };
}

function clean(s: string | undefined | null): string | null {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t || null;
}

function parseCompany($: cheerio.CheerioAPI, el: AnyNode): YellCompany | null {
  const $b = $(el);
  const id = ($b.attr('id') || '').replace('SR_div_', '');
  if (!id) return null;

  // Two links share this href: the logo (an <img>, no text) and the name.
  const name = clean(
    $b
      .find(`a[href="company.php?lan=geo&id=${id}"]`)
      .filter((_, a) => !!$(a).text().trim())
      .first()
      .text()
  );
  if (!name) return null;

  const { phone, mobile } = parsePhones($b.find('.tel_font_companies').text());

  // The address sits next to the map-marker icon: "თბილისი. საბურთალო, ვაჟა-ფშაველას გამზირი 70გ"
  const rawAddress = clean(
    $b.find('img[src*="marker_map"]').first().closest('div').parent().text()
  );
  let city: string | null = null;
  let address = rawAddress;
  if (rawAddress) {
    const dot = rawAddress.indexOf('.');
    if (dot > 0 && dot < 30) {
      city = rawAddress.slice(0, dot).trim();
      address = clean(rawAddress.slice(dot + 1));
    }
  }

  const website =
    $b
      .find('a[href^="http"]')
      .filter((_, a) => $(a).text().trim().toLowerCase() === 'website')
      .map((_, a) => $(a).attr('href') || '')
      .get()
      .find((href) => href && !SOCIAL.test(href)) || null;

  const email = clean($b.find('a[href^="mailto:"]').first().attr('href')?.replace('mailto:', ''));

  const categories = Array.from(
    new Set(
      $b
        .find('a[href^="companies.php?lan=geo&rub="]')
        .map((_, a) => $(a).text().replace(/\s+/g, ' ').trim())
        .get()
        .filter(Boolean)
    )
  );

  return {
    name,
    phone,
    mobile,
    email,
    website,
    address,
    city,
    description: clean($b.find('.for-text').first().text()),
    categories,
    source_url: `${BASE}/company.php?lan=geo&id=${id}`,
  };
}

export async function fetchRubricPage(opts: {
  rub?: number;
  page: number;
}): Promise<{ companies: YellCompany[]; total: number; totalPages: number; page: number }> {
  const rub = opts.rub ?? YELL_LAW_RUBRIC;
  const page = Math.max(1, opts.page || 1);

  const { data: html } = await http.get<string>(
    `${BASE}/companies.php?lan=geo&rub=${rub}&SR_pg=${page}`
  );

  const $ = cheerio.load(html);

  const seen = new Set<string>();
  const companies: YellCompany[] = [];
  $('div[id^="SR_div_"]').each((_, el) => {
    const c = parseCompany($, el);
    if (c && !seen.has(c.source_url)) {
      seen.add(c.source_url);
      companies.push(c);
    }
  });

  // Pager reads "გვერდი: <current> (<total>)".
  const pager = html.match(/გვერდი:\s*<\/span>\s*<span[^>]*>\s*(\d+)\s*\((\d+)\)/);
  const totalPages = pager ? Number(pager[2]) : page;

  // The site never prints a result count, so this is an upper bound that turns
  // exact once the (short) last page has been fetched.
  const total =
    page >= totalPages
      ? (totalPages - 1) * YELL_PAGE_SIZE + companies.length
      : totalPages * YELL_PAGE_SIZE;

  return { companies, total, totalPages, page };
}
