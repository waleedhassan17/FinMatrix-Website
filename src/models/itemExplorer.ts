// ═══════════════════════════════════════════════════════
// FinMatrix Web — Item explorer
// ═══════════════════════════════════════════════════════
// One item's figures, month by month, in the shape the explorer reads them:
// pick a metric, chart it, and see every metric beside it in a table.
//
// Two server series meet here. `item-performance` carries what the item SOLD
// (revenue, cost, units) and `inventory-valuation/items/:id/history` carries
// what it HELD (on hand, value, in and out). Both are asked for over the same
// range, so their months line up; they are joined by period, never by
// position.
//
// Everything below is display arithmetic on the server's monthly figures.
// Period totals are the server's own where it sends them (the figure strip
// reads `totals`); the explorer's summary line is derived here from the
// months, and a test holds the two in step.

import { canDonut, OTHER_KEY, type SlicePoint } from '@/models/chartSlices';
import { variance } from '@/models/reportStatement';
import { STOCK_STATUS_DISPLAY, formatQty, stockStatus } from '@/models/inventory';
import { monthsSpanned, type ReportRange } from '@/models/reportPeriod';
import type { KpiAssessment } from '@/serializers/kpiSerializer';
import type {
  InventoryItemHistory,
  ItemChannel,
  ItemFacts,
  ItemPerformance,
  ItemReturns,
} from '@/serializers/reportSerializers';
import { compactMoney, formatAmount, formatMoney, parenNegative, sumMoney, toDecimal } from '@/utils/money';

export type ExplorerMetricKey =
  | 'revenue'
  | 'cogs'
  | 'grossProfit'
  | 'marginPct'
  | 'unitsSold'
  | 'avgPrice'
  | 'closingQty'
  | 'closingValue'
  | 'qtyIn'
  | 'qtyOut';

export type MetricUnit = 'money' | 'qty' | 'percent';

/**
 * How a metric adds up over a period.
 *
 * A FLOW is a month's total and sums (revenue). A RATIO is recomputed from the
 * period's own totals — averaging twelve monthly margins would weight a month
 * that sold one unit the same as one that sold a thousand. A LEVEL is a
 * reading at month end and the period's figure is the latest one (stock on
 * hand is not the sum of twelve month-ends).
 */
export type MetricKind = 'flow' | 'ratio' | 'level';

export type MetricGroup = 'sales' | 'stock';

export interface ExplorerMetric {
  key: ExplorerMetricKey;
  label: string;
  group: MetricGroup;
  unit: MetricUnit;
  kind: MetricKind;
  /** One line under the chart title saying exactly what is drawn. */
  description: string;
  /**
   * Whether a rise is good news, for colouring a change. Null is neither:
   * more stock on hand or more cost of sales is not good or bad by itself.
   */
  higherIsBetter: boolean | null;
}

export const EXPLORER_METRICS: readonly ExplorerMetric[] = [
  {
    key: 'revenue',
    label: 'Revenue',
    group: 'sales',
    unit: 'money',
    kind: 'flow',
    description: 'Net of tax and invoice discounts, by document date. Returns are netted.',
    higherIsBetter: true,
  },
  {
    key: 'cogs',
    label: 'Cost of sales',
    group: 'sales',
    unit: 'money',
    kind: 'flow',
    description: 'What the units sold cost, frozen when each sale posted.',
    higherIsBetter: null,
  },
  {
    key: 'grossProfit',
    label: 'Gross profit',
    group: 'sales',
    unit: 'money',
    kind: 'flow',
    description: 'Revenue less cost of sales.',
    higherIsBetter: true,
  },
  {
    key: 'marginPct',
    label: 'Margin',
    group: 'sales',
    unit: 'percent',
    kind: 'ratio',
    description: 'Gross profit as a share of revenue. No sales, no margin.',
    higherIsBetter: true,
  },
  {
    key: 'unitsSold',
    label: 'Units sold',
    group: 'sales',
    unit: 'qty',
    kind: 'flow',
    description: 'Net of customer returns.',
    higherIsBetter: true,
  },
  {
    key: 'avgPrice',
    label: 'Avg selling price',
    group: 'sales',
    unit: 'money',
    kind: 'ratio',
    description: 'Revenue per unit sold, net of tax and discounts.',
    higherIsBetter: true,
  },
  {
    key: 'closingQty',
    label: 'Stock on hand',
    group: 'stock',
    unit: 'qty',
    kind: 'level',
    description: 'Units on hand at each month end, by document date.',
    higherIsBetter: null,
  },
  {
    key: 'closingValue',
    label: 'Stock value',
    group: 'stock',
    unit: 'money',
    kind: 'level',
    description: 'What the units on hand are carried at, at each month end.',
    higherIsBetter: null,
  },
  {
    key: 'qtyIn',
    label: 'Received',
    group: 'stock',
    unit: 'qty',
    kind: 'flow',
    description: 'Units into stock: receipts, returns and upward adjustments.',
    higherIsBetter: null,
  },
  {
    key: 'qtyOut',
    label: 'Issued',
    group: 'stock',
    unit: 'qty',
    kind: 'flow',
    description: 'Units out of stock: sales, deliveries and write-downs.',
    higherIsBetter: null,
  },
];

