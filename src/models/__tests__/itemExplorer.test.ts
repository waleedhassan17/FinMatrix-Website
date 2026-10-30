import { describe, expect, it } from 'vitest';

import { OTHER_KEY } from '@/models/chartSlices';
import {
  EXPLORER_METRICS,
  STOCK_BADGE,
  buildExplorerMonths,
  changeTone,
  comparisonCaption,
  coverText,
  daysOfCover,
  daysSince,
  defaultMetric,
  explorerCsvRows,
  formatChange,
  formatMetric,
  formatMetricCompact,
  hasChannelBreakdown,
  itemCover,
  metricChange,
  monthOnMonth,
  monthsWithSales,
  periodValue,
  priceAndMargin,
  returnsText,
  revenueBreakdown,
  stockBadge,
  stockMeter,
  summarizeMetric,
  unitsText,
  vsListText,
} from '@/models/itemExplorer';
import type {
  InventoryItemHistory,
  ItemFacts,
  ItemPerformance,
  ItemPerformancePoint,
} from '@/serializers/reportSerializers';

const point = (period: string, label: string, p: Partial<ItemPerformancePoint> = {}): ItemPerformancePoint => ({
  period,
  label,
  unitsSold: 0,
  revenue: 0,
  cogs: 0,
  grossProfit: 0,
  marginPct: null,
  costKnown: true,
  ...p,
});

const PERF: ItemPerformance = {
  itemId: 'i1',
  itemName: 'Cooking Oil 5L',
  sku: 'CO-5',
  range: { startDate: '2026-07-01', endDate: '2026-09-26' },
  points: [
    point('2026-07', 'Jul 26', { unitsSold: 10, revenue: 1000, cogs: 600, grossProfit: 400, marginPct: 40 }),
    point('2026-08', 'Aug 26'),
    point('2026-09', 'Sep 26', { unitsSold: 30, revenue: 2700, cogs: 2100, grossProfit: 600, marginPct: 22.22 }),
  ],
  totals: { unitsSold: 40, revenue: 3700, cogs: 2700, grossProfit: 1000, marginPct: 27.03 },
  costHistoryFrom: '2026-04-08',
  estimatedCogsShare: 0,
  item: null,
  customers: [],
  otherCustomers: { count: 0, unitsSold: 0, revenue: 0, grossProfit: 0, sharePct: null },
  channels: [],
  returns: null,
};

const HISTORY: InventoryItemHistory = {
  itemId: 'i1',
  itemName: 'Cooking Oil 5L',
  sku: 'CO-5',
  months: 3,
  points: [
    { period: '2026-07', label: 'Jul 26', asOfDate: '2026-07-31', closingQty: 50, qtyIn: 60, qtyOut: 10, closingValue: 3000, valueKnown: true },
    { period: '2026-08', label: 'Aug 26', asOfDate: '2026-08-31', closingQty: 50, qtyIn: 0, qtyOut: 0, closingValue: 3000, valueKnown: true },
    // A month whose value is not claimed reads as a GAP, whatever the server
    // put in closingValue.
    { period: '2026-09', label: 'Sep 26', asOfDate: '2026-09-30', closingQty: 20, qtyIn: 0, qtyOut: 30, closingValue: 999, valueKnown: false },
  ],
  coverage: { quantity: 'exact', value: 'partial', costHistoryFrom: '2026-04-08', message: '' },
};

const MONTHS = buildExplorerMonths(PERF, HISTORY);

const facts = (over: Partial<ItemFacts> = {}): ItemFacts => ({
  category: 'FMCG',
  unitOfMeasure: 'unit',
  sellingPrice: 2350,
  unitCost: 1800,
  qtyOnHand: 45,
  stockValue: 81000,
  reorderPoint: 20,
  isActive: true,
  lastSoldDate: '2026-07-24',
  imageUrl: null,
  thumbnailUrl: null,
  location: null,
  stockStatus: 'ok',
  suggestedOrderQty: null,
  daysOfCover: null,
  cover: null,
  deadStock: false,
  lastOutboundDate: '2026-07-24',
  ...over,
});

