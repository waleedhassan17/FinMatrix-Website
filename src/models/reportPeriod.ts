// ═══════════════════════════════════════════════════════
// FinMatrix Web — Report periods
// ═══════════════════════════════════════════════════════
// Every dated report asks for either a range (`startDate`/`endDate`) or a single
// `asOfDate`. This is the date arithmetic behind both, plus the preset picker.
//
// All of it works on LOCAL calendar components, via `isoDate` and a parse that
// pins the string to local midnight. `new Date('2026-01-01')` is UTC, which in a
// negative-offset zone reads as 31 December — and `toISOString()` on a Date built
// from local parts has the mirror-image bug in a positive-offset zone like PKT,
// where it returns yesterday until 05:00. `@/models/document` already documents
// and avoids both; this file stays on the same footing.

import { addDays, isoDate, isoToday } from '@/models/document';

export interface ReportRange {
  startDate: string;
  endDate: string;
}

/** Parse `YYYY-MM-DD` at LOCAL midnight — never as the UTC instant. */
const parseIso = (iso: string): Date => new Date(`${iso}T00:00:00`);

export const startOfMonth = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), 1);

export const endOfMonth = (d: Date): Date =>
  // Day 0 of the NEXT month is the last day of this one, which is also how this
  // gets February right in a leap year without a table.
  new Date(d.getFullYear(), d.getMonth() + 1, 0);

export const startOfQuarter = (d: Date): Date =>
  new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);

export const endOfQuarter = (d: Date): Date =>
  new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 0);

export const startOfYear = (d: Date): Date => new Date(d.getFullYear(), 0, 1);

export const endOfYear = (d: Date): Date => new Date(d.getFullYear(), 11, 31);

export type PeriodPresetKey =
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'ytd'
  | 'lastYear'
  | 'custom';

export const PERIOD_PRESETS: { key: PeriodPresetKey; label: string }[] = [
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'thisQuarter', label: 'This quarter' },
  { key: 'ytd', label: 'Year to date' },
  { key: 'lastYear', label: 'Last year' },
  { key: 'custom', label: 'Custom' },
];

/**
 * The range a preset means, resolved against a reference date (today, normally —
 * injectable so the tests are not hostage to the calendar).
 *
 * `ytd` ends TODAY, not 31 December. The app's `getYtdRange` returns Dec 31,
 * which is a future date for all but one day of the year: reports would be asked
 * for a window that has not happened yet, and a "year to date" that includes
 * tomorrow is not year to date.
 *
 * `custom` has no range of its own — it is the marker for "the user is driving
 * the two date fields" — so it answers with the current month rather than
 * nothing, which is what the picker shows before they touch anything.
 */
export const presetRange = (
  key: PeriodPresetKey,
  today: Date = new Date(),
): ReportRange => {
  switch (key) {
    case 'thisMonth':
      return {
        startDate: isoDate(startOfMonth(today)),
        endDate: isoDate(endOfMonth(today)),
      };
    case 'lastMonth': {
      const prior = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return {
        startDate: isoDate(startOfMonth(prior)),
        endDate: isoDate(endOfMonth(prior)),
      };
    }
    case 'thisQuarter':
      return {
        startDate: isoDate(startOfQuarter(today)),
        endDate: isoDate(endOfQuarter(today)),
      };
    case 'ytd':
      return { startDate: isoDate(startOfYear(today)), endDate: isoDate(today) };
    case 'lastYear': {
      const prior = new Date(today.getFullYear() - 1, 0, 1);
      return {
        startDate: isoDate(startOfYear(prior)),
        endDate: isoDate(endOfYear(prior)),
      };
    }
    case 'custom':
    default:
      return {
        startDate: isoDate(startOfMonth(today)),
        endDate: isoDate(endOfMonth(today)),
      };
  }
};

/**
 * The window a report opens on: year to date.
 *
 * Must be CALLED, never captured at module scope. The app seeded every report
 * slice's `initialState` with its equivalent, and an `initialState` literal is
 * evaluated once when the bundle loads — so `endDate` froze on the day the app
 * started and nothing recomputed it. On a device left running for a week that
 * reads as "the books stopped updating".
 */
