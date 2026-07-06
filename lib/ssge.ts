// Client for ss.ge real-estate agencies.
//
// The site (home.ss.ge) is a Next.js app that server-renders an anonymous
// 1-hour JWT into __NEXT_DATA__.props.pageProps.credentialsToken. That token
// authorizes the public JSON API:
//
//   GET api-gateway.ss.ge/v1/Agency/list?page=&pageSize=  -> { agencies, totalCount }
//   GET api-gateway.ss.ge/v1/Agency/details?agencyId=     -> { name, email, link, ... }
//
// The list carries name + phone; the email only exists on the details call.

import axios from 'axios';
import https from 'https';

const AGENCY_PAGE = 'https://home.ss.ge/ka/agency?tab=agencies&page=1';
const API = 'https://api-gateway.ss.ge/v1/Agency';

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

const http = axios.create({
  timeout: 25000,
  httpsAgent: insecureAgent,
  headers: {
    Accept: 'application/json',
    Referer: 'https://home.ss.ge/',
    Origin: 'https://home.ss.ge',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const SSGE_CATEGORY = 'Agencies from HOME.SS';

export type SsgeAgency = {
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  source_url: string;
};

// Fetch a fresh anonymous token from the agency page.
export async function getToken(): Promise<string> {
  const { data: html } = await http.get<string>(AGENCY_PAGE, {
    headers: { Accept: 'text/html' },
    responseType: 'text',
  });
  const m = html.match(/__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Could not find __NEXT_DATA__ on ss.ge agency page');
  const token = JSON.parse(m[1])?.props?.pageProps?.credentialsToken;
  if (!token) throw new Error('Could not extract credentialsToken from ss.ge');
  return token as string;
}

type ListResponse = {
  agencies: {
    agencyId: number;
    agencyName: string | null;
    agencyPhone: string | null;
    address: string | null;
  }[];
  totalCount: number;
};

type DetailsResponse = {
  email: string | null;
  link: string | null;
};

export async function importPage(opts: {
  page: number;
  pageSize: number;
  token: string;
}): Promise<{ agencies: SsgeAgency[]; total: number; totalPages: number }> {
  const auth = { headers: { Authorization: `Bearer ${opts.token}` } };

  const { data } = await http.get<ListResponse>(
    `${API}/list?page=${opts.page}&pageSize=${opts.pageSize}`,
    auth
  );

  const agencies: SsgeAgency[] = [];
  for (const a of data.agencies ?? []) {
    // Email only exists on the per-agency details call.
    let email: string | null = null;
    let website: string | null = null;
    try {
      const { data: d } = await http.get<DetailsResponse>(
        `${API}/details?agencyId=${a.agencyId}`,
        auth
      );
      email = d.email?.trim() || null;
      website = d.link?.trim() ? d.link.replace(/^https?:\/\//i, '').replace(/\/+$/, '') : null;
    } catch {
      // details is best-effort; keep the list-level data
    }

    agencies.push({
      name: a.agencyName?.trim() || `Agency #${a.agencyId}`,
      phone: a.agencyPhone?.trim() || null,
      email,
      website,
      address: a.address?.trim() || null,
      source_url: `https://home.ss.ge/ka/agency/details/${a.agencyId}`,
    });

    await sleep(120); // be gentle on the API
  }

  const total = data.totalCount ?? agencies.length;
  return { agencies, total, totalPages: Math.ceil(total / opts.pageSize) };
}
