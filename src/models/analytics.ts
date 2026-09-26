// ═══════════════════════════════════════════════════════
// FinMatrix Web — Analytics figures
// ═══════════════════════════════════════════════════════
// The analytics payload sends two monthly series built from the same months:
// what was invoiced, and invoiced LESS billed. Billed itself is not sent, but it
// is exactly the difference between them, so the page can chart all three side
// by side instead of drawing the net as a lone line with no context.
//
// Everything here is display arithmetic on the server's monthly figures. None of
// it is a statement total: Profit & Loss remains the report for earned revenue.

import { niceAxis, type ChartAxis } from '@/models/chartAxis';
import { variance, type Variance } from '@/models/reportStatement';
import type { TrendPoint } from '@/serializers/reportSerializers';
import { sumMoney, toDecimal } from '@/utils/money';

/** One month of the analytics chart and table. */
export interface AnalyticsMonth {
  label: string;
  /** Invoice totals dated in the month, tax included. */
  invoiced: number;
  /** Bill totals dated in the month — invoiced less `net`. */
  billed: number;
  /** Invoiced less billed. Not cash: nothing here says what was collected. */
  net: number;
  /** Invoiced against the month before it; null for the first month. */
  change: Variance | null;
}

/**
 * The months, with billed recovered from the two series.
 *
 * Both series come from the same query over the same months, so they share
 * labels; the match is by label anyway rather than by position, because a
 * positional zip would silently pair the wrong months if either ever changed.
 * A month missing from the net series had no bills: its net is what was
 * invoiced, so billed is zero.
 */
export const analyticsMonths = (
  revenue: TrendPoint[],
  net: TrendPoint[],
): AnalyticsMonth[] => {
  const netByLabel = new Map(net.map((p) => [p.label, p.value]));
  return revenue.map((p, i) => {
    const monthNet = netByLabel.get(p.label) ?? p.value;
    return {
      label: p.label,
      invoiced: p.value,
      // Decimal, so 1234.56 − 1000.1 is 234.46 and not 234.4599999.
      billed: toDecimal(p.value).minus(monthNet).toDecimalPlaces(2).toNumber(),
      net: monthNet,
      change: i > 0 ? variance(p.value, revenue[i - 1].value) : null,
    };
  });
};

export interface AnalyticsSummary {
  invoiced: number;
  billed: number;
  net: number;
  /** Invoiced per charted month. */
  averageInvoiced: number;
  first: AnalyticsMonth | null;
  latest: AnalyticsMonth | null;
  /** The month before the latest, which `latest.change` compares against. */
  previous: AnalyticsMonth | null;
}

/** The headline figures over the charted months. */
export const analyticsSummary = (months: AnalyticsMonth[]): AnalyticsSummary => {
  const invoiced = sumMoney(months.map((m) => m.invoiced)).toNumber();
  return {
    invoiced,
    billed: sumMoney(months.map((m) => m.billed)).toNumber(),
    net: sumMoney(months.map((m) => m.net)).toNumber(),
    averageInvoiced:
      months.length > 0
        ? toDecimal(invoiced).dividedBy(months.length).toDecimalPlaces(2).toNumber()
        : 0,
    first: months[0] ?? null,
    latest: months[months.length - 1] ?? null,
    previous: months[months.length - 2] ?? null,
  };
};

/** "Oct 25 – Sep 26", or the one month, or nothing. */
export const analyticsPeriodLabel = (months: AnalyticsMonth[]): string => {
  if (months.length === 0) return '';
  const first = months[0].label;
  const last = months[months.length - 1].label;
  return first === last ? first : `${first} – ${last}`;
};

/** A change as the page prints it: "+12.4%", "−3%", or null when there is no base. */
export const formatChange = (change: Variance | null): string | null => {
  if (!change || change.percent === null) return null;
  const p = change.percent;
  if (p === 0) return '0%';
  // U+2212 for the minus, as compactMoney does: a hyphen reads as a dash.
  return `${p > 0 ? '+' : '−'}${Math.abs(p)}%`;
};

// ─── The chart's money axis ─────────────────────────────────────────────────

export type AnalyticsAxis = ChartAxis;

/**
 * The value axis for the monthly chart: every figure it draws — invoiced,
 * billed and the difference — on one set of round ticks. See `niceAxis`.
 */
export const analyticsAxis = (months: AnalyticsMonth[], tickCount = 4): AnalyticsAxis =>
  niceAxis(
    months.flatMap((m) => [m.invoiced, m.billed, m.net]),
    { tickCount },
  );
