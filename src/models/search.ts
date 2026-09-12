// ═══════════════════════════════════════════════════════
// FinMatrix Web — Global search
// ═══════════════════════════════════════════════════════
// `GET /search?q=` answers `{ query, results: { customers, vendors, invoices,
// bills, inventory } }` with full entity rows. This turns that into flat,
// openable hits — the same reading as the app's globalSearchSerializer.
//
// Every bucket is untrusted: a missing key, a non-array or a row without an id
// is skipped rather than breaking the results panel. Buckets are tier-gated on
// the server (no inventory outside warehouse companies), so their presence
// varies by company.

import { isPathAllowedForRole } from '@/config/routeAccess';
import type { UserRole } from '@/types';
import { formatMoney } from '@/utils/money';

/** Shortest query that is sent. The server returns nothing below it anyway. */
export const MIN_SEARCH_LENGTH = 2;

/** Display order: money documents first, then who they are with, then stock. */
export const SEARCH_KINDS = ['invoices', 'bills', 'customers', 'vendors', 'inventory'] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  invoices: 'Invoices',
  bills: 'Bills',
  customers: 'Customers',
  vendors: 'Vendors',
  inventory: 'Inventory',
};

export interface SearchHit {
  /** Unique across kinds — a raw id alone is not. */
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  /** The detail route that opens it. */
  to: string;
}

export interface SearchGroup {
  kind: SearchKind;
  hits: SearchHit[];
}

type Raw = Record<string, unknown>;

const text = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';

const amount = (v: unknown): string => {
  const n = Number(text(v));
  return formatMoney(Number.isFinite(n) ? n : 0);
};

const quantity = (v: unknown): string => {
  const n = Number(text(v));
  return (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
};

// 'partially_paid' → 'Partially paid'
const status = (v: unknown): string => {
  const s = text(v).replace(/_/g, ' ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
};

/** Joins the parts that exist, so a row without an email has no dangling "·". */
const line = (...parts: string[]): string => parts.filter((p) => p.length > 0).join(' · ');

const MAPPERS: Record<SearchKind, (row: Raw, id: string) => Omit<SearchHit, 'id' | 'kind'>> = {
  invoices: (row, id) => ({
    title: text(row.invoiceNumber) || 'Invoice',
    subtitle: line(text(row.customerName), amount(row.total), status(row.status)),
    to: `/invoices/${id}`,
  }),
  bills: (row, id) => ({
    title: text(row.billNumber) || 'Bill',
    subtitle: line(text(row.vendorName), amount(row.total), status(row.status)),
    to: `/bills/${id}`,
  }),
  customers: (row, id) => ({
    title: text(row.name) || text(row.company) || 'Customer',
    subtitle: line(text(row.email) || text(row.phone), `Balance ${amount(row.balance)}`),
    to: `/customers/${id}`,
  }),
  vendors: (row, id) => ({
    title: text(row.companyName) || text(row.contactPerson) || 'Vendor',
    subtitle: line(text(row.email) || text(row.phone), `Balance ${amount(row.balance)}`),
    to: `/vendors/${id}`,
  }),
  inventory: (row, id) => ({
    title: text(row.name) || text(row.sku) || 'Item',
    subtitle: line(text(row.sku), `Qty ${quantity(row.quantityOnHand)}`, text(row.category)),
    to: `/inventory/${id}`,
  }),
};

/** The unwrapped `/search` body → hits, in SEARCH_KINDS order. */
export function parseSearchResults(body: unknown): SearchHit[] {
  const results =
    body && typeof body === 'object' ? (body as { results?: unknown }).results : undefined;
  if (!results || typeof results !== 'object') return [];

  const hits: SearchHit[] = [];
  for (const kind of SEARCH_KINDS) {
    const bucket = (results as Record<string, unknown>)[kind];
    if (!Array.isArray(bucket)) continue;
    for (const row of bucket) {
      if (!row || typeof row !== 'object') continue;
      const id = text((row as Raw).id);
      if (!id) continue;
      hits.push({ id: `${kind}:${id}`, kind, ...MAPPERS[kind](row as Raw, id) });
    }
  }
  return hits;
}

/**
 * Hits this viewer can actually open.
 *
 * The server searches for every signed-in role; a hit whose page would bounce
 * this role to the dashboard is worse than no hit. Inventory is dropped when
 * the company's plan has no inventory, as a belt to the server's braces.
 */
export function visibleHits(
  hits: SearchHit[],
  role: UserRole | null | undefined,
  features: Partial<Record<string, boolean>> | null | undefined,
): SearchHit[] {
  return hits.filter(
    (hit) =>
      isPathAllowedForRole(hit.to, role) &&
      !(hit.kind === 'inventory' && features?.inventory === false),
  );
}

/** Hits grouped by kind, at most `perGroup` in each, empty groups left out. */
export function groupHits(hits: SearchHit[], perGroup = 5): SearchGroup[] {
  return SEARCH_KINDS.map((kind) => ({
    kind,
    hits: hits.filter((h) => h.kind === kind).slice(0, perGroup),
  })).filter((g) => g.hits.length > 0);
}
