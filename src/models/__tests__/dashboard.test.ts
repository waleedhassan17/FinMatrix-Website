import { describe, expect, it } from 'vitest';

import {
  alertTarget,
  buildMonthWindow,
  displayDate,
  periodLabel,
  summariseRevenue,
} from '@/models/dashboard';

// Local time, mid-month: the window is built from the calendar, not the clock.
const SEP_24_2026 = new Date(2026, 8, 24, 7, 4);

describe('buildMonthWindow', () => {
  it('draws the last six calendar months, newest last, whatever the API sent', () => {
    const slots = buildMonthWindow([], 6, SEP_24_2026);
    expect(slots.map((s) => s.period)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(slots.map((s) => s.label)).toEqual(['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']);
    expect(slots.every((s) => s.value === 0 && !s.hasData)).toBe(true);
    expect(slots.map((s) => s.isCurrent)).toEqual([false, false, false, false, false, true]);
  });

  it('places sparse points in their months and zeroes the gaps', () => {
    const slots = buildMonthWindow(
      [
        { label: 'Jun 26', value: 500 },
        { label: 'Sep 26', value: 120 },
      ],
      6,
      SEP_24_2026,
    );
    expect(slots.map((s) => s.value)).toEqual([0, 0, 500, 0, 0, 120]);
    expect(slots.map((s) => s.hasData)).toEqual([false, false, true, false, false, true]);
  });

  it('does not match the same month from another year', () => {
    const slots = buildMonthWindow([{ label: 'Sep 25', value: 999 }], 6, SEP_24_2026);
    expect(slots[5].value).toBe(0);
  });

  it('crosses a year boundary', () => {
    const slots = buildMonthWindow(
      [
        { label: 'Dec 25', value: 10 },
        { label: 'Jan 26', value: 20 },
      ],
      3,
      new Date(2026, 1, 3),
    );
    expect(slots.map((s) => s.period)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(slots.map((s) => s.value)).toEqual([10, 20, 0]);
  });

  it('matches a label that carries no year', () => {
    const slots = buildMonthWindow([{ label: 'Aug', value: 7 }], 6, SEP_24_2026);
    expect(slots[4].value).toBe(7);
  });
});

describe('summariseRevenue', () => {
  it('averages completed months with revenue only, and totals the whole window', () => {
    const slots = buildMonthWindow(
      [
        { label: 'Jul 26', value: 300 },
        { label: 'Aug 26', value: 100 },
        { label: 'Sep 26', value: 50 },
      ],
      6,
      SEP_24_2026,
    );
    const s = summariseRevenue(slots);
    expect(s.lastMonth?.period).toBe('2026-08');
    expect(s.lastMonth?.value).toBe(100);
    // Sep is still accruing and Apr–Jun predate any invoice: neither counts.
    expect(s.average).toBe(200);
    expect(s.completedMonthsWithData).toBe(2);
    expect(s.total).toBe(450);
  });

  it('has no average before a month has closed', () => {
    const s = summariseRevenue(
      buildMonthWindow([{ label: 'Sep 26', value: 50 }], 6, SEP_24_2026),
    );
    expect(s.average).toBeNull();
  });
});

describe('periodLabel', () => {
  it('collapses what the two ends share', () => {
    expect(periodLabel({ startDate: '2026-09-01', endDate: '2026-09-24' })).toBe('1–24 Sep 2026');
    expect(periodLabel({ startDate: '2026-08-28', endDate: '2026-09-03' })).toBe(
      '28 Aug – 3 Sep 2026',
    );
    expect(periodLabel({ startDate: '2025-12-30', endDate: '2026-01-02' })).toBe(
      '30 Dec 2025 – 2 Jan 2026',
    );
    expect(periodLabel({ startDate: '2026-09-01', endDate: '2026-09-01' })).toBe('1 Sep 2026');
  });

  it('reads a bare date as a local day, not UTC', () => {
    expect(periodLabel({ startDate: '2026-09-01', endDate: '2026-09-30' })).toBe('1–30 Sep 2026');
  });

  it('is null without a usable period', () => {
    expect(periodLabel(null)).toBeNull();
    expect(periodLabel({ startDate: '2026-09-01' })).toBeNull();
    expect(periodLabel({ startDate: 'soon', endDate: '2026-09-01' })).toBeNull();
  });
});

describe('displayDate', () => {
  it('formats a date and passes anything else through', () => {
    expect(displayDate('2026-09-20')).toBe('20 Sep 2026');
    expect(displayDate('2026-09-20T00:00:00.000Z')).toBe('20 Sep 2026');
    expect(displayDate('')).toBe('');
  });
});

describe('alertTarget', () => {
  it('routes each known alert to the screen that resolves it', () => {
    expect(alertTarget({ id: 'overdue' })).toBe('/reports/ar-aging');
    expect(alertTarget({ id: 'pending_bills' })).toBe('/reports/ap-aging');
    expect(alertTarget({ id: 'pending_delivery' })).toBe('/deliveries');
    expect(alertTarget({ id: 'something_new' })).toBeNull();
  });
});
