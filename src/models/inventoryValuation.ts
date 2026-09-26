// ═══════════════════════════════════════════════════════
// FinMatrix Web — Inventory Valuation
// ═══════════════════════════════════════════════════════
// The report answers two questions about the same items: what is my money
// sitting in (stock, AS OF NOW — it ties to the balance sheet), and which of
// it earns (sales and margin over a PERIOD). One row per item carries both,
// and everything the page does with the rows — rank, sort, filter, fold into
// categories — is here, where it can be tested.
//
// `/inventory-performance` returns every item, unpaginated, so ranking and
// sorting here reorder the whole list, not one page of it. That is what lets
// "Rank by" switch without asking the server again.

import type { ReportRange } from '@/models/reportPeriod';
import { toDecimal, sumMoney } from '@/utils/money';
import type {
  InventoryPerformance,
  InventoryValuationReport,
} from '@/serializers/reportSerializers';

export interface ValuationRow {
  itemId: string;
  itemName: string;
  sku: string;
  category: string;
  /** On hand now. */
  qty: number;
  unitCost: number;
  /** qty × unit cost, now. */
  value: number;
  /** Over the period. Zero when the item did not trade, or the server sent no sales. */
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  /** Null when there was no revenue — no sales, no margin. */
  marginPct: number | null;
  lastSoldDate: string | null;
}

/**
 * One row per item: the performance rows when the server sent them (they
 * carry the same stock figures plus sales), otherwise the snapshot with the
 * sales columns empty — a server without the endpoint still renders the
 * report it always did.
 */
export const valuationRows = (
  snapshot: InventoryValuationReport | undefined,
  perf: InventoryPerformance | undefined,
): ValuationRow[] => {
  if (perf && perf.rows.length > 0) {
    return perf.rows.map((r) => ({
      itemId: r.itemId,
      itemName: r.itemName,
      sku: r.sku,
      category: r.category,
      qty: r.qtyOnHand,
      unitCost: r.unitCost,
      value: r.stockValue,
      unitsSold: r.unitsSold,
      revenue: r.revenue,
      cogs: r.cogs,
      grossProfit: r.grossProfit,
      marginPct: r.marginPct,
      lastSoldDate: r.lastSoldDate,
    }));
  }
  return (snapshot?.rows ?? []).map((r) => ({
    itemId: r.itemId,
    itemName: r.itemName,
    sku: r.sku,
    category: r.category,
    qty: r.qty,
    unitCost: r.cost,
    value: r.value,
    unitsSold: 0,
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    marginPct: null,
    lastSoldDate: null,
  }));
};

/** Whether an item sold, or took a return, in the period. */
export const traded = (r: ValuationRow): boolean =>
  r.revenue !== 0 || r.cogs !== 0 || r.unitsSold !== 0;

// ─── Ranking ────────────────────────────────────────────────────────────────

export type RankKey = 'grossProfit' | 'revenue' | 'marginPct' | 'unitsSold' | 'stockValue';

export const RANK_OPTIONS: { key: RankKey; label: string }[] = [
  { key: 'grossProfit', label: 'Gross profit' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'marginPct', label: 'Margin' },
  { key: 'unitsSold', label: 'Units sold' },
  { key: 'stockValue', label: 'Stock value' },
];

export const isRankKey = (v: unknown): v is RankKey =>
  RANK_OPTIONS.some((o) => o.key === v);

const rankValue = (r: ValuationRow, key: RankKey): number | null => {
  switch (key) {
    case 'revenue':
      return r.revenue;
    case 'marginPct':
      return r.marginPct;
    case 'unitsSold':
      return r.unitsSold;
    case 'stockValue':
      return r.value;
    case 'grossProfit':
    default:
      return r.grossProfit;
  }
};

/**
 * The items a ranking is about, largest first.
 *
 * Sales rankings are over the items that TRADED — an unsold item has no
 * margin to rank and a zero revenue that says nothing. Stock value is the
 * other way round: it is about what is held, sold or not, and unsold stock is
 * exactly what it should surface. Nulls go last either way.
 */
