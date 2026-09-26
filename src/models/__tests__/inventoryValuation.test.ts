import { describe, expect, it } from 'vitest';

import {
  categoryShares,
  clampPage,
  isSortKey,
  isStockFilter,
  pageCount,
  pageRangeLabel,
  pageRows,
  sortForRank,
  filterRows,
  formatShare,
  itemExplorerHref,
  ledgerTie,
  rankRows,
  rowTotals,
  sortRows,
  unsoldStock,
  valuationRows,
  type ValuationRow,
} from '@/models/inventoryValuation';
import type { InventoryPerformance } from '@/serializers/reportSerializers';

const row = (p: Partial<ValuationRow>): ValuationRow => ({
  itemId: p.itemName ?? 'x',
  itemName: 'x',
  sku: '',
  category: 'General',
  qty: 0,
  unitCost: 0,
  value: 0,
  unitsSold: 0,
  revenue: 0,
  cogs: 0,
  grossProfit: 0,
  marginPct: null,
  lastSoldDate: null,
  ...p,
});

const ROWS: ValuationRow[] = [
  row({ itemName: 'Oil', sku: 'OIL-5', category: 'Grocery', qty: 45, value: 81000, unitsSold: 35, revenue: 82250, cogs: 63000, grossProfit: 19250, marginPct: 23.4 }),
  row({ itemName: 'Rice', category: 'Grocery', qty: 48, value: 67200, unitsSold: 20, revenue: 30000, cogs: 32000, grossProfit: -2000, marginPct: -6.67 }),
  row({ itemName: 'Door', category: 'Hardware', qty: 10, value: 90000, lastSoldDate: '2026-03-02' }),
  row({ itemName: 'Juice', category: 'Drinks', qty: 0, value: 0, unitsSold: 5, revenue: 500, cogs: 300, grossProfit: 200, marginPct: 40 }),
];

describe('rankRows', () => {
  it('ranks sales over the items that traded', () => {
    expect(rankRows(ROWS, 'grossProfit').map((r) => r.itemName)).toEqual(['Oil', 'Juice', 'Rice']);
  });

  it('ranks a margin by the margin, not by the money', () => {
    expect(rankRows(ROWS, 'marginPct').map((r) => r.itemName)).toEqual(['Juice', 'Oil', 'Rice']);
  });

  it('ranks stock value over everything held, sold or not', () => {
    expect(rankRows(ROWS, 'stockValue').map((r) => r.itemName)).toEqual(['Door', 'Oil', 'Rice']);
  });
});

describe('sortRows', () => {
  it('puts items with no margin last in both directions', () => {
    expect(sortRows(ROWS, 'marginPct', 'desc').map((r) => r.itemName)).toEqual(['Juice', 'Oil', 'Rice', 'Door']);
    expect(sortRows(ROWS, 'marginPct', 'asc').map((r) => r.itemName)).toEqual(['Rice', 'Oil', 'Juice', 'Door']);
  });

  it('sorts text A to Z', () => {
    expect(sortRows(ROWS, 'itemName', 'asc').map((r) => r.itemName)).toEqual(['Door', 'Juice', 'Oil', 'Rice']);
  });
});

describe('filterRows', () => {
  const all = { search: '', category: '', filter: 'all' as const };

  it('finds by name or SKU', () => {
    expect(filterRows(ROWS, { ...all, search: 'oil-5' }).map((r) => r.itemName)).toEqual(['Oil']);
  });

  it('asks the report questions as filters', () => {
    expect(filterRows(ROWS, { ...all, filter: 'belowCost' }).map((r) => r.itemName)).toEqual(['Rice']);
    expect(filterRows(ROWS, { ...all, filter: 'unsold' }).map((r) => r.itemName)).toEqual(['Door']);
    expect(filterRows(ROWS, { ...all, filter: 'outOfStock' }).map((r) => r.itemName)).toEqual(['Juice']);
  });

  it('narrows to a category', () => {
    expect(filterRows(ROWS, { ...all, category: 'Grocery' })).toHaveLength(2);
  });
});