describe('buildExplorerMonths', () => {
  it('joins sales and stock by period', () => {
    expect(MONTHS.map((m) => m.label)).toEqual(['Jul 26', 'Aug 26', 'Sep 26']);
    expect(MONTHS[0].values).toMatchObject({ revenue: 1000, closingQty: 50, qtyIn: 60 });
    expect(MONTHS[2].values.closingValue).toBeNull();
  });

  it('prices a unit only where units went out', () => {
    expect(MONTHS.map((m) => m.values.avgPrice)).toEqual([100, null, 90]);
  });

  it('leaves a whole series null when its endpoint is missing, never zero', () => {
    const salesOnly = buildExplorerMonths(PERF, undefined);
    expect(salesOnly.every((m) => m.values.closingQty === null)).toBe(true);
    const stockOnly = buildExplorerMonths(undefined, HISTORY);
    expect(stockOnly).toHaveLength(3);
    expect(stockOnly.every((m) => m.values.revenue === null)).toBe(true);
  });

  it('matches by period, not position, when the series disagree', () => {
    const shifted = buildExplorerMonths(PERF, { ...HISTORY, points: HISTORY.points.slice(1) });
    expect(shifted[0].values.closingQty).toBeNull();
    expect(shifted[1].values.closingQty).toBe(50);
  });
});

describe('periodValue', () => {
  it('sums a flow', () => {
    expect(periodValue(MONTHS, 'revenue')).toBe(3700);
    expect(periodValue(MONTHS, 'unitsSold')).toBe(40);
  });

  it('recomputes a margin from the totals instead of averaging months', () => {
    // Averaging 40% and 22.22% would say 31.11%; the period made 1000 on 3700.
    expect(periodValue(MONTHS, 'marginPct')).toBe(27.03);
    expect(periodValue(MONTHS, 'avgPrice')).toBe(92.5);
  });

  it('takes the latest reading for a level', () => {
    expect(periodValue(MONTHS, 'closingQty')).toBe(20);
    // The latest KNOWN value — September's is not claimed.
    expect(periodValue(MONTHS, 'closingValue')).toBe(3000);
  });

  it('agrees with the server totals on every sales flow', () => {
    for (const key of ['revenue', 'cogs', 'grossProfit', 'unitsSold'] as const) {
      expect(periodValue(MONTHS, key)).toBe(PERF.totals[key]);
    }
    expect(periodValue(MONTHS, 'marginPct')).toBe(PERF.totals.marginPct);
  });

  it('has no margin without sales', () => {
    expect(periodValue(buildExplorerMonths(undefined, HISTORY), 'marginPct')).toBeNull();
  });
});

describe('changes', () => {
  it('moves a margin in points, not percent', () => {
    expect(metricChange('marginPct', 33, 30)).toEqual({ delta: 3, percent: null });
    expect(formatChange('marginPct', metricChange('marginPct', 28.8, 30))).toBe('−1.2 pts');
    expect(formatChange('marginPct', metricChange('marginPct', 30, 30))).toBeNull();
  });

  it('gives a percentage elsewhere, and an amount from a zero base', () => {
    expect(formatChange('revenue', metricChange('revenue', 1100, 1000))).toBe('+10%');
    expect(formatChange('revenue', metricChange('revenue', 4500, 0))).toBe('+Rs 4.5K');
    expect(formatChange('revenue', metricChange('revenue', 0, 0))).toBeNull();
  });

  it('compares each month with the one before', () => {
    expect(monthOnMonth(MONTHS, 'revenue', 0)).toBeNull();
    expect(monthOnMonth(MONTHS, 'revenue', 1)).toEqual({ delta: -1000, percent: -100 });
    expect(monthOnMonth(MONTHS, 'marginPct', 2)).toBeNull(); // August had no margin
  });

  it('colours by what the metric means', () => {
    expect(changeTone('revenue', { delta: 5, percent: 1 })).toBe('good');
    expect(changeTone('grossProfit', { delta: -5, percent: -1 })).toBe('bad');
    // More stock or more cost is not good or bad by itself.
    expect(changeTone('closingQty', { delta: 5, percent: 1 })).toBeNull();
    expect(changeTone('cogs', { delta: 5, percent: 1 })).toBeNull();
  });
});

describe('summarizeMetric', () => {
  it('names the best and worst months', () => {
    const s = summarizeMetric(MONTHS, 'revenue');
    expect(s.value).toBe(3700);
    expect(s.best).toEqual({ label: 'Sep 26', value: 2700 });
    expect(s.worst).toEqual({ label: 'Aug 26', value: 0 });
    expect(s.average).toBe(1233.33);
  });

  it('says nothing about best and worst when every month is the same', () => {
    const flat = buildExplorerMonths(undefined, {
      ...HISTORY,
      points: HISTORY.points.map((p) => ({ ...p, closingQty: 5 })),
    });
    const s = summarizeMetric(flat, 'closingQty');
    expect(s.best).toBeNull();
    expect(s.worst).toBeNull();
  });
});

describe('defaultMetric', () => {
  it('opens on revenue when the item sold, and on stock when it did not', () => {
    expect(defaultMetric(MONTHS)).toBe('revenue');
    expect(defaultMetric(buildExplorerMonths(undefined, HISTORY))).toBe('closingQty');
  });
});

