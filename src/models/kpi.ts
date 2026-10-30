// ═══════════════════════════════════════════════════════
// FinMatrix Web — KPI presentation
// ═══════════════════════════════════════════════════════
// How a KPI reads on screen: its unit, which direction is good news, and what
// a null value means. The FORMULAS are not here — they live on the server, in
// reports-kpi.service.ts, and arrive on each KPI with the inputs they used.
// This file only decides how to print the answer.

import type { Kpi, KpiAssessment, KpiAssessmentLevel, KpiUnit } from '@/serializers/kpiSerializer';
import { compactMoney, formatMoney, parenNegative } from '@/utils/money';

/**
 * Whether a rise is good news. Null means neither — the card then shows the
 * move without a tone, rather than guessing.
 *
 * A rising DSO is bad (customers paying slower); a rising DPO is good for
 * cash (paying suppliers later); a rising DIO is bad (stock sitting longer).
 */
export const KPI_HIGHER_IS_BETTER: Record<string, boolean | null> = {
  workingCapital: true,
  currentRatio: true,
  quickRatio: true,
  debtToEquity: false,
  dso: false,
  dpo: true,
  dio: false,
  ccc: false,
  runwayMonths: true,
  revenue: true,
  grossProfit: true,
  netIncome: true,
  grossMarginPct: true,
  netMarginPct: true,
  operatingExpenses: false,
  operatingCashFlow: true,
  endingCash: true,
  turnover: true,
  inventoryTurnover: true,
  dio12: false,
  cashAndBank: true,
  overduePct: false,
  weightedAvgDaysOverdue: false,
  top5SharePct: false,
};

/** The balance-sheet health strip: the four questions a lender asks. */
export const HEALTH_KPI_KEYS = ['workingCapital', 'currentRatio', 'quickRatio', 'debtToEquity'] as const;

/** What a null value means, by the server's `status`. */
const STATUS_TEXT: Record<string, string> = {
  cash_positive: 'Cash-positive — no burn',
  no_denominator: 'Not enough activity to measure',
  negative_equity: 'Equity is negative',
  no_revenue: 'No revenue in the window',
  no_cogs: 'No cost of sales in the window',
  no_liabilities: 'No current liabilities',
  insufficient_history: 'Not enough history',
};

export const kpiStatusText = (status: string | null): string | null => {
  if (!status) return null;
  return STATUS_TEXT[status] ?? status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
};

const MINUS = '−';

const fixed = (value: number, digits: number): string => {
  const text = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return value < 0 ? `${MINUS}${text}` : text;
};

/**
 * A KPI value in its unit: Rs 1,240,500.00 · 1.82× · 42 days · 7.5 mo · 41.2%.
 * Null prints as an em-dash; the card adds the status line that explains it.
 */
export const formatKpiValue = (value: number | null, unit: KpiUnit): string => {
  if (value === null) return '—';
  switch (unit) {
    case 'money':
      // In brackets, as every money figure on a statement is — and as the
      // app's KPI cards print it.
      return parenNegative(value);
    case 'ratio':
      return `${fixed(value, 2)}×`;
    case 'days': {
      const n = Math.round(value);
      return `${n < 0 ? MINUS : ''}${Math.abs(n).toLocaleString('en-US')} ${Math.abs(n) === 1 ? 'day' : 'days'}`;
    }
    case 'months':
      return `${fixed(value, 1)} mo`;
    case 'percent':
      return `${fixed(value, 1)}%`;
    case 'count':
      return fixed(Math.round(value), 0);
  }
};

/**
 * A KPI's move in its own terms: money moves in rupees (with its % when the
 * server sent one), a percentage moves in points, a ratio in ×.
 */
export const formatKpiChange = (kpi: Pick<Kpi, 'change' | 'changePct' | 'unit'>): string | null => {
  const { change, changePct, unit } = kpi;
  if (change === null) return null;
  const sign = change > 0 ? '+' : change < 0 ? MINUS : '';
  const abs = Math.abs(change);
  switch (unit) {
    case 'money': {
      const pct = changePct !== null ? ` (${changePct > 0 ? '+' : changePct < 0 ? MINUS : ''}${Math.abs(changePct).toFixed(1)}%)` : '';
      return `${sign}${formatMoney(abs)}${pct}`;
    }
    case 'percent':
      return `${sign}${abs.toFixed(1)} pts`;
    case 'ratio':
      return `${sign}${abs.toFixed(2)}×`;
    case 'days':
      return `${sign}${Math.round(abs)} ${Math.round(abs) === 1 ? 'day' : 'days'}`;
    case 'months':
      return `${sign}${abs.toFixed(1)} mo`;
    case 'count':
      return `${sign}${Math.round(abs)}`;
  }
};

export type KpiTone = 'good' | 'bad' | 'neutral';