describe('figures', () => {
  it('totals the rows showing, margin recomputed', () => {
    const t = rowTotals(ROWS.slice(0, 2));
    expect(t).toMatchObject({ value: 148200, revenue: 112250, grossProfit: 17250 });
    expect(t.marginPct).toBe(15.37);
  });

  it('counts stock that did not sell', () => {
    expect(unsoldStock(ROWS)).toEqual({ count: 1, value: 90000 });
  });

  it('shares stock by category, largest first', () => {
    const shares = categoryShares(ROWS);
    expect(shares.map((c) => c.category)).toEqual(['Grocery', 'Hardware', 'Drinks']);
    expect(shares[0]).toMatchObject({ value: 148200, items: 2 });
    expect(shares.reduce((t, c) => t + c.share, 0)).toBeCloseTo(1);
  });

  it('says whether the stock ties to the ledger', () => {
    expect(ledgerTie(987751.32, 986084.61)).toEqual({ ledgerValue: 986084.61, difference: 1666.71, ties: false });
    expect(ledgerTie(100.4, 100)?.ties).toBe(true);
    expect(ledgerTie(100, null)).toBeNull();
  });

  it('formats a share', () => {
    expect(formatShare(0.3421)).toBe('34.2%');
    expect(formatShare(0.0004)).toBe('<0.1%');
    expect(formatShare(0)).toBe('0%');
  });
});

describe('valuationRows', () => {
  it('falls back to the snapshot, with empty sales, when there is no performance', () => {
    const rows = valuationRows(
      { rows: [{ itemId: 'a', itemName: 'A', sku: 'A1', category: 'C', qty: 2, cost: 5, value: 10 }], byCategory: [], totalValue: 10 },
      undefined,
    );
    expect(rows[0]).toMatchObject({ qty: 2, unitCost: 5, value: 10, revenue: 0, marginPct: null });
  });

  it('prefers the performance rows', () => {
    const perf = {
      rows: [{ itemId: 'a', itemName: 'A', sku: 'A1', category: 'C', unitsSold: 1, revenue: 9, cogs: 5, grossProfit: 4, marginPct: 44.44, qtyOnHand: 1, unitCost: 5, stockValue: 5, costBasis: 'posted', lastSoldDate: '2026-09-01' }],
    } as unknown as InventoryPerformance;
    expect(valuationRows(undefined, perf)[0]).toMatchObject({ qty: 1, revenue: 9, lastSoldDate: '2026-09-01' });
  });
});

describe('itemExplorerHref', () => {
  it('carries the period to the explorer', () => {
    expect(itemExplorerHref('a b', { startDate: '2026-01-01', endDate: '2026-09-26' })).toBe(
      '/reports/inventory-valuation/a%20b?from=2026-01-01&to=2026-09-26',
    );
  });
});

describe('paging', () => {
  const many = Array.from({ length: 107 }, (_, i) => i + 1);

  it('cuts a page and says where it is', () => {
    expect(pageCount(107)).toBe(5);
    expect(pageRows(many, 2)).toEqual(many.slice(25, 50));
    expect(pageRangeLabel(2, 107)).toBe('26–50 of 107');
    expect(pageRangeLabel(5, 107)).toBe('101–107 of 107');
  });

  it('keeps the reader on a page that exists when a filter shrinks the list', () => {
    expect(clampPage(5, 30)).toBe(2);
    expect(clampPage(0, 30)).toBe(1);
    expect(pageRows(many.slice(0, 30), 9)).toEqual(many.slice(25, 30));
    expect(pageRangeLabel(1, 0)).toBe('No items');
  });

  it('reads the URL defensively', () => {
    expect(isSortKey('grossProfit')).toBe(true);
    expect(isSortKey('drop table')).toBe(false);
    expect(isStockFilter('unsold')).toBe(true);
    expect(isStockFilter('everything')).toBe(false);
    expect(sortForRank('stockValue')).toBe('value');
    expect(sortForRank('marginPct')).toBe('marginPct');
  });
});