describe('formatting', () => {
  it('formats each unit its own way', () => {
    expect(formatMetric('revenue', 1234.5)).toBe('Rs 1,234.50');
    expect(formatMetric('marginPct', -3.25)).toBe('−3.3%');
    expect(formatMetric('unitsSold', -4)).toBe('−4');
    expect(formatMetric('closingValue', null)).toBe('—');
    expect(formatMetricCompact('unitsSold', 12500)).toBe('13K');
    expect(formatMetricCompact('marginPct', 33.6)).toBe('34%');
  });
});

describe('stock cover', () => {
  const RANGE = { startDate: '2026-09-01', endDate: '2026-09-30' };
  const TODAY = new Date(2026, 8, 10); // 10 days into the month

  it('counts only the days that have happened', () => {
    // 20 sold in 10 days is 2 a day; 30 on hand lasts 15 days.
    expect(daysOfCover(30, 20, RANGE, TODAY)).toBe(15);
  });

  it('has no rate to divide by without sales, and nothing to cover without stock', () => {
    expect(daysOfCover(30, 0, RANGE, TODAY)).toBeNull();
    expect(daysOfCover(0, 20, RANGE, TODAY)).toBe(0);
  });

  it('says nothing about an item out of stock that nobody is buying', () => {
    expect(daysOfCover(0, 0, RANGE, TODAY)).toBeNull();
  });

  it('words the cover the way the rail prints it', () => {
    expect(coverText(null)).toBe('No recent sales');
    expect(coverText(0)).toBe('Out of stock');
    expect(coverText(1)).toBe('1 day');
    expect(coverText(1200)).toBe('Over a year');
    expect(coverText(365)).toBe('365 days');
  });

  it("takes the server's cover and verdict, and guesses no verdict without one", () => {
    const verdict = { level: 'risk' as const, guide: 'Over four months ties up cash.' };
    expect(itemCover(facts({ daysOfCover: 387, cover: verdict }), 35, RANGE, TODAY)).toEqual({ days: 387, assessment: verdict });
    expect(itemCover(facts({ daysOfCover: null, cover: verdict }), 35, RANGE, TODAY).days).toBeNull();
    // An older server sent neither: the same arithmetic, and no pill.
    const old = facts({ qtyOnHand: 30 });
    delete old.daysOfCover;
    expect(itemCover(old, 20, RANGE, TODAY)).toEqual({ days: 15, assessment: null });
  });

  it('counts days since a sale', () => {
    expect(daysSince('2026-09-01', TODAY)).toBe(9);
    expect(daysSince(null, TODAY)).toBeNull();
  });
});

describe('the item today', () => {
  it('shows one badge, the most urgent first', () => {
    expect(stockBadge(facts({ qtyOnHand: 0, stockStatus: 'out', deadStock: false }))).toBe('out');
    // Dead stock outranks low: ordering more of it is the wrong advice.
    expect(stockBadge(facts({ qtyOnHand: 5, stockStatus: 'low', deadStock: true }))).toBe('dead');
    expect(stockBadge(facts({ qtyOnHand: 5, stockStatus: 'low' }))).toBe('low');
    expect(stockBadge(facts({ qtyOnHand: 45, stockStatus: 'ok' }))).toBe('ok');
    // An inactive item says only that, as its record page does.
    expect(stockBadge(facts({ isActive: false, stockStatus: 'out', qtyOnHand: 0 }))).toBe('inactive');
  });

  it('works the status out from the figures for a server that did not send it', () => {
    expect(stockBadge(facts({ stockStatus: null, qtyOnHand: 10, reorderPoint: 20 }))).toBe('low');
    expect(stockBadge(facts({ stockStatus: null, qtyOnHand: 0, reorderPoint: 0 }))).toBe('out');
  });

  it('labels each badge in the shared status words', () => {
    expect(STOCK_BADGE.low.label).toBe('Low stock');
    expect(STOCK_BADGE.dead).toMatchObject({ label: 'Dead stock', hint: 'Nothing out in 180 days' });
  });

  it('counts units in the item’s own unit', () => {
    expect(unitsText(45)).toBe('45 units');
    expect(unitsText(1)).toBe('1 unit');
    expect(unitsText(2.5, 'kg')).toBe('2.5 kg');
  });

  it('places on hand and the reorder point on one bar, with room either side', () => {
    const m = stockMeter(45, 20)!;
    expect(m.headroom).toBe(25);
    expect(m.fillPct).toBeCloseTo(90.91, 1);
    expect(m.tickPct).toBeCloseTo(40.4, 1);
    expect(stockMeter(5, 20)).toMatchObject({ fillPct: 12.5, tickPct: 50, headroom: -15 });
    expect(stockMeter(10, 0)).toBeNull();
  });

  it('sets the list price against cost, and against what it really sold for', () => {
    const p = priceAndMargin(facts({ sellingPrice: 2350, unitCost: 1800 }), { revenue: 82250, unitsSold: 35 });
    expect(p).toMatchObject({ margin: 550, marginPct: 23.4, realised: 2350, vsListPct: 0 });
    expect(p.costShare).toBeCloseTo(76.6, 1);
    expect(vsListText(p.vsListPct)).toBe('At list price');
    expect(vsListText(-4.21)).toBe('4.2% below list');
    expect(vsListText(1.3)).toBe('1.3% above list');
    // Sold below cost: a negative margin, the bar all cost.
    const below = priceAndMargin(facts({ sellingPrice: 100, unitCost: 120 }), { revenue: 0, unitsSold: 0 });
    expect(below).toMatchObject({ margin: -20, marginPct: -20, costShare: 100, realised: null, vsListPct: null });
  });

  it('counts the months that traded', () => {
    expect(monthsWithSales(MONTHS)).toBe(2);
  });

  it('states the comparison once, or why there is none', () => {
    const r = { startDate: '2026-01-01', endDate: '2026-10-28' };
    expect(comparisonCaption(r, false)).toBe('Compared with the prior 10 months');
    expect(comparisonCaption(r, true)).toBe('No sales in the prior 10 months to compare with');
    expect(comparisonCaption({ startDate: '2026-01-15', endDate: '2026-02-14' }, false)).toBe('Compared with the prior period');
    expect(comparisonCaption(r, null)).toBeNull();
  });
});

