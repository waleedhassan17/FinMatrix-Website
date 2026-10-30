import { describe, expect, it } from 'vitest';

import {
  priorFiscalYearEnd,
  priorMonthEnd,
  resolveAsOfComparison,
  resolveRangeComparison,
  sameRangeLastYear,
} from '@/models/reportComparison';

describe('as-of comparisons', () => {
  it('prior month-end is the last day of the month before, leap years included', () => {
    expect(priorMonthEnd('2026-03-31')).toBe('2026-02-28');
    expect(priorMonthEnd('2024-03-15')).toBe('2024-02-29');
    expect(priorMonthEnd('2026-01-01')).toBe('2025-12-31');
  });

  it('prior fiscal year-end is the day before the fiscal year opened', () => {
    expect(priorFiscalYearEnd('2026-07-01')).toBe('2026-06-30');
    expect(priorFiscalYearEnd('2026-01-01')).toBe('2025-12-31');
  });

  it('resolves only to a date strictly before the statement date', () => {
    expect(resolveAsOfComparison('priorMonthEnd', '2026-09-30')).toBe('2026-08-31');
    expect(resolveAsOfComparison('priorFiscalYearEnd', '2026-09-30', { fiscalYearStart: '2026-01-01' })).toBe('2025-12-31');
    // Not yet known: no comparison rather than a guessed one.
    expect(resolveAsOfComparison('priorFiscalYearEnd', '2026-09-30')).toBeNull();
    expect(resolveAsOfComparison('custom', '2026-09-30', { custom: '2026-06-30' })).toBe('2026-06-30');
    expect(resolveAsOfComparison('custom', '2026-09-30', { custom: '2026-09-30' })).toBeNull();
    expect(resolveAsOfComparison('custom', '2026-09-30', { custom: '2026-13-01' })).toBeNull();
    expect(resolveAsOfComparison('none', '2026-09-30')).toBeNull();
  });
});

describe('range comparisons', () => {
  it('same period last year keeps a month end on a month end', () => {
    expect(sameRangeLastYear({ startDate: '2025-02-01', endDate: '2025-02-28' })).toEqual({
      startDate: '2024-02-01',
      endDate: '2024-02-29',
    });
    expect(sameRangeLastYear({ startDate: '2024-02-29', endDate: '2024-03-10' })).toEqual({
      startDate: '2023-02-28',
      endDate: '2023-03-10',
    });
    expect(sameRangeLastYear({ startDate: '2026-01-01', endDate: '2026-09-15' })).toEqual({
      startDate: '2025-01-01',
      endDate: '2025-09-15',
    });
  });

  it('previous period is the calendar-aware one the P&L always used', () => {
    expect(resolveRangeComparison('previous', { startDate: '2026-05-01', endDate: '2026-05-31' })).toEqual({
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    });
    expect(resolveRangeComparison('none', { startDate: '2026-05-01', endDate: '2026-05-31' })).toBeNull();
  });
});
