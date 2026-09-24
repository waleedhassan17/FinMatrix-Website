import { describe, expect, it } from 'vitest';

import {
  analyticsAxis,
  analyticsMonths,
  analyticsPeriodLabel,
  analyticsSummary,
  formatChange,
} from '@/models/analytics';

const REVENUE = [
  { label: 'Jul 26', value: 1000 },
  { label: 'Aug 26', value: 1500 },
  { label: 'Sep 26', value: 1200 },
];
const NET = [
  { label: 'Jul 26', value: 400 },
  { label: 'Aug 26', value: -250.1 },
  { label: 'Sep 26', value: 1200 },
];

describe('analyticsMonths', () => {
  it('recovers billed as invoiced less net, without float drift', () => {
    const months = analyticsMonths(REVENUE, NET);
    expect(months.map((m) => [m.label, m.invoiced, m.billed, m.net])).toEqual([
      ['Jul 26', 1000, 600, 400],
      ['Aug 26', 1500, 1750.1, -250.1],
      ['Sep 26', 1200, 0, 1200],
    ]);
  });

  it('compares each month with the one before, and not the first', () => {
    const months = analyticsMonths(REVENUE, NET);
    expect(months[0].change).toBeNull();
    expect(months[1].change).toEqual({ delta: 500, percent: 50 });
    expect(months[2].change).toEqual({ delta: -300, percent: -20 });
  });

  it('pairs months by label, and treats a month with no bills as all net', () => {
    const months = analyticsMonths(REVENUE, [{ label: 'Aug 26', value: 900 }]);
    expect(months.map((m) => m.billed)).toEqual([0, 600, 0]);
  });
});

describe('analyticsSummary', () => {
  it('totals the charted months and names the last two', () => {
    const s = analyticsSummary(analyticsMonths(REVENUE, NET));
    expect(s.invoiced).toBe(3700);
    expect(s.billed).toBe(2350.1);
    expect(s.net).toBe(1349.9);
    expect(s.averageInvoiced).toBe(1233.33);
    expect(s.latest?.label).toBe('Sep 26');
    expect(s.previous?.label).toBe('Aug 26');
  });

  it('is all zeros and nulls with no months', () => {
    const s = analyticsSummary([]);
    expect(s).toMatchObject({ invoiced: 0, averageInvoiced: 0, latest: null, previous: null });
  });
});

describe('analyticsPeriodLabel', () => {
  it('spans first to last, collapses one month, and is blank for none', () => {
    const months = analyticsMonths(REVENUE, NET);
    expect(analyticsPeriodLabel(months)).toBe('Jul 26 – Sep 26');
    expect(analyticsPeriodLabel(months.slice(0, 1))).toBe('Jul 26');
    expect(analyticsPeriodLabel([])).toBe('');
  });
});

describe('formatChange', () => {
  it('signs the percentage with a real minus, and says nothing without a base', () => {
    expect(formatChange({ delta: 500, percent: 50 })).toBe('+50%');
    expect(formatChange({ delta: -300, percent: -20 })).toBe('−20%');
    expect(formatChange({ delta: 0, percent: 0 })).toBe('0%');
    expect(formatChange({ delta: 100, percent: null })).toBeNull();
    expect(formatChange(null)).toBeNull();
  });
});

describe('analyticsAxis', () => {
  const month = (invoiced: number, net: number) => ({
    label: 'M',
    invoiced,
    billed: invoiced - net,
    net,
    change: null,
  });

  it('keeps a shallow dip to a sliver below zero, with no negative tick', () => {
    // Up to Rs 1.4M; one month Rs 30K under. The library alone floors at −500K.
    const axis = analyticsAxis([month(1_350_000, 400_000), month(80_000, -30_000)]);
    expect(axis.ticks).toEqual([0, 500_000, 1_000_000, 1_500_000]);
    expect(axis.domain[0]).toBeCloseTo(-34_500);
    expect(axis.domain[1]).toBe(1_500_000);
  });

  it('gives a deep dip the whole steps it needs', () => {
    const axis = analyticsAxis([month(1_000_000, 200_000), month(100_000, -600_000)]);
    // billed in the second month is 700K; the step is 250K.
    expect(axis.ticks[0]).toBe(-750_000);
    expect(axis.domain).toEqual([-750_000, 1_000_000]);
  });

  it('starts at zero when nothing is negative', () => {
    expect(analyticsAxis([month(900, 300)]).ticks).toEqual([0, 250, 500, 750, 1000]);
  });

  it('has a frame even with nothing in it', () => {
    expect(analyticsAxis([])).toEqual({ domain: [0, 1], ticks: [0] });
  });
});