export const rankRows = (rows: readonly ValuationRow[], key: RankKey): ValuationRow[] =>
  rows
    .filter((r) => (key === 'stockValue' ? r.value !== 0 : traded(r)))
    .filter((r) => rankValue(r, key) !== null)
    .sort((a, b) => (rankValue(b, key) as number) - (rankValue(a, key) as number));

/** The number a ranked bar is drawn at. */
export const rankFigure = (r: ValuationRow, key: RankKey): number =>
  rankValue(r, key) ?? 0;

// ─── The table ──────────────────────────────────────────────────────────────

export type SortKey =
  | 'itemName'
  | 'category'
  | 'qty'
  | 'unitCost'
  | 'value'
  | 'share'
  | 'unitsSold'
  | 'revenue'
  | 'grossProfit'
  | 'marginPct';

export type SortDir = 'asc' | 'desc';

/** Text columns read A→Z first; figures largest first. */
export const defaultSortDir = (key: SortKey): SortDir =>
  key === 'itemName' || key === 'category' ? 'asc' : 'desc';

const sortValue = (r: ValuationRow, key: SortKey): string | number | null => {
  switch (key) {
    case 'itemName':
      return r.itemName.toLocaleLowerCase();
    case 'category':
      return r.category.toLocaleLowerCase();
    case 'share':
      return r.value;
    default:
      return r[key];
  }
};

/**
 * Sorted by a column. Nulls (an item with no margin) go LAST in both
 * directions — floating them to the top would bury the items that did trade.
 * Ties fall back to the item name so the order is stable across renders.
 */
export const sortRows = (
  rows: readonly ValuationRow[],
  key: SortKey,
  dir: SortDir,
): ValuationRow[] => {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av === null && bv === null) return a.itemName.localeCompare(b.itemName);
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp =
      typeof av === 'string' && typeof bv === 'string'
        ? av.localeCompare(bv)
        : (av as number) - (bv as number);
    return cmp !== 0 ? cmp * sign : a.itemName.localeCompare(b.itemName);
  });
};

export type StockFilter = 'all' | 'belowCost' | 'unsold' | 'outOfStock';

export const STOCK_FILTERS: { key: StockFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'belowCost', label: 'Selling below cost' },
  { key: 'unsold', label: 'Not sold in period' },
  { key: 'outOfStock', label: 'Out of stock' },
];

export const matchesFilter = (r: ValuationRow, filter: StockFilter): boolean => {
  switch (filter) {
    case 'belowCost':
      return traded(r) && r.grossProfit < 0;
    case 'unsold':
      // Held, and nothing went out in the period: capital sitting still.
      return r.qty > 0 && r.unitsSold <= 0;
    case 'outOfStock':
      return r.qty <= 0;
    case 'all':
    default:
      return true;
  }
};

export interface RowQuery {
  search: string;
  /** '' for every category. */
  category: string;
  filter: StockFilter;
}

export const filterRows = (rows: readonly ValuationRow[], q: RowQuery): ValuationRow[] => {
  const needle = q.search.trim().toLocaleLowerCase();
  return rows.filter(
    (r) =>
      (!needle ||
        r.itemName.toLocaleLowerCase().includes(needle) ||
        r.sku.toLocaleLowerCase().includes(needle)) &&
      (!q.category || r.category === q.category) &&
      matchesFilter(r, q.filter),
  );
};

// ─── Figures ────────────────────────────────────────────────────────────────

export interface RowTotals {
  value: number;
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPct: number | null;
}

/** Totals of whatever rows are showing — a filtered table foots to itself. */
export const rowTotals = (rows: readonly ValuationRow[]): RowTotals => {
  const revenue = sumMoney(rows.map((r) => r.revenue)).toNumber();
  const cogs = sumMoney(rows.map((r) => r.cogs)).toNumber();
  const grossProfit = toDecimal(revenue).minus(cogs).toDecimalPlaces(2).toNumber();
  return {
    value: sumMoney(rows.map((r) => r.value)).toNumber(),
    unitsSold: toDecimal(rows.reduce((t, r) => t + r.unitsSold, 0)).toDecimalPlaces(4).toNumber(),
    revenue,
    cogs,
    grossProfit,
    marginPct:
      revenue > 0
        ? toDecimal(grossProfit).dividedBy(revenue).times(100).toDecimalPlaces(2).toNumber()
        : null,
  };
};

