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

import { variance } from '@/models/reportStatement';
import { formatQty } from '@/models/inventory';
import type { ReportRange } from '@/models/reportPeriod';
import type {
  InventoryItemHistory,
  ItemPerformance,
} from '@/serializers/reportSerializers';
import { compactMoney, formatAmount, formatMoney, sumMoney, toDecimal } from '@/utils/money';

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
 * by), zero when nothing is on hand.
 */
export const daysOfCover = (
  onHand: number,
  unitsSold: number,
  range: ReportRange,
  today: Date = new Date(),
): number | null => {
  if (onHand <= 0) return 0;
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
