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

/** Round steps, so ticks read Rs 500K, 1.0M, 1.5M — never Rs 437.5K. */
const NICE_STEPS = [1, 2, 2.5, 5, 10];

const niceStep = (raw: number): number => {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return NICE_STEPS.map((n) => n * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
};

export interface AnalyticsAxis {
  domain: [number, number];
  ticks: number[];
}

/**
 * The value axis for the monthly chart.
 *
 * Left to itself the chart library extends the axis a whole round step below
 * zero for any negative value — a month that billed Rs 30K more than it
 * invoiced drops the floor to −Rs 500K, and a quarter of the chart is spent
 * on empty space. Here a shallow dip (under half a step) gets a sliver below
 * zero and no negative tick: the zero line marks the floor and the tooltip
 * carries the figure. A deep one gets the full steps it needs.
 */
export const analyticsAxis = (months: AnalyticsMonth[], tickCount = 4): AnalyticsAxis => {
  const values = months.flatMap((m) => [m.invoiced, m.billed, m.net]);
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  if (hi === 0 && lo === 0) return { domain: [0, 1], ticks: [0] };

  const step = niceStep(Math.max(hi, -lo) / tickCount);
  const top = Math.ceil(hi / step) * step;
  const deep = -lo > step / 2;
  const bottom = deep ? Math.floor(lo / step) * step : lo * 1.15;

  // Integer multiples, so the ticks carry no floating-point drift.
  const first = deep ? Math.round(bottom / step) : 0;
  const last = Math.round(top / step);
  const ticks: number[] = [];
  for (let i = first; i <= last; i++) ticks.push(i * step);

  return { domain: [bottom, top], ticks };
};