/**
 * Stock that did not move in the period: on hand, nothing sold. The capital
 * the report most needs to put in front of someone.
 */
export const unsoldStock = (rows: readonly ValuationRow[]) => {
  const idle = rows.filter((r) => matchesFilter(r, 'unsold'));
  return { count: idle.length, value: sumMoney(idle.map((r) => r.value)).toNumber() };
};

export interface CategoryShare {
  category: string;
  value: number;
  items: number;
  /** 0..1 of all stock value. */
  share: number;
}

/** Stock value by category, largest first. */
export const categoryShares = (rows: readonly ValuationRow[]): CategoryShare[] => {
  const by = new Map<string, { value: number; items: number }>();
  for (const r of rows) {
    const c = by.get(r.category) ?? { value: 0, items: 0 };
    c.value = toDecimal(c.value).plus(r.value).toNumber();
    c.items += 1;
    by.set(r.category, c);
  }
  const total = sumMoney([...by.values()].map((c) => c.value)).toNumber();
  return [...by.entries()]
    .map(([category, c]) => ({
      category,
      value: toDecimal(c.value).toDecimalPlaces(2).toNumber(),
      items: c.items,
      share: total > 0 ? c.value / total : 0,
    }))
    .sort((a, b) => b.value - a.value || a.category.localeCompare(b.category));
};

/**
 * Whether the stock column agrees with Inventory 1200 — the I13 invariant,
 * surfaced. Within a rupee is agreement: the stock figure is quantity × an
 * average stored to four places, and summed over hundreds of items that
 * rounding alone reaches paisa, never rupees. Null when the server did not
 * say what the ledger holds.
 */
export const ledgerTie = (stockValue: number, ledgerValue: number | null) => {
  if (ledgerValue === null) return null;
  const difference = toDecimal(stockValue).minus(ledgerValue).toDecimalPlaces(2).toNumber();
  return { ledgerValue, difference, ties: Math.abs(difference) < 1 };
};

/** Share of a whole, for display: "34.2%", "<0.1%". */
export const formatShare = (share: number): string => {
  if (share <= 0) return '0%';
  if (share < 0.001) return '<0.1%';
  return `${(share * 100).toFixed(1)}%`;
};

/** The item explorer, opened on the period the report is showing. */
export const itemExplorerHref = (itemId: string, range: ReportRange): string =>
  `/reports/inventory-valuation/${encodeURIComponent(itemId)}?from=${range.startDate}&to=${range.endDate}`;

// ─── Paging and the URL ─────────────────────────────────────────────────────

/** Rows to a table page: enough to scan, few enough to see the total. */
export const PAGE_SIZE = 25;

export const pageCount = (total: number, size = PAGE_SIZE): number =>
  Math.max(1, Math.ceil(total / size));

/** A page number that exists — a filter can shrink the table under the reader. */
export const clampPage = (page: number, total: number, size = PAGE_SIZE): number =>
  Math.min(Math.max(1, Math.trunc(page) || 1), pageCount(total, size));

export const pageRows = <T>(rows: readonly T[], page: number, size = PAGE_SIZE): T[] => {
  const p = clampPage(page, rows.length, size);
  return rows.slice((p - 1) * size, p * size);
};

/** "26–50 of 109", or "No items". */
export const pageRangeLabel = (page: number, total: number, size = PAGE_SIZE): string => {
  if (total === 0) return 'No items';
  const p = clampPage(page, total, size);
  return `${(p - 1) * size + 1}–${Math.min(p * size, total)} of ${total}`;
};

const SORT_KEYS: readonly SortKey[] = [
  'itemName',
  'category',
  'qty',
  'unitCost',
  'value',
  'share',
  'unitsSold',
  'revenue',
  'grossProfit',
  'marginPct',
];

export const isSortKey = (v: unknown): v is SortKey => SORT_KEYS.includes(v as SortKey);

export const isStockFilter = (v: unknown): v is StockFilter =>
  STOCK_FILTERS.some((f) => f.key === v);

/** The sort a ranking implies — "See all" from a ranking opens the table in its order. */
export const sortForRank = (rank: RankKey): SortKey => (rank === 'stockValue' ? 'value' : rank);