const BY_KEY = new Map(EXPLORER_METRICS.map((m) => [m.key, m]));

export const METRIC_GROUPS: { key: MetricGroup; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'stock', label: 'Stock' },
];

export const explorerMetric = (key: ExplorerMetricKey): ExplorerMetric =>
  BY_KEY.get(key) ?? EXPLORER_METRICS[0];

export const isExplorerMetricKey = (v: unknown): v is ExplorerMetricKey =>
  typeof v === 'string' && BY_KEY.has(v as ExplorerMetricKey);

// ─── The months ─────────────────────────────────────────────────────────────

export type MetricValues = Record<ExplorerMetricKey, number | null>;

export interface ExplorerMonth {
  /** 'YYYY-MM' — the join key; labels repeat across years. */
  period: string;
  /** 'Mar 26'. */
  label: string;
  values: MetricValues;
}

const round2 = (n: number): number => toDecimal(n).toDecimalPlaces(2).toNumber();

/**
 * The months, with both series joined by period.
 *
 * Sales months come from performance and stock months from history; either may
 * be missing (an older server, or one request failing), and the other still
 * draws. A metric whose series is absent is null for every month — a gap on
 * the chart, never a row of zeros that claims nothing happened.
 */
export const buildExplorerMonths = (
  perf: ItemPerformance | null | undefined,
  history: InventoryItemHistory | null | undefined,
): ExplorerMonth[] => {
  const perfBy = new Map((perf?.points ?? []).map((p) => [p.period, p]));
  const histBy = new Map((history?.points ?? []).map((p) => [p.period, p]));
  const spine = perf?.points.length ? perf.points : (history?.points ?? []);

  return spine.map(({ period, label }) => {
    const s = perfBy.get(period);
    const h = histBy.get(period);
    return {
      period,
      label,
      values: {
        revenue: s ? s.revenue : null,
        cogs: s ? s.cogs : null,
        grossProfit: s ? s.grossProfit : null,
        marginPct: s ? s.marginPct : null,
        unitsSold: s ? s.unitsSold : null,
        // Per unit only where units went out: a month of returns alone has no
        // selling price, it has a refund.
        avgPrice: s && s.unitsSold > 0 ? round2(s.revenue / s.unitsSold) : null,
        closingQty: h ? h.closingQty : null,
        closingValue: h && h.valueKnown ? h.closingValue : null,
        qtyIn: h ? h.qtyIn : null,
        qtyOut: h ? h.qtyOut : null,
      },
    };
  });
};

/** Whether the item traded at all in these months. */
export const hasSales = (months: readonly ExplorerMonth[]): boolean =>
  months.some(
    (m) => (m.values.revenue ?? 0) !== 0 || (m.values.cogs ?? 0) !== 0 || (m.values.unitsSold ?? 0) !== 0,
  );

/** Where the explorer opens: on revenue if the item sold, on stock if not. */
export const defaultMetric = (months: readonly ExplorerMonth[]): ExplorerMetricKey =>
  hasSales(months) ? 'revenue' : 'closingQty';

const known = (values: readonly (number | null)[]): number[] =>
  values.filter((v): v is number => v !== null);

const column = (months: readonly ExplorerMonth[], key: ExplorerMetricKey) =>
  months.map((m) => m.values[key]);

/**
 * The period's figure for a metric: a flow sums, a ratio is recomputed from
 * the period's own totals, a level is its latest reading. Null when there is
 * nothing to say — no months, no sales behind a margin, no stock history.
 */
