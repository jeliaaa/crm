import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE = 'https://www.georgiayp.com';
const DELAY_MS = 700;

const http = axios.create({
  timeout: 12000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,*/*',
    'Accept-Language': 'en-US,en;q=0.9',
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ScrapedCompany = {
  name: string;
  phone: string;
  mobile: string;
  email: string;
  website: string;
  address: string;
  city: string;
  category: string;
  categories: string[];
  description: string;
  source_url: string;
  established_year: number | null;
};

export type ScrapeMode = 'category' | 'location';

export async function getCategories(): Promise<{ name: string; count: number }[]> {
  const { data } = await http.get(`${BASE}/browse-business-directory`);
  const $ = cheerio.load(data);
  const seen = new Set<string>();
  const cats: { name: string; count: number }[] = [];

  $('a[href*="/category/"]').each((_, el) => {
    const text = $(el).text().trim();
    const match = text.match(/^(.+?)(\d+)$/);
    const name = match ? match[1].trim() : text;
    const count = match ? parseInt(match[2]) : 0;
    if (name && !seen.has(name)) {
      seen.add(name);
      cats.push({ name, count });
    }
  });

  return cats;
}

export async function getCities(): Promise<{ name: string; count: number }[]> {
  const { data } = await http.get(`${BASE}/browse-business-cities`);
  const $ = cheerio.load(data);
  const seen = new Set<string>();
  const cities: { name: string; count: number }[] = [];

  $('a[href*="/location/"]').each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href') || '';
    const cityFromHref = href.split('/location/')[1]?.split('/')[0] || '';
    const name = text.replace(/^Companies in\s*/i, '').replace(/\d+$/, '').trim() || cityFromHref;
    const countMatch = text.match(/(\d+)$/);
    const count = countMatch ? parseInt(countMatch[1]) : 0;
    if (name && !seen.has(name)) {
      seen.add(name);
      cities.push({ name, count });
    }
  });

  return cities;
}

async function scrapeListingPage(url: string): Promise<{
  companyLinks: { url: string; name: string }[];
  totalPages: number;
}> {
  const { data } = await http.get(url);
  const $ = cheerio.load(data);

  const seen = new Set<string>();
  const companyLinks: { url: string; name: string }[] = [];

  $('a[href*="/company/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const name = $(el).text().trim();
    const full = href.startsWith('http') ? href : `${BASE}${href}`;
    if (name && !seen.has(full)) {
      seen.add(full);
      companyLinks.push({ url: full, name });
    }
  });

  let totalPages = 1;
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/(\d+)\/?$/);
    if (match) {
      const p = parseInt(match[1]);
      if (p > totalPages && p < 5000) totalPages = p;
    }
  });

  return { companyLinks, totalPages };
}

async function scrapeCompanyPage(url: string): Promise<ScrapedCompany | null> {
  try {
    const { data } = await http.get(url);
    const $ = cheerio.load(data);

    const name = $('h1').first().text().trim();
    if (!name) return null;

    const phones: string[] = [];
    $('a[href^="tel:"]').each((_, el) => {
      const p = ($(el).attr('href') || '').replace('tel:', '').trim();
      if (p && !phones.includes(p)) phones.push(p);
    });

    let website = '';
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('/redir/') && !website) {
        const after = href.split('/redir/')[1];
        if (after) website = decodeURIComponent(after);
      }
    });

    let email = '';
    $('a[href^="mailto:"]').each((_, el) => {
      const e = ($(el).attr('href') || '').replace('mailto:', '').trim();
      if (e && !email) email = e;
    });

    const categories: string[] = [];
    $('a[href*="/category/"]').each((_, el) => {
      const cat = $(el).text().trim();
      if (cat && !categories.includes(cat)) categories.push(cat);
    });

    let city = '';
    $('a[href*="/location/"]').each((_, el) => {
      if (city) return;
      const href = $(el).attr('href') || '';
      const m = href.match(/\/location\/([^/]+)/);
      if (m) city = decodeURIComponent(m[1]).replace(/-/g, ' ');
    });

    let address = '';
    $('[class*="address"],[class*="location"],address').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length > 5 && text.length < 200 && !address) address = text;
    });

    let established_year: number | null = null;
    const bodyText = $.root().text();
    const ym = bodyText.match(/[Ee]stablished\s+(\d{4})/);
    if (ym) established_year = parseInt(ym[1]);

    let description =
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      '';
    if (!description) {
      $('p').each((_, el) => {
        const t = $(el).text().trim();
        if (t.length > 60 && !description) description = t;
      });
    }

    return {
      name,
      phone: phones[0] || '',
      mobile: phones[1] || '',
      email,
      website,
      address: address.replace(/\s+/g, ' ').trim(),
      city,
      category: categories[0] || '',
      categories,
      description: description.slice(0, 500),
      source_url: url,
      established_year,
    };
  } catch {
    return null;
  }
}

export async function scrape(options: {
  mode: ScrapeMode;
  target: string;
  page: number;
  deep: boolean;
}): Promise<{
  companies: ScrapedCompany[];
  totalPages: number;
  currentPage: number;
}> {
  const pageSegment = options.page > 1 ? `/${options.page}` : '';
  let listingUrl: string;

  if (options.mode === 'category') {
    listingUrl = `${BASE}/category/${encodeURIComponent(options.target)}${pageSegment}`;
  } else {
    listingUrl = `${BASE}/location/${encodeURIComponent(options.target)}${pageSegment}`;
  }

  const { companyLinks, totalPages } = await scrapeListingPage(listingUrl);

  if (!options.deep) {
    return {
      companies: companyLinks.map((c) => ({
        name: c.name,
        phone: '',
        mobile: '',
        email: '',
        website: '',
        address: '',
        city: options.mode === 'location' ? options.target : '',
        category: options.mode === 'category' ? options.target : '',
        categories: options.mode === 'category' ? [options.target] : [],
        description: '',
        source_url: c.url,
        established_year: null,
      })),
      totalPages,
      currentPage: options.page,
    };
  }

  const companies: ScrapedCompany[] = [];
  for (const link of companyLinks.slice(0, 15)) {
    await sleep(DELAY_MS);
    const company = await scrapeCompanyPage(link.url);
    if (company) {
      if (!company.city && options.mode === 'location') company.city = options.target;
      if (!company.category && options.mode === 'category') company.category = options.target;
      companies.push(company);
    }
  }

  return { companies, totalPages, currentPage: options.page };
}