/** Good or bad news, from the direction of the move and which way is better. */
export const kpiTone = (key: string, change: number | null): KpiTone => {
  if (change === null || change === 0) return 'neutral';
  const better = KPI_HIGHER_IS_BETTER[key];
  if (better === undefined || better === null) return 'neutral';
  return change > 0 === better ? 'good' : 'bad';
};

/**
 * What a screen reader hears for a figure: "Current ratio, 1.82×, up 0.12×".
 * The same words whether the move is good or bad — tone is a visual aid, the
 * direction is the fact.
 */
export const kpiAccessibleLabel = (kpi: Pick<Kpi, 'label' | 'value' | 'unit' | 'change' | 'changePct' | 'status'>): string => {
  const parts = [kpi.label, formatKpiValue(kpi.value, kpi.unit)];
  if (kpi.value === null) {
    const why = kpiStatusText(kpi.status);
    if (why) parts.push(why);
  }
  if (kpi.change !== null && kpi.change !== 0) {
    const dir = kpi.change > 0 ? 'up' : 'down';
    const by =
      kpi.unit === 'money' && kpi.changePct !== null
        ? `${Math.abs(kpi.changePct).toFixed(1)}%`
        : (formatKpiChange({ ...kpi, change: Math.abs(kpi.change) }) ?? '').replace(/^\+/, '');
    parts.push(`${dir} ${by}`);
  }
  return parts.join(', ');
};

/**
 * A figure the server sent as a bare number (aging's weighted days overdue,
 * its top-5 share) dressed as a KPI so it can sit in a KpiCard. No formula is
 * invented for it: the card shows no ⓘ when there is none.
 */
export const plainKpi = (
  key: string,
  label: string,
  value: number | null,
  unit: KpiUnit,
  assessment: KpiAssessment | null = null,
): Kpi => ({
  key,
  label,
  value,
  unit,
  formula: '',
  inputs: [],
  asOfDate: '',
  status: null,
  prior: null,
  change: null,
  changePct: null,
  assessment,
});

/**
 * The words on an assessment pill. `neutral` has none: a figure with no rule
 * of thumb gets no pill rather than a grey one that says nothing.
 */
export const ASSESSMENT_LABEL: Record<Exclude<KpiAssessmentLevel, 'neutral'>, string> = {
  healthy: 'Healthy',
  watch: 'Watch',
  risk: 'At risk',
};

/** The pill for an assessment, or null when there is nothing to say. */
export const assessmentLabel = (a: KpiAssessment | null | undefined): string | null =>
  a && a.level !== 'neutral' ? ASSESSMENT_LABEL[a.level] : null;

/**
 * Shorter names for a KPI's inputs, for the one-line context under a figure —
 * the ⓘ keeps the full ones. Lower case: they follow a number mid-sentence.
 */
const CONTEXT_LABELS: Record<string, string> = {
  cashAndBank: 'cash and bank',
  currentAssets: 'current assets',
  currentLiabilities: 'current liabilities',
  receivables: 'receivables',
  inventory: 'stock',
  accountsPayable: 'payables',
  totalLiabilities: 'liabilities',
  totalEquity: 'equity',
  revenue90: 'sales in 90 days',
  cogs90: 'cost of sales in 90 days',
  avgMonthlyNetCash: 'net cash a month',
  cogs12: 'cost of sales in 12 months',
  averageInventory: 'average stock',
  revenue: 'revenue',
  cogs: 'cost of sales',
  grossProfit: 'gross profit',
  netIncome: 'net profit',
  operatingExpenses: 'operating expenses',
};

/** A figure compact enough for a context line: Rs 1.5M · 93 days · 1.82×. */
const compactValue = (value: number, unit: KpiUnit): string => {
  switch (unit) {
    case 'money':
      return compactMoney(value);
    case 'days':
      return formatKpiValue(value, 'days');
    default:
      return formatKpiValue(value, unit);
  }
};

/**
 * The figures behind a KPI in a line, from the server's own inputs (at most
 * three): "Rs 1.5M current assets · Rs 774K current liabilities". The cash conversion
 * cycle reads as its sum: "93 + 2,874 − 786 days".
 *
 * Null when there is nothing to add — a figure whose one input is itself.
 */
export const kpiContext = (kpi: Pick<Kpi, 'key' | 'inputs'>): string | null => {
  const known = kpi.inputs.filter((i) => i.value !== null);
  if (kpi.key === 'ccc') {
    const part = (k: string) => known.find((i) => i.key === k)?.value;
    const [dso, dio, dpo] = [part('dso'), part('dio'), part('dpo')];
    if (dso === undefined || dio === undefined || dpo === undefined) return null;
    const days = (v: number | null) => Math.round(v ?? 0).toLocaleString('en-US');
    return `${days(dso)} + ${days(dio)} ${MINUS} ${days(dpo)} days`;
  }
  if (known.length < 2) return null;
  return known
    .slice(0, 3)
    .map((i) => `${compactValue(i.value as number, i.unit)} ${CONTEXT_LABELS[i.key] ?? i.label.toLowerCase()}`)
    .join(' · ');
};
