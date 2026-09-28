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