describe('revenueBreakdown', () => {
  const withBuyers: ItemPerformance = {
    ...PERF,
    totals: { ...PERF.totals, revenue: 1000 },
    customers: [
      { customerId: 'k1', customerName: 'Karim Store', unitsSold: 5, revenue: 500, grossProfit: 100, sharePct: 50 },
      { customerId: null, customerName: '(no customer)', unitsSold: 2, revenue: 200, grossProfit: 40, sharePct: 20 },
    ],
    otherCustomers: { count: 4, unitsSold: 9, revenue: 300, grossProfit: 60, sharePct: 30 },
    channels: [
      { key: 'invoice', unitsSold: 10, revenue: 900, grossProfit: 180, documents: 6, sharePct: 85.71 },
      { key: 'delivery', unitsSold: 2, revenue: 150, grossProfit: 30, documents: 1, sharePct: 14.29 },
    ],
    returns: { unitsSold: -1, revenue: -50, grossProfit: -10, documents: 1 },
  };

  it("keeps the server's top customers in order, with Other last however large", () => {
    const b = revenueBreakdown(withBuyers, 'customer');
    expect(b.slices.map((x) => x.key)).toEqual(['k1', 'none-1', OTHER_KEY]);
    expect(b.slices[2]).toMatchObject({ label: 'Other (4)', value: 300, count: 9, sharePct: 30 });
    expect(b).toMatchObject({ total: 1000, donut: true });
  });

  it('splits the sales by channel, before returns', () => {
    const b = revenueBreakdown(withBuyers, 'channel');
    expect(b.slices.map((x) => [x.label, x.value])).toEqual([['Invoices', 900], ['Deliveries', 150]]);
    expect(b.total).toBe(1050);
    expect(returnsText(withBuyers.returns)).toBe('Returns (Rs 50.00) · 1 unit — taken off revenue');
    expect(returnsText(null)).toBeNull();
  });

  it('falls back to bars when a customer returned more than they bought', () => {
    const b = revenueBreakdown(
      { ...withBuyers, customers: [{ ...withBuyers.customers[0], revenue: -20, sharePct: null }] },
      'customer',
    );
    expect(b.donut).toBe(false);
  });

  it('offers the channel view only when the item went out both ways', () => {
    expect(hasChannelBreakdown(withBuyers)).toBe(true);
    expect(hasChannelBreakdown({ ...withBuyers, channels: [withBuyers.channels![0]] })).toBe(false);
    expect(hasChannelBreakdown({ ...withBuyers, channels: null })).toBe(false);
  });
});

describe('explorerCsvRows', () => {
  it('writes every metric by month with its period figure', () => {
    const rows = explorerCsvRows(MONTHS);
    expect(rows[0]).toEqual(['Metric', 'Jul 26', 'Aug 26', 'Sep 26', 'Period']);
    expect(rows).toHaveLength(EXPLORER_METRICS.length + 1);
    expect(rows.find((r) => r[0] === 'Revenue')).toEqual(['Revenue', '1000.00', '0.00', '2700.00', '3700.00']);
    expect(rows.find((r) => r[0] === 'Margin (%)')).toEqual(['Margin (%)', '40.0', '', '22.2', '27.0']);
  });
});