export const defaultReportRange = (): ReportRange => presetRange('ytd');

/**
 * Which preset a range corresponds to, or `'custom'` if none.
 *
 * Lets the picker re-open on the chip the user last chose instead of keeping a
 * second copy of that selection in component state — the app holds the
 * segmented index separately from the range, and the two drift apart.
 */
export const matchPreset = (
  range: ReportRange,
  today: Date = new Date(),
): PeriodPresetKey => {
  for (const { key } of PERIOD_PRESETS) {
    if (key === 'custom') continue;
    const candidate = presetRange(key, today);
    if (
      candidate.startDate === range.startDate &&
      candidate.endDate === range.endDate
    ) {
      return key;
    }
  }
  return 'custom';
};

const spans = (
  range: ReportRange,
  first: (d: Date) => Date,
  last: (d: Date) => Date,
): boolean => {
  const start = parseIso(range.startDate);
  return (
    isoDate(first(start)) === range.startDate &&
    isoDate(last(start)) === range.endDate
  );
};

/**
 * The period to compare against, ending before this one starts.
 *
 * A comparison column is computed entirely on this side: no report endpoint takes
 * a comparison parameter — `ProfitLossReport.comparisonRange` is hard-coded null
 * server-side — so the page fetches this range as a second query.
 *
 * **Calendar-aware, not merely equal-length.** A whole month compares against the
 * whole previous month, a quarter against the previous quarter, a year against the
 * previous year. The app's version always takes the preceding window of identical
 * length, which for a 31-day May gives 31 March – 30 April: a window straddling
 * two months, against which no figure means anything. April has 30 days, and
 * "May against April" is the comparison an accountant is asking for.
 *
 * Anything that is not a whole calendar period — a hand-picked range, year to date
 * — falls back to the preceding window of equal length, counted inclusively,
 * which is the only sensible reading of "the period before this one".
 */
export const comparisonRange = (range: ReportRange): ReportRange => {
  if (spans(range, startOfYear, endOfYear)) {
    const prior = new Date(parseIso(range.startDate).getFullYear() - 1, 0, 1);
    return { startDate: isoDate(startOfYear(prior)), endDate: isoDate(endOfYear(prior)) };
  }

  if (spans(range, startOfQuarter, endOfQuarter)) {
    const start = parseIso(range.startDate);
    const prior = new Date(start.getFullYear(), start.getMonth() - 3, 1);
    return {
      startDate: isoDate(startOfQuarter(prior)),
      endDate: isoDate(endOfQuarter(prior)),
    };
  }

  if (spans(range, startOfMonth, endOfMonth)) {
    const start = parseIso(range.startDate);
    const prior = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    return {
      startDate: isoDate(startOfMonth(prior)),
      endDate: isoDate(endOfMonth(prior)),
    };
  }

  const start = parseIso(range.startDate);
  const end = parseIso(range.endDate);
  const days = Math.max(
    1,
    Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1,
  );

  const priorEnd = addDays(range.startDate, -1);
  return { startDate: addDays(priorEnd, -(days - 1)), endDate: priorEnd };
};

// ═══════════════════════════════════════════════════════
// Labels
// ═══════════════════════════════════════════════════════

const LONG_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const SHORT_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** `January 1, 2026`. Blank input gives an em-dash rather than "Invalid Date". */
export const formatReportDate = (iso: string): string => {
  if (!iso) return '—';
  const d = parseIso(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return LONG_DATE.format(d);
};

/** `Jan 1, 2026` — for table cells, where the long form is too wide. */
export const formatShortDate = (iso: string): string => {
  if (!iso) return '—';
  const d = parseIso(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return SHORT_DATE.format(d);
};

/** `January 1, 2026 – March 31, 2026`, for a statement's title block. */
export const rangeLabel = (startDate: string, endDate: string): string =>
  `${formatReportDate(startDate)} – ${formatReportDate(endDate)}`;

/** `As of March 31, 2026`, for the statements that close on a date. */
export const asOfLabel = (date: string): string =>
  `As of ${formatReportDate(date || isoToday())}`;
