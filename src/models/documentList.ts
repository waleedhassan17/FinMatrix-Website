/**
 * Paged document lists — invoices and bills.
 *
 * GET /invoices and GET /bills return a page of rows in `data` and, beside it,
 * the server's `pagination` and `summary`. The summary covers EVERYTHING the
 * search matches — every status, every page — so a list's tabs and tiles are
 * true however little of it has loaded. (The response envelope used to drop
 * both, which is why these pages counted and totalled only the rows they held.)
 * The app reads the same fields the same way.
 */

export const LIST_PAGE_SIZE = 50;

export interface DocumentListSummary {
  /** Documents the search matches, every status. */
  count: number;
  /** What the open ones still owe. */
  outstanding: number;
  /** Of `outstanding`, what is past due. */
  overdue: number;
  /** Per displayed status (overdue derived from the due date). */
  byStatus: Record<string, { count: number; balance: number }>;
}

export interface DocumentPage<T> {
  rows: T[];
  summary: DocumentListSummary | null;
  /** The summary as sent, for a list's own figures (value on order, …). */
  extras: Record<string, unknown>;
  page: number;
  totalPages: number;
  total: number;
}

const num = (v: unknown): number => {
  const x = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(x) ? x : 0;
};
const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/** The summary beside the rows, or null from a server too old to send one. */
export const documentListSummaryOf = (raw: unknown): DocumentListSummary | null => {
  const s = asObject(asObject(raw).summary);
  if (typeof s.count !== 'number') return null;
  const byStatus: DocumentListSummary['byStatus'] = {};
  for (const [status, v] of Object.entries(asObject(s.byStatus))) {
    const o = asObject(v);
    byStatus[status] = { count: num(o.count), balance: num(o.balance) };
  }
  return { count: s.count, outstanding: num(s.outstanding), overdue: num(s.overdue), byStatus };
};

/** Pagination beside the rows; one page of what came when there is none. */
export const listPaginationOf = (
  raw: unknown,
  rows: number,
): Pick<DocumentPage<unknown>, 'page' | 'totalPages' | 'total'> => {
  const p = asObject(asObject(raw).pagination);
  return {
    page: num(p.page) || 1,
    totalPages: num(p.totalPages) || 1,
    total: p.total !== undefined ? num(p.total) : rows,
  };
};

/** Tab counts: the server's when it sent them, else what has loaded. */
export const statusCountsOf = (
  summary: DocumentListSummary | null,
  loaded: { status: string }[],
): Record<string, number> => {
  if (summary) {
    const c: Record<string, number> = { all: summary.count };
    for (const [status, v] of Object.entries(summary.byStatus)) c[status] = v.count;
    return c;
  }
  const c: Record<string, number> = { all: loaded.length };
  for (const d of loaded) c[d.status] = (c[d.status] ?? 0) + 1;
  return c;
};

/** One page of any paged list: its rows, and what the server said about all of them. */
export const documentPageOf = <T>(raw: unknown, rows: T[]): DocumentPage<T> => ({
  rows,
  summary: documentListSummaryOf(raw),
  extras: asObject(asObject(raw).summary),
  ...listPaginationOf(raw, rows.length),
});

/** A figure from the summary's extras, as a number (0 when absent). */
export const extraNumber = (extras: Record<string, unknown>, key: string): number => num(extras[key]);

/** The most pages `fetchAllPages` will walk — 20,000 rows at 200 a page. */
const MAX_PAGES = 100;

/**
 * Every page of a list, for the places that must hold all of it: a picker has
 * to offer every customer, a payroll run every employee. A list screen pages
 * instead ("Load more"); this is for sets a user chooses from or totals over.
 *
 * `fetchPage` returns one page and how many there are; pages are fetched in
 * order, and a row seen on an earlier page is not added twice.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<{ rows: T[]; totalPages: number }>,
  limit = 200,
  keyOf: (row: T) => string | undefined = (row) => {
    const id = (row as { id?: unknown }).id;
    return typeof id === 'string' && id ? id : undefined;
  },
): Promise<T[]> {
  const first = await fetchPage(1, limit);
  const rows = [...first.rows];
  const seen = new Set(rows.map(keyOf).filter(Boolean));
  const pages = Math.min(first.totalPages, MAX_PAGES);
  for (let page = 2; page <= pages; page++) {
    const next = await fetchPage(page, limit);
    for (const r of next.rows) {
      const key = keyOf(r);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      rows.push(r);
    }
  }
  return rows;
}

/** `{ rows, pagination }` (the customer and vendor tabs' shape) as a page. */
export const pageOfRows = <T>(p: {
  rows: T[];
  pagination: { page: number; totalPages: number; total: number };
}): DocumentPage<T> => ({
  rows: p.rows,
  summary: null,
  extras: {},
  page: p.pagination.page || 1,
  totalPages: p.pagination.totalPages || 1,
  total: p.pagination.total ?? p.rows.length,
});
