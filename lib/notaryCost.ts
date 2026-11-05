// Notarial approval cost counter (Georgian market).
//
// Mirrors the tariff engine in D:/appSuliko (api.suliko.ge/src/suliko/domain/pricing.py):
//   per-page rate depends on the page count, x 1.18 VAT, + 5 GEL flat fee.
// Official reference: the Notary Chamber's schedule (notary.ge) lists 1 GEL/page
// for certifying a translation and 2 GEL registry duty; bureaus bill higher
// all-in notarisation rates, which is what the tiers below represent.

export const VAT_RATE = 1.18;
export const NOTARY_FLAT_FEE = 5;

// [max pages (null = open-ended), GEL per page]
export const NOTARY_PAGE_TIERS: [number | null, number][] = [
  [1, 6],
  [10, 4],
  [50, 3],
  [null, 2],
];

export type NotaryCost = {
  pages: number;
  perPage: number;
  perPageTotal: number; // perPage * pages * VAT
  flat: number;
  total: number;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function notaryCost(pagesInput: number): NotaryCost {
  const pages = Math.max(1, Math.floor(Number.isFinite(pagesInput) ? pagesInput : 1));
  const perPage = NOTARY_PAGE_TIERS.find(([max]) => max === null || pages <= max)![1];
  const perPageTotal = round2(perPage * pages * VAT_RATE);
  return { pages, perPage, perPageTotal, flat: NOTARY_FLAT_FEE, total: round2(perPageTotal + NOTARY_FLAT_FEE) };
}
