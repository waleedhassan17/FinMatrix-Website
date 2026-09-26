import { describe, expect, it } from 'vitest';

import {
  EXPLORER_METRICS,
  buildExplorerMonths,
  changeTone,
  daysOfCover,
  daysSince,
  defaultMetric,
  explorerCsvRows,
  formatChange,
  formatMetric,
  formatMetricCompact,
  metricChange,
  monthOnMonth,
  periodValue,
  summarizeMetric,
} from '@/models/itemExplorer';
import type {
  InventoryItemHistory,
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
  otherCustomers: { count: 0, unitsSold: 0, revenue: 0, grossProfit: 0 },
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

  it('counts days since a sale', () => {
    expect(daysSince('2026-09-01', TODAY)).toBe(9);
    expect(daysSince(null, TODAY)).toBeNull();
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