export const periodValue = (
  months: readonly ExplorerMonth[],
  key: ExplorerMetricKey,
): number | null => {
  const metric = explorerMetric(key);

  if (key === 'marginPct') {
    const revenue = sumMoney(known(column(months, 'revenue'))).toNumber();
    const gp = sumMoney(known(column(months, 'grossProfit'))).toNumber();
    return revenue > 0 ? toDecimal(gp).dividedBy(revenue).times(100).toDecimalPlaces(2).toNumber() : null;
  }
  if (key === 'avgPrice') {
    const units = known(column(months, 'unitsSold')).reduce((t, v) => t + v, 0);
    const revenue = sumMoney(known(column(months, 'revenue'))).toNumber();
    return units > 0 ? round2(revenue / units) : null;
  }

  const values = known(column(months, key));
  if (values.length === 0) return null;
  if (metric.kind === 'level') {
    for (let i = months.length - 1; i >= 0; i--) {
      const v = months[i].values[key];
      if (v !== null) return v;
    }
    return null;
  }
  return metric.unit === 'money'
    ? sumMoney(values).toNumber()
    : toDecimal(values.reduce((t, v) => t + v, 0)).toDecimalPlaces(4).toNumber();
};

// ─── Change ─────────────────────────────────────────────────────────────────

export interface MetricChange {
  /** Current less prior, in the metric's unit (points for a margin). */
  delta: number;
  /** Null for a margin (its change IS the delta, in points) or a zero base. */
  percent: number | null;
}

/**
 * How a figure moved against another. A margin moves in percentage POINTS —
 * 30% to 33% is "+3 pts", not "+10%" — and a figure from a zero base has no
 * percentage at all, only the amount.
 */
export const metricChange = (
  key: ExplorerMetricKey,
  current: number | null,
  prior: number | null,
): MetricChange | null => {
  if (current === null || prior === null) return null;
  if (explorerMetric(key).unit === 'percent') {
    return { delta: toDecimal(current).minus(prior).toDecimalPlaces(1).toNumber(), percent: null };
  }
  return variance(current, prior);
};

/** Each month against the one before it. The first has nothing to compare to. */
export const monthOnMonth = (
  months: readonly ExplorerMonth[],
  key: ExplorerMetricKey,
  index: number,
): MetricChange | null =>
  index > 0 ? metricChange(key, months[index].values[key], months[index - 1].values[key]) : null;

// ─── Summary ────────────────────────────────────────────────────────────────

export interface MetricSummary {
  /** The period's figure — total, recomputed ratio, or latest level. */
  value: number | null;
  /** Per month over the months that have a reading. */
  average: number | null;
  best: { label: string; value: number } | null;
  worst: { label: string; value: number } | null;
  /** How many months have a reading at all. */
  readings: number;
}

export const summarizeMetric = (
  months: readonly ExplorerMonth[],
  key: ExplorerMetricKey,
): MetricSummary => {
  const readings = months.filter((m) => m.values[key] !== null);
  const values = readings.map((m) => m.values[key] as number);
  let best: MetricSummary['best'] = null;
  let worst: MetricSummary['worst'] = null;
  for (const m of readings) {
    const v = m.values[key] as number;
    if (!best || v > best.value) best = { label: m.label, value: v };
    if (!worst || v < worst.value) worst = { label: m.label, value: v };
  }
  // A best and worst that are the same month, or the same figure, say nothing.
  if (best && worst && best.value === worst.value) {
    best = null;
    worst = null;
  }
  return {
    value: periodValue(months, key),
    average: values.length ? round2(values.reduce((t, v) => t + v, 0) / values.length) : null,
    best,
    worst,
    readings: values.length,
  };
};

// ─── Formatting ─────────────────────────────────────────────────────────────

const compactQty = (n: number): string => {
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 10_000) return `${sign}${Math.round(a / 1_000)}K`;
  if (a >= 1_000) return `${sign}${(a / 1_000).toFixed(1)}K`;
  return `${sign}${formatQty(Math.round(a * 100) / 100)}`;
};

const pct = (n: number, digits = 1): string =>
  `${n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}%`;

/** A figure in full: `Rs 12,300.00`, `1,240`, `33.6%`. Null is an em-dash. */
export const formatMetric = (key: ExplorerMetricKey, value: number | null): string => {
  if (value === null) return '—';
  const { unit } = explorerMetric(key);
  if (unit === 'money') return formatMoney(value);
  if (unit === 'percent') return pct(value);
  return value < 0 ? `−${formatQty(-value)}` : formatQty(value);
};

