import { describe, expect, it } from 'vitest';

import {
  asOfLabel,
  comparisonRange,
  endOfMonth,
  endOfQuarter,
  formatReportDate,
  matchPreset,
  presetRange,
  rangeLabel,
  startOfMonth,
  startOfQuarter,
  startOfYear,
} from '@/models/reportPeriod';
import { isoDate } from '@/models/document';

// A fixed reference date so the suite does not depend on the calendar.
// 2026-05-20 is a Wednesday in Q2, deliberately mid-month and mid-quarter.
const TODAY = new Date(2026, 4, 20);

describe('month and quarter boundaries', () => {
  it('finds the first and last day of a month', () => {
    expect(isoDate(startOfMonth(TODAY))).toBe('2026-05-01');
    expect(isoDate(endOfMonth(TODAY))).toBe('2026-05-31');
  });

  it('gets February right in a leap year', () => {
    expect(isoDate(endOfMonth(new Date(2028, 1, 10)))).toBe('2028-02-29');
  });

  it('gets February right in a common year', () => {
    expect(isoDate(endOfMonth(new Date(2026, 1, 10)))).toBe('2026-02-28');
  });

  it('finds the quarter containing a date', () => {
    expect(isoDate(startOfQuarter(TODAY))).toBe('2026-04-01');
    expect(isoDate(endOfQuarter(TODAY))).toBe('2026-06-30');
  });

  it('puts January in Q1 and December in Q4', () => {
    expect(isoDate(startOfQuarter(new Date(2026, 0, 15)))).toBe('2026-01-01');
    expect(isoDate(endOfQuarter(new Date(2026, 11, 15)))).toBe('2026-12-31');
  });

  it('finds the start of the year', () => {
    expect(isoDate(startOfYear(TODAY))).toBe('2026-01-01');
  });
});

describe('presetRange', () => {
  it('covers the whole of this month', () => {
    expect(presetRange('thisMonth', TODAY)).toEqual({
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });
  });

  it('covers the whole of last month', () => {
    expect(presetRange('lastMonth', TODAY)).toEqual({
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    });
  });

  it('rolls back across a year boundary for last month', () => {
    expect(presetRange('lastMonth', new Date(2026, 0, 15))).toEqual({
      startDate: '2025-12-01',
      endDate: '2025-12-31',
    });
  });

  it('covers this quarter', () => {
    expect(presetRange('thisQuarter', TODAY)).toEqual({
      startDate: '2026-04-01',
      endDate: '2026-06-30',
    });
  });

  it('ends year-to-date TODAY, not on 31 December', () => {
    // The app's getYtdRange ends Dec 31, which is a future date for all but one
    // day of the year — a "year to date" that includes tomorrow.
    expect(presetRange('ytd', TODAY)).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-05-20',
    });
  });

  it('covers the whole of last year', () => {
    expect(presetRange('lastYear', TODAY)).toEqual({
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });
  });

  it('falls back to this month for custom', () => {
    expect(presetRange('custom', TODAY)).toEqual({
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });
  });
});

describe('matchPreset', () => {
  it('recognises a range a preset produced', () => {
    expect(matchPreset(presetRange('thisQuarter', TODAY), TODAY)).toBe('thisQuarter');
    expect(matchPreset(presetRange('ytd', TODAY), TODAY)).toBe('ytd');
  });

  it('calls a hand-picked range custom', () => {
    expect(
      matchPreset({ startDate: '2026-03-07', endDate: '2026-04-02' }, TODAY),
    ).toBe('custom');
  });
});

describe('comparisonRange', () => {
  it('returns the previous calendar month for a calendar month', () => {
    expect(
      comparisonRange({ startDate: '2026-05-01', endDate: '2026-05-31' }),
    ).toEqual({ startDate: '2026-04-01', endDate: '2026-04-30' });
  });

  it('returns the previous quarter for a quarter', () => {
    expect(
      comparisonRange({ startDate: '2026-04-01', endDate: '2026-06-30' }),
    ).toEqual({ startDate: '2026-01-01', endDate: '2026-03-31' });
  });

  it('returns the previous day for a single day', () => {
    expect(
      comparisonRange({ startDate: '2026-05-20', endDate: '2026-05-20' }),
    ).toEqual({ startDate: '2026-05-19', endDate: '2026-05-19' });
  });

  it('ends the day before the current window starts', () => {
    const prior = comparisonRange({
      startDate: '2026-01-01',
      endDate: '2026-05-20',
    });
    expect(prior.endDate).toBe('2025-12-31');
  });

  it('keeps the window the same length', () => {
    // 140 days in the YTD window above; the prior window must match it.
    const range = { startDate: '2026-01-01', endDate: '2026-05-20' };
    const prior = comparisonRange(range);
    const days = (a: string, b: string) =>
      (new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) /
        86_400_000 +
      1;
    expect(days(prior.startDate, prior.endDate)).toBe(
      days(range.startDate, range.endDate),
    );
  });

  it('includes the leap day when comparing March 2028 against February', () => {
    // The previous calendar month, so February keeps its 29 days — an
    // equal-length 31-day window would have started on 31 January instead.
    expect(
      comparisonRange({ startDate: '2028-03-01', endDate: '2028-03-31' }),
    ).toEqual({ startDate: '2028-02-01', endDate: '2028-02-29' });
  });

  it('returns the previous calendar year for a whole year', () => {
    expect(
      comparisonRange({ startDate: '2026-01-01', endDate: '2026-12-31' }),
    ).toEqual({ startDate: '2025-01-01', endDate: '2025-12-31' });
  });

  it('rolls a Q1 comparison back into the previous year', () => {
    expect(
      comparisonRange({ startDate: '2026-01-01', endDate: '2026-03-31' }),
    ).toEqual({ startDate: '2025-10-01', endDate: '2025-12-31' });
  });

  it('rolls a January comparison back into the previous year', () => {
    expect(
      comparisonRange({ startDate: '2026-01-01', endDate: '2026-01-31' }),
    ).toEqual({ startDate: '2025-12-01', endDate: '2025-12-31' });
  });
});

describe('labels', () => {
  it('formats a date in full', () => {
    expect(formatReportDate('2026-05-20')).toBe('May 20, 2026');
  });

  it('does not slip a day in any timezone', () => {
    // The bug this guards: `new Date('2026-01-01')` is the UTC instant, which in
    // a negative-offset zone formats as 31 December. Parsing at local midnight
    // keeps the calendar day the API sent.
    expect(formatReportDate('2026-01-01')).toBe('January 1, 2026');
    expect(formatReportDate('2026-12-31')).toBe('December 31, 2026');
  });

  it('gives an em-dash for a blank date', () => {
    expect(formatReportDate('')).toBe('—');
  });

  it('echoes an unparseable date rather than printing Invalid Date', () => {
    expect(formatReportDate('not-a-date')).toBe('not-a-date');
  });

  it('labels a range', () => {
    expect(rangeLabel('2026-01-01', '2026-03-31')).toBe(
      'January 1, 2026 – March 31, 2026',
    );
  });

  it('labels an as-of date', () => {
    expect(asOfLabel('2026-03-31')).toBe('As of March 31, 2026');
  });
});
