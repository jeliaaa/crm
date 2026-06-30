// Client for the official Georgian Statistical Business Register API.
// Discovered from the br.geostat.ge SPA bundle. Public, open-CORS, rate-limited.
//
//   GET /api/activities?lang=en|ge          -> NACE activity tree
//   GET /api/documents?lang=&activityCode=&page=&limit=  -> { data, pagination }
//
// We browse by the 22 top-level NACE sections (Activity_Type_ID === 1),
// e.g. "G" = Wholesale and retail trade, "L" = Real estate.

import axios from 'axios';

const API = 'https://br-api.geostat.ge/api';

const http = axios.create({
  timeout: 30000,
  headers: { Accept: 'application/json' },
});

export type Lang = 'en' | 'ge';

export type Category = {
  code: string; // NACE section letter, e.g. "G"
  name: string; // localized section name
};

// One company row as returned by /documents.
type GeostatDoc = {
  Stat_ID: number;
  Legal_Code: string | null;
  Personal_no: string | null;
  Full_Name: string | null;
  Abbreviation: string | null;
  Ownership_Type: string | null;
  Region_name: string | null;
  City_name: string | null;
  Address: string | null;
  Region_name2: string | null;
  City_name2: string | null;
  Address2: string | null;
  Activity_Code: string | null;
  Activity_Name: string | null;
  Activity_2_Code: string | null;
  Activity_2_Name: string | null;
  Head: string | null;
  mob: string | null;
  Email: string | null;
  web: string | null;
  Zoma: string | null; // business size
  Init_Reg_date: string | null;
  Partner: string | null;
};

export type NormalizedCompany = {
  stat_id: number;
  name: string;
  identification_number: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  category: string; // the section we browsed by
  activity_code: string | null;
  categories: string[]; // specific NACE activities
  head: string | null;
  partner: string | null;
  ownership_type: string | null;
  business_size: string | null;
  description: string | null;
  established_year: number | null;
  source_url: string;
};

export async function getCategories(lang: Lang = 'en'): Promise<Category[]> {
  const { data } = await http.get(`${API}/activities?lang=${lang}`);
  if (!Array.isArray(data)) return [];

  // Activity_Type_ID === 1 are the top-level NACE sections (letter codes).
  return data
    .filter(
      (a: { Activity_Type_ID?: number; Activity_Code?: string }) =>
        a.Activity_Type_ID === 1 && a.Activity_Code && /^[A-Z]$/.test(a.Activity_Code)
    )
    .map((a: { Activity_Code: string; Activity_Name: string }) => ({
      code: a.Activity_Code,
      name: a.Activity_Name,
    }));
}

function normalize(doc: GeostatDoc, sectionName: string): NormalizedCompany {
  const activities = [doc.Activity_Name, doc.Activity_2_Name].filter(
    (x): x is string => !!x && x.trim().length > 0
  );

  let established_year: number | null = null;
  if (doc.Init_Reg_date) {
    const y = new Date(doc.Init_Reg_date).getFullYear();
    if (!Number.isNaN(y)) established_year = y;
  }

  const website = doc.web?.trim()
    ? doc.web.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
    : null;

  return {
    stat_id: doc.Stat_ID,
    name: doc.Full_Name?.trim() || `#${doc.Stat_ID}`,
    identification_number: doc.Legal_Code || null,
    phone: doc.mob?.trim() || null,
    email: doc.Email?.trim() || null,
    website,
    address: doc.Address?.trim() || doc.Address2?.trim() || null,
    city: doc.City_name?.trim() || doc.City_name2?.trim() || null,
    region: doc.Region_name?.trim() || doc.Region_name2?.trim() || null,
    category: sectionName,
    activity_code: doc.Activity_Code || null,
    categories: activities,
    head: doc.Head?.trim() || null,
    partner: doc.Partner?.trim() || null,
    ownership_type: doc.Ownership_Type?.trim() || null,
    business_size: doc.Zoma?.trim() || null,
    description: doc.Activity_Name?.trim() || null,
    established_year,
    source_url: `https://br.geostat.ge/?stat=${doc.Stat_ID}`,
  };
}

export type RateLimitError = Error & { retryAfterMs: number };

export async function searchCategory(opts: {
  code: string;
  sectionName: string;
  page: number;
  limit: number;
  lang?: Lang;
}): Promise<{ companies: NormalizedCompany[]; total: number; totalPages: number; page: number }> {
  const lang = opts.lang ?? 'en';
  const url = `${API}/documents?lang=${lang}&activityCode=${encodeURIComponent(
    opts.code
  )}&page=${opts.page}&limit=${opts.limit}`;

  let res;
  try {
    res = await http.get(url);
  } catch (e: unknown) {
    // Surface rate limiting so the caller can back off.
    if (axios.isAxiosError(e) && e.response?.status === 429) {
      const reset = Number(e.response.headers['x-ratelimit-reset']);
      const retryAfterMs = reset
        ? Math.max(1000, reset * 1000 - Date.now())
        : 60000;
      const err = new Error('Rate limited by geostat API') as RateLimitError;
      err.retryAfterMs = retryAfterMs;
      throw err;
    }
    throw e;
  }

  const docs: GeostatDoc[] = res.data?.data ?? [];
  const pagination = res.data?.pagination ?? {};

  return {
    companies: docs.map((d) => normalize(d, opts.sectionName)),
    total: pagination.total ?? docs.length,
    totalPages: pagination.totalPages ?? 1,
    page: pagination.page ?? opts.page,
  };
}