/** Short, for an axis or a tight space: `Rs 12K`, `1.2K`, `34%`. */
export const formatMetricCompact = (key: ExplorerMetricKey, value: number | null): string => {
  if (value === null) return '—';
  const { unit } = explorerMetric(key);
  if (unit === 'money') return compactMoney(value);
  if (unit === 'percent') return pct(value, 0);
  return compactQty(value);
};

/** For a table cell whose column already says the currency. */
export const formatMetricCell = (key: ExplorerMetricKey, value: number | null): string => {
  if (value === null) return '—';
  const { unit } = explorerMetric(key);
  if (unit === 'money') return formatAmount(value);
  if (unit === 'percent') return pct(value);
  return value < 0 ? `−${formatQty(-value)}` : formatQty(value);
};

/** "+12.4%", "−3.1 pts", "+Rs 4.5K" from a zero base; null for no change to show. */
export const formatChange = (key: ExplorerMetricKey, change: MetricChange | null): string | null => {
  if (!change) return null;
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
  if (explorerMetric(key).unit === 'percent') {
    if (change.delta === 0) return null;
    return `${sign(change.delta)}${Math.abs(change.delta).toFixed(1)} pts`;
  }
  if (change.percent !== null) return `${sign(change.percent)}${Math.abs(change.percent)}%`;
  if (change.delta === 0) return null;
  return `${sign(change.delta)}${formatMetricCompact(key, Math.abs(change.delta))}`;
};

/**
 * Whether a change is good news, bad news or neither — for its colour. Null
 * when the metric has no preferred direction, or nothing moved.
 */
export const changeTone = (
  key: ExplorerMetricKey,
  change: MetricChange | null,
): 'good' | 'bad' | null => {
  const dir = explorerMetric(key).higherIsBetter;
  if (!change || dir === null || change.delta === 0) return null;
  return change.delta > 0 === dir ? 'good' : 'bad';
};

// ─── Stock cover ────────────────────────────────────────────────────────────

const parseIso = (iso: string): Date => new Date(`${iso}T00:00:00`);

/**
 * Days the stock on hand lasts at the window's selling rate.
 *
 * The rate is units sold per ELAPSED day: a window that runs to the end of
 * this month has not had those days yet, and counting them would understate
 * the rate and overstate the cover. Null when nothing sold (no rate to divide
 * by); zero when it is out of stock and still selling.
 *
 * The server works this out now (item-stock.ts, held to these same cases);
 * this is the figure for a server from before it.
 */
export const daysOfCover = (
  onHand: number,
  unitsSold: number,
  range: ReportRange,
  today: Date = new Date(),
): number | null => {
  if (onHand <= 0) return unitsSold > 0 ? 0 : null;
  const start = parseIso(range.startDate);
  const end = parseIso(range.endDate);
  const until = end.getTime() > today.getTime() ? today : end;
  const days = Math.floor((until.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days <= 0 || unitsSold <= 0) return null;
  return Math.round(onHand / (unitsSold / days));
};

/** Whole days between an ISO date and today, for "last sold 12 days ago". */
export const daysSince = (iso: string | null, today: Date = new Date()): number | null => {
  if (!iso) return null;
  const then = parseIso(iso);
  if (Number.isNaN(then.getTime())) return null;
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((midnight.getTime() - then.getTime()) / 86_400_000));
};

/** "Out of stock", "Over a year", "12 days", or "No recent sales". */
export const coverText = (days: number | null): string => {
  if (days === null) return 'No recent sales';
  if (days === 0) return 'Out of stock';
  if (days > 365) return 'Over a year';
  return `${days.toLocaleString('en-US')} day${days === 1 ? '' : 's'}`;
};

/**
 * Days of cover and its verdict: the server's, or — from a server before it
 * worked them out — the same arithmetic here, with no verdict rather than a
 * guessed one.
 */
export const itemCover = (
  facts: ItemFacts,
  unitsSold: number,
  range: ReportRange,
  today: Date = new Date(),
): { days: number | null; assessment: KpiAssessment | null } =>
  facts.daysOfCover !== undefined
    ? { days: facts.daysOfCover, assessment: facts.cover }
    : { days: daysOfCover(facts.qtyOnHand, unitsSold, range, today), assessment: null };

// ─── The item, today ────────────────────────────────────────────────────────

export type StockBadgeKey = 'inactive' | 'out' | 'dead' | 'low' | 'ok';

