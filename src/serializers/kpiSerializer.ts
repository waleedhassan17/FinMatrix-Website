// ═══════════════════════════════════════════════════════
// FinMatrix Web — KPI objects (reports v2)
// ═══════════════════════════════════════════════════════
// Every KPI the server computes — financial health, the owner cockpit, aging
// DSO/DPO, inventory turnover — arrives as one shape:
//
//   { key, label, value, unit, formula, inputs, asOfDate }
//
// with `value` null (never Infinity or NaN) when the denominator is zero, and a
// `status` that says why ('cash_positive', 'negative_equity'). The formula
// lives on the server, in reports-kpi.service.ts, and only there; this file
// reads it and never recomputes it.

import { asRaw, str } from '@/serializers/documentLines';

export type KpiUnit = 'money' | 'ratio' | 'days' | 'months' | 'percent' | 'count';

/** How a figure reads against a rule of thumb — judged on the server, in kpi-benchmarks.ts. */
export type KpiAssessmentLevel = 'healthy' | 'watch' | 'risk' | 'neutral';

export interface KpiAssessment {
  level: KpiAssessmentLevel;
  /** One sentence: what good looks like for this figure. */
  guide: string;
}

const LEVELS: ReadonlySet<string> = new Set(['healthy', 'watch', 'risk', 'neutral']);

/**
 * The server's verdict on a figure (reports v2). Null from a server that does
 * not send one — a card then shows no pill rather than one guessed here.
 */
export const assessmentSerializer = (raw: unknown): KpiAssessment | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = asRaw(raw);
  const level = str(r.level);
  return LEVELS.has(level) ? { level: level as KpiAssessmentLevel, guide: str(r.guide) } : null;
};

/** One figure that went into a KPI, as the server reports it. */
export interface KpiInput {
  key: string;
  label: string;
  value: number | null;
  unit: KpiUnit;
}

export interface Kpi {
  key: string;
  label: string;
  /** Null when the KPI is undefined for this data — read `status` for why. */
  value: number | null;
  unit: KpiUnit;
  /** Human-readable: "Current assets ÷ Current liabilities". */
  formula: string;
  inputs: KpiInput[];
  asOfDate: string;
  /** Why `value` is null, or a qualifier on it. Null when there is nothing to say. */
  status: string | null;
  /** The comparison period's value, where the endpoint supplies one. */
  prior: number | null;
  change: number | null;
  changePct: number | null;
  /** Healthy / watch / at risk, from the server. Null when it sent none. */
  assessment: KpiAssessment | null;
}

/**
 * Null stays null. A KPI with no value is a statement ("no burn — cash
 * positive"), and coercing it to 0 would print "0.0 months of runway", which is
 * the most alarming figure on the page and the wrong one.
 */
export const numberOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const x = typeof v === 'string' ? Number(v) : (v as number);
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
};

const UNIT_ALIASES: Record<string, KpiUnit> = {
  money: 'money',
  currency: 'money',
  amount: 'money',
  pkr: 'money',
  ratio: 'ratio',
  times: 'ratio',
  x: 'ratio',
  days: 'days',
  day: 'days',
  months: 'months',
  month: 'months',
  percent: 'percent',
  pct: 'percent',
  '%': 'percent',
  percentage: 'percent',
  count: 'count',
  number: 'count',
};

export const kpiUnit = (v: unknown, fallback: KpiUnit = 'money'): KpiUnit =>
  UNIT_ALIASES[str(v).toLowerCase()] ?? fallback;

/**
 * What the server's input keys are called on screen — the same words in the
 * app's kpiModel.ts. A key not listed here is humanised from its name.
 */
export const KPI_INPUT_LABELS: Record<string, string> = {
  cashAndBank: 'Cash and bank',
  currentAssets: 'Current assets',
  currentLiabilities: 'Current liabilities',
  receivables: 'Receivables',
  inventory: 'Inventory',
  accountsPayable: 'Accounts payable',
  totalLiabilities: 'Total liabilities',
  totalEquity: 'Total equity',
  revenue90: 'Revenue, last 90 days',
  cogs90: 'Cost of sales, last 90 days',
  avgMonthlyNetCash: 'Average net cash a month',
  dso: 'Days sales outstanding',
  dio: 'Days inventory outstanding',
  dpo: 'Days payables outstanding',
  cogs12: 'Cost of sales, last 12 months',
  averageInventory: 'Average inventory',
  revenue: 'Revenue',
  cogs: 'Cost of sales',
  grossProfit: 'Gross profit',
  netIncome: 'Net profit',
  operatingExpenses: 'Operating expenses',
  operatingCashFlow: 'Operating cash flow',
  endingCash: 'Ending cash',
};

