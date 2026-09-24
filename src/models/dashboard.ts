// ═══════════════════════════════════════════════════════
// FinMatrix Web — Dashboard model
// ═══════════════════════════════════════════════════════
// Pure helpers behind the dashboard panels, kept out of the components so they
// can be tested without rendering a chart.

import { format, isValid, parseISO } from 'date-fns';

import type { DashboardAlert } from '@/serializers/dashboardSerializer';

/** How many calendar months the revenue chart draws, newest on the right. */
export const REVENUE_WINDOW_MONTHS = 6;

export interface MonthSlot {
  /** `2026-09` — stable, unlike the label, which repeats across years. */
  period: string;
  /** `Sep` — drawn under the bar. */
  label: string;
  /** `Sep 2026` — for the tooltip. */
  fullLabel: string;
  /** Zero when the API sent nothing for the month: no invoices is no revenue. */
  value: number;
  /** Whether the API sent the month at all. */
  hasData: boolean;
  /** The month still accruing — always the last slot. */
  isCurrent: boolean;
}

const monthKey = (label: string): string => label.trim().slice(0, 3).toLowerCase();

/** Two-digit year out of 'Sep 26' or 'Sep 2026'; null when there is none. */
const yearKey = (label: string): string | null => {
  const m = label.match(/\b(\d{4})\b|\b(\d{2})\b/);
  if (!m) return null;
  return (m[1] ?? m[2]).slice(-2);
};

/**
 * The last `months` calendar months, oldest first, each carrying its revenue if
 * the analytics report sent one.
 *
 * Ported from the app's `buildRevenueWindow`. The API only returns months that
 * HAVE revenue, so charting its points directly gave a company in its first
 * month a single bar stretched edge to edge. Drawing the calendar instead keeps
 * every bar the same width from day one.
 *
 * Matching is by month, with the year checked only when the label carries one:
 * a window this short cannot hold the same month twice.
 */
export const buildMonthWindow = (
  points: { label: string; value: number }[],
  months: number = REVENUE_WINDOW_MONTHS,
  now: Date = new Date(),
): MonthSlot[] =>
  Array.from({ length: months }, (_, n) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - n), 1);
    const label = format(d, 'MMM');
    const yy = format(d, 'yy');
    const point = points.find((p) => {
      if (monthKey(p.label) !== monthKey(label)) return false;
      const py = yearKey(p.label);
      return py === null || py === yy;
    });
    return {
      period: format(d, 'yyyy-MM'),
      label,
      fullLabel: format(d, 'MMM yyyy'),
      value: point?.value ?? 0,
      hasData: point !== undefined,
      isCurrent: n === months - 1,
    };
  });

export interface RevenueSummary {
  /** The month before the current one; null when the window has only one. */
  lastMonth: MonthSlot | null;
  /**
   * Mean over the COMPLETED months that had revenue. The current month is still
   * accruing and would drag the average down; months before the company's first
   * invoice are not months it earned nothing in.
   */
  average: number | null;
  completedMonthsWithData: number;
  total: number;
}

export const summariseRevenue = (slots: MonthSlot[]): RevenueSummary => {
  const completed = slots.filter((s) => !s.isCurrent && s.hasData);
  const sum = completed.reduce((t, s) => t + s.value, 0);
  return {
    lastMonth: slots.length > 1 ? slots[slots.length - 2] : null,
    average: completed.length > 0 ? sum / completed.length : null,
    completedMonthsWithData: completed.length,
    total: slots.reduce((t, s) => t + s.value, 0),
  };
};

const parseDay = (iso?: string): Date | null => {
  if (!iso) return null;
  // parseISO reads a bare date as LOCAL midnight. `new Date('2026-09-01')` reads
  // it as UTC and lands on the 31st anywhere west of Greenwich.
  const d = parseISO(iso.slice(0, 10));
  return isValid(d) ? d : null;
};

/** `20 Sep 2026`, or the input unchanged when it is not a date. */
export const displayDate = (iso: string): string => {
  const d = parseDay(iso);
  return d ? format(d, 'd MMM yyyy') : iso;
};

/**
 * `1–24 Sep 2026` for the dashboard's reporting window, collapsing whatever the
 * two ends share. Null when the server sent no period.
 */
export const periodLabel = (
  period?: { startDate?: string; endDate?: string } | null,
): string | null => {
  const start = parseDay(period?.startDate);
  const end = parseDay(period?.endDate);
  if (!start || !end) return null;

  if (start.getFullYear() !== end.getFullYear()) {
    return `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
  }
  if (start.getDate() === end.getDate()) return format(end, 'd MMM yyyy');
  return `${format(start, 'd')}–${format(end, 'd MMM yyyy')}`;
};

/**
 * Where a server alert leads. Each goes to the screen that lists what it counts
 * — the aging reports rather than the document lists, because an overdue
 * invoice is a question of age, and the lists cannot sort by it. An alert this
 * build does not know renders without a link.
 */
const ALERT_TARGETS: Record<string, string> = {
  overdue: '/reports/ar-aging',
  pending_bills: '/reports/ap-aging',
  pending_delivery: '/deliveries',
};

export const alertTarget = (alert: Pick<DashboardAlert, 'id'>): string | null =>
  ALERT_TARGETS[alert.id] ?? null;