/**
 * The one badge beside the item's name, most urgent first: out of stock, then
 * dead stock, then low. An inactive item says only that, as its record page
 * does — nobody restocks what they retired.
 */
export const stockBadge = (facts: ItemFacts): StockBadgeKey => {
  if (!facts.isActive) return 'inactive';
  const status =
    facts.stockStatus ??
    stockStatus({ quantityOnHand: facts.qtyOnHand, reorderPoint: facts.reorderPoint });
  if (status === 'out') return 'out';
  if (facts.deadStock) return 'dead';
  return status;
};

/** Each badge's words and its tier in the shared status colours. */
export const STOCK_BADGE: Record<StockBadgeKey, { label: string; status: string; hint?: string }> = {
  inactive: { label: 'Inactive', status: 'inactive' },
  out: { label: STOCK_STATUS_DISPLAY.out.label, status: STOCK_STATUS_DISPLAY.out.badge },
  dead: { label: 'Dead stock', status: 'expired', hint: 'Nothing out in 180 days' },
  low: { label: STOCK_STATUS_DISPLAY.low.label, status: STOCK_STATUS_DISPLAY.low.badge },
  ok: { label: STOCK_STATUS_DISPLAY.ok.label, status: STOCK_STATUS_DISPLAY.ok.badge },
};

/** "45 units", "1 unit", "12 kg" — only the generic word takes a plural. */
export const unitsText = (qty: number, unitOfMeasure = 'unit'): string => {
  const word = unitOfMeasure === 'unit' && Math.abs(qty) !== 1 ? 'units' : unitOfMeasure;
  return `${formatMetric('closingQty', qty)} ${word}`;
};

export interface StockMeter {
  /** On hand, as a share of the bar (0–100). */
  fillPct: number;
  /** Where the reorder point sits on the bar (0–100). */
  tickPct: number;
  /** On hand less the reorder point: below it when negative. */
  headroom: number;
}

/**
 * On hand against the reorder point, for a bar with a tick at the point. The
 * scale leaves room either side, so neither the fill nor the tick sits on an
 * edge. Null with no reorder point set — there is nothing to measure against.
 */
export const stockMeter = (onHand: number, reorderPoint: number): StockMeter | null => {
  if (!(reorderPoint > 0)) return null;
  const scale = Math.max(onHand * 1.1, reorderPoint * 2);
  const pct = (v: number) => Math.min(100, Math.max(0, (v / scale) * 100));
  return { fillPct: pct(onHand), tickPct: pct(reorderPoint), headroom: onHand - reorderPoint };
};

export interface PriceAndMargin {
  price: number;
  cost: number;
  /** Price less average cost, per unit. */
  margin: number;
  /** Margin as a share of the price; null with no price. */
  marginPct: number | null;
  /** Cost as a share of the price (0–100), for the cost | margin bar; null with no price. */
  costShare: number | null;
  /** What a unit actually sold for in the window, net of tax and discounts. */
  realised: number | null;
  /** The realised price against the list price, in percent. */
  vsListPct: number | null;
}

/** The item's list price against its cost, and what it really sold for. */
export const priceAndMargin = (
  facts: ItemFacts,
  totals: { revenue: number; unitsSold: number } | null | undefined,
): PriceAndMargin => {
  const price = facts.sellingPrice;
  const cost = facts.unitCost;
  const margin = toDecimal(price).minus(cost).toDecimalPlaces(2).toNumber();
  const realised =
    totals && totals.unitsSold > 0 ? round2(totals.revenue / totals.unitsSold) : null;
  return {
    price,
    cost,
    margin,
    marginPct: price > 0 ? round2((margin / price) * 100) : null,
    costShare: price > 0 ? Math.min(100, Math.max(0, (cost / price) * 100)) : null,
    realised,
    vsListPct: realised !== null && price > 0 ? round2(((realised - price) / price) * 100) : null,
  };
};

/** "At list price", "4.2% below list", "1.3% above list". */
export const vsListText = (pct: number | null): string | null => {
  if (pct === null) return null;
  if (Math.abs(pct) < 0.5) return 'At list price';
  return `${Math.abs(pct).toFixed(1)}% ${pct < 0 ? 'below' : 'above'} list`;
};

/** Months in which the item sold or was returned at all. */
export const monthsWithSales = (months: readonly ExplorerMonth[]): number =>
  months.filter((m) => (m.values.unitsSold ?? 0) !== 0 || (m.values.revenue ?? 0) !== 0).length;

