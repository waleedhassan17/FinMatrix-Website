// ═══════════════════════════════════════════════════════
// FinMatrix Web — Report comparisons
// ═══════════════════════════════════════════════════════
// Which date or period a report is compared against. Two families:
//
//   as-of reports (balance sheet) compare one DATE with an earlier date;
//   range reports (P&L, cash flow) compare one PERIOD with another.
//
// Only the date arithmetic is here. The comparison FIGURES are the server's —
// the balance sheet takes `compareTo` and returns every prior amount and
// change itself.

import { addDays, isoDate } from '@/models/document';
import { comparisonRange, endOfMonth, rangeLabel, formatReportDate, type ReportRange } from '@/models/reportPeriod';

export type AsOfCompareKey = 'none' | 'priorMonthEnd' | 'priorFiscalYearEnd' | 'custom';
export type RangeCompareKey = 'none' | 'previous' | 'lastYear';

export const AS_OF_COMPARE_KEYS: readonly AsOfCompareKey[] = ['none', 'priorMonthEnd', 'priorFiscalYearEnd', 'custom'];
export const RANGE_COMPARE_KEYS: readonly RangeCompareKey[] = ['none', 'previous', 'lastYear'];

export const AS_OF_COMPARE_LABELS: Record<AsOfCompareKey, string> = {
  none: 'No comparison',
  priorMonthEnd: 'Prior month-end',
  priorFiscalYearEnd: 'Prior fiscal year-end',
  custom: 'Custom date',
};

export const RANGE_COMPARE_LABELS: Record<RangeCompareKey, string> = {
  none: 'No comparison',
  previous: 'Previous period',
  lastYear: 'Same period last year',
};

/** Parse `YYYY-MM-DD` at LOCAL midnight, as reportPeriod does. */
const parseIso = (iso: string): Date => new Date(`${iso}T00:00:00`);

const isIso = (v: string | null | undefined): v is string =>
  !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parseIso(v).getTime());

/**
 * The last day of the month BEFORE the one `asOf` falls in. On 31 March that
 * is 28/29 February — not "a month ago", which would be 3 March and close on
 * no meaningful date.
 */
export const priorMonthEnd = (asOf: string): string => {
  const d = parseIso(asOf);
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 0));
};

/** The day before the current fiscal year opened. */
export const priorFiscalYearEnd = (fiscalYearStart: string): string =>
  addDays(fiscalYearStart, -1);

/**
 * The date an as-of comparison resolves to, or null when it cannot be one:
 * no comparison chosen, the fiscal year start not yet known, or a date that
 * is not strictly before `asOf` (the server refuses those, and a balance sheet
 * compared with itself says nothing).
 */
export const resolveAsOfComparison = (
  key: AsOfCompareKey,
  asOf: string,
  options: { fiscalYearStart?: string; custom?: string | null } = {},
): string | null => {
  let date: string | null = null;
  if (key === 'priorMonthEnd') date = priorMonthEnd(asOf);
  else if (key === 'priorFiscalYearEnd') {
    date = isIso(options.fiscalYearStart) ? priorFiscalYearEnd(options.fiscalYearStart) : null;
  } else if (key === 'custom') date = isIso(options.custom) ? options.custom : null;
  return date && date < asOf ? date : null;
};

/**
 * The same window one year earlier.
 *
 * A date that ends its month stays on a month end, so February 2025 (1–28)
 * compares with February 2024 (1–29) and not 1–28; a 29 February with no
 * twin a year back lands on the 28th.
 */
export const sameRangeLastYear = (range: ReportRange): ReportRange => {
  const shift = (iso: string): string => {
    const d = parseIso(iso);
    const target = new Date(d.getFullYear() - 1, d.getMonth(), 1);
    const last = endOfMonth(target).getDate();
    const isMonthEnd = d.getDate() === endOfMonth(d).getDate();
    return isoDate(new Date(target.getFullYear(), target.getMonth(), isMonthEnd ? last : Math.min(d.getDate(), last)));
  };
  return { startDate: shift(range.startDate), endDate: shift(range.endDate) };
};

/** The window a range comparison resolves to, or null for none. */
export const resolveRangeComparison = (
  key: RangeCompareKey,
  range: ReportRange,
): ReportRange | null => {
  if (key === 'previous') return comparisonRange(range);
  if (key === 'lastYear') return sameRangeLastYear(range);
  return null;
};

/** "Compared with December 31, 2025" — for headers, CSV and PDF. */
export const asOfComparisonLabel = (date: string | null): string | null =>
  date ? `Compared with ${formatReportDate(date)}` : null;

export const rangeComparisonLabel = (range: ReportRange | null): string | null =>
  range ? `Compared with ${rangeLabel(range.startDate, range.endDate)}` : null;

export const isAsOfCompareKey = (v: string | null | undefined): v is AsOfCompareKey =>
  !!v && (AS_OF_COMPARE_KEYS as readonly string[]).includes(v);

export const isRangeCompareKey = (v: string | null | undefined): v is RangeCompareKey =>
  !!v && (RANGE_COMPARE_KEYS as readonly string[]).includes(v);