/** Inputs that are counts of days, not money (the cash conversion cycle's parts). */
const DAY_INPUTS: ReadonlySet<string> = new Set(['dso', 'dio', 'dpo']);

/** `currentAssets` → `Current assets`, for inputs the server sends as a bare map. */
const humanise = (key: string): string => {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
};

/**
 * Inputs come either as `[{ key?, label, value, unit? }]` or as a plain
 * `{ currentAssets: 123, … }` map; both read the same on screen.
 */
const mapInputs = (raw: unknown, unit: KpiUnit): KpiInput[] => {
  if (Array.isArray(raw)) {
    return raw.map((item, i) => {
      const r = asRaw(item);
      const key = str(r.key, str(r.label, `input-${i}`));
      return {
        key,
        label: str(r.label, humanise(key)),
        value: numberOrNull(r.value),
        // An input to a ratio is money unless it says otherwise; an input to a
        // days figure is usually money too (AR, revenue), so 'money' is the
        // honest default rather than the KPI's own unit.
        unit: kpiUnit(r.unit, unit === 'percent' || unit === 'ratio' || unit === 'days' || unit === 'months' ? 'money' : unit),
      };
    });
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>).map(([key, value]) => {
      // `{ currentAssets: { value, unit, label } }` is accepted as well as a bare number.
      const fallbackUnit: KpiUnit = DAY_INPUTS.has(key) ? 'days' : 'money';
      if (value && typeof value === 'object') {
        const r = asRaw(value);
        return {
          key,
          label: str(r.label, KPI_INPUT_LABELS[key] ?? humanise(key)),
          value: numberOrNull(r.value),
          unit: kpiUnit(r.unit, fallbackUnit),
        };
      }
      return { key, label: KPI_INPUT_LABELS[key] ?? humanise(key), value: numberOrNull(value), unit: fallbackUnit };
    });
  }
  return [];
};

/**
 * One KPI. `fallbackKey` names it when it arrives as a value in a keyed map
 * (`{ currentRatio: {...} }`) rather than carrying its own `key`.
 *
 * The cockpit sends `current` beside `prior`; elsewhere the figure is `value`.
 */
export const kpiSerializer = (payload: unknown, fallbackKey = ''): Kpi => {
  const r = asRaw(payload);
  const unit = kpiUnit(r.unit);
  const key = str(r.key, fallbackKey);
  return {
    key,
    label: str(r.label, humanise(key)),
    value: numberOrNull(r.current !== undefined ? r.current : r.value),
    unit,
    formula: str(r.formula),
    inputs: mapInputs(r.inputs, unit),
    asOfDate: str(r.asOfDate),
    // 'ok' is the server saying there is nothing to qualify — the same as no status.
    status: r.status && str(r.status) !== 'ok' ? str(r.status) : null,
    prior: numberOrNull(r.prior),
    change: numberOrNull(r.change),
    changePct: numberOrNull(r.changePct),
    assessment: assessmentSerializer(r.assessment),
  };
};

/**
 * A KPI that may arrive as a full object or as a bare number (the aging
 * response's `dso` could be either). A bare number gets the given unit and no
 * formula, which the card handles by hiding its info popover.
 */
export const kpiOrNumber = (
  payload: unknown,
  key: string,
  label: string,
  unit: KpiUnit,
): Kpi | null => {
  if (payload === null || payload === undefined) return null;
  if (typeof payload === 'object') {
    const kpi = kpiSerializer(payload, key);
    return { ...kpi, label: kpi.label || label, unit: asRaw(payload).unit ? kpi.unit : unit };
  }
  return {
    key,
    label,
    value: numberOrNull(payload),
    unit,
    formula: '',
    inputs: [],
    asOfDate: '',
    status: null,
    prior: null,
    change: null,
    changePct: null,
    assessment: null,
  };
};

/**
 * A set of KPIs, keyed. Accepts the three ways a set can be sent — a bare
 * array, `{ kpis: [...] }`, or `{ currentRatio: {...}, … }` — because the
 * contract fixes the KPI object, not the envelope around it.
 */
export const kpiMapSerializer = (payload: unknown): Record<string, Kpi> => {
  const r = asRaw(payload);
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(r.kpis)
      ? (r.kpis as unknown[])
      : null;
  if (list) {
    const out: Record<string, Kpi> = {};
    for (const item of list) {
      const kpi = kpiSerializer(item);
      if (kpi.key) out[kpi.key] = kpi;
    }
    return out;
  }
  const source = r.kpis && typeof r.kpis === 'object' ? asRaw(r.kpis) : r;
  const out: Record<string, Kpi> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && ('value' in value || 'current' in value || 'formula' in value)) {
      out[key] = kpiSerializer(value, key);
    }
  }
  return out;
};