/**
 * The comparison, said once beside the window rather than under every
 * figure: "Compared with the prior 10 months", or why there is none. Null
 * while the window before is still loading, or could not be.
 */
export const comparisonCaption = (range: ReportRange, priorEmpty: boolean | null): string | null => {
  if (priorEmpty === null) return null;
  const n = monthsSpanned(range);
  const words = /^\d{4}-\d{2}-01$/.test(range.startDate)
    ? `prior ${n} month${n === 1 ? '' : 's'}`
    : 'prior period';
  return priorEmpty ? `No sales in the ${words} to compare with` : `Compared with the ${words}`;
};

// ─── Revenue breakdown ──────────────────────────────────────────────────────

export type BreakdownDimension = 'customer' | 'channel';

export const CHANNEL_LABEL: Record<ItemChannel['key'], string> = {
  invoice: 'Invoices',
  delivery: 'Deliveries',
};

export interface RevenueBreakdown {
  /** In the server's order — largest first — with Other last, never re-sorted. */
  slices: SlicePoint[];
  /** The whole the shares are of. */
  total: number;
  /** Whether it can be a ring: no part below zero, and something to draw. */
  donut: boolean;
}

/**
 * Who bought it, or how it went out — as slices for the ring or the bars.
 *
 * The server sends its top five customers and folds the rest; they are taken
 * as they come, with Other last, because re-folding would sort a large Other
 * to the front and give it a colour. Channels are the sales before returns;
 * what came back is stated beside them (see `returnsText`), not drawn as a
 * slice of what went out.
 */
export const revenueBreakdown = (
  perf: ItemPerformance,
  dimension: BreakdownDimension,
): RevenueBreakdown => {
  if (dimension === 'channel') {
    const slices = (perf.channels ?? []).map((c) => ({
      key: c.key,
      label: CHANNEL_LABEL[c.key],
      value: c.revenue,
      count: c.unitsSold,
      sharePct: c.sharePct,
    }));
    const total = sumMoney(slices.map((x) => x.value)).toNumber();
    return { slices, total, donut: total > 0 && canDonut(slices) };
  }
  const slices: SlicePoint[] = perf.customers.map((c, i) => ({
    key: c.customerId ?? `none-${i}`,
    label: c.customerName,
    value: c.revenue,
    count: c.unitsSold,
    sharePct: c.sharePct,
  }));
  const other = perf.otherCustomers;
  if (other.count > 0) {
    slices.push({
      key: OTHER_KEY,
      label: `Other (${other.count})`,
      value: other.revenue,
      count: other.unitsSold,
      sharePct: other.sharePct,
    });
  }
  const total = perf.totals.revenue;
  return { slices, total, donut: total > 0 && canDonut(slices) };
};

/**
 * Whether "by channel" says anything: only when the item went out both ways.
 * A ring that is all one slice is not a breakdown.
 */
export const hasChannelBreakdown = (perf: ItemPerformance | null | undefined): boolean =>
  (perf?.channels ?? []).filter((c) => c.revenue !== 0 || c.unitsSold !== 0).length >= 2;

/** "Returns (Rs 2,350.00) · 1 unit — taken off revenue", or null with none. */
export const returnsText = (returns: ItemReturns | null, unitOfMeasure = 'unit'): string | null => {
  if (!returns || (returns.revenue === 0 && returns.unitsSold === 0)) return null;
  return `Returns ${parenNegative(returns.revenue)} · ${unitsText(Math.abs(returns.unitsSold), unitOfMeasure)} — taken off revenue`;
};

// ─── Export ─────────────────────────────────────────────────────────────────

/** Metric rows by month, plus the period column — the table as a spreadsheet. */
export const explorerCsvRows = (
  months: readonly ExplorerMonth[],
): (string | number)[][] => {
  const header = ['Metric', ...months.map((m) => m.label), 'Period'];
  const cell = (key: ExplorerMetricKey, v: number | null): string | number => {
    if (v === null) return '';
    const { unit } = explorerMetric(key);
    return unit === 'money' ? v.toFixed(2) : unit === 'percent' ? v.toFixed(1) : v;
  };
  return [
    header,
    ...EXPLORER_METRICS.map((m) => [
      m.unit === 'percent' ? `${m.label} (%)` : m.label,
      ...months.map((mo) => cell(m.key, mo.values[m.key])),
      cell(m.key, periodValue(months, m.key)),
    ]),
  ];
};
