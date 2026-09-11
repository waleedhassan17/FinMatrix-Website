// ═══════════════════════════════════════════════════════
// FinMatrix Web — Budget model
// ═══════════════════════════════════════════════════════
// Pure: types, the monthly spread, validation, and variance reading.
//
// A budget is per account, per month, for one fiscal year. Budget vs Actual
// compares each line against the account's POSTED general-ledger movement for
// that year — nothing is estimated.
//
// The server reports variance as budgeted − actual for every account. For an
// expense that reads correctly (positive = under budget = good). For REVENUE
// it reads backwards: selling more than budgeted gives a negative variance.
// `favourableVariance` puts the sign where an accountant expects it.

import { Decimal, toDecimal, type MoneyInput } from '@/utils/money';

export type BudgetStatus = 'draft' | 'active' | 'closed';

export const BUDGET_STATUS_OPTIONS: ReadonlyArray<{ value: BudgetStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
];

export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export interface BudgetLine {
  id: string;
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  /** Always twelve, January first. */
  monthlyAmounts: number[];
  annualTotal: number;
}

export interface Budget {
  id: string;
  name: string;
  fiscalYear: number;
  status: BudgetStatus;
  totalBudget: number;
  createdAt: string;
  lines: BudgetLine[];
}

export interface VsActualMonth {
  month: number;
  budgeted: number;
  actual: number;
  variance: number;
}

export interface VsActualRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  budgeted: number;
  actual: number;
  /** As the server sends it: budgeted − actual. */
  variance: number;
  percentUsed: number;
  months: VsActualMonth[];
}

export interface BudgetVsActual {
  budget: { id: string; name: string; fiscalYear: number; status: BudgetStatus };
  rows: VsActualRow[];
  totals: { budgeted: number; actual: number; variance: number };
}

export interface PrefillLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  monthlyAmounts: number[];
  annualTotal: number;
}

// ─── Arithmetic ─────────────────────────────────────────

/**
 * An annual amount spread across twelve months, in whole paise, with the
 * rounding remainder landing in December — so the months always add back to
 * exactly the annual figure. 100,000 → eleven × 8,333.33 and 8,333.37.
 */
export const evenSpread = (annual: MoneyInput): number[] => {
  const paise = toDecimal(annual).times(100).toDecimalPlaces(0).toNumber();
  const base = Math.floor(paise / 12);
  const months = Array.from({ length: 12 }, () => base);
  months[11] += paise - base * 12;
  return months.map((p) => p / 100);
};

export const monthsTotal = (months: MoneyInput[]): Decimal =>
  months.reduce<Decimal>((s, v) => s.plus(toDecimal(v)), new Decimal(0));

export const isRevenueType = (type: string): boolean => type === 'revenue' || type === 'income';

/**
 * Variance with the sign an accountant reads: positive is good. Revenue above
 * budget and spending below budget are both favourable.
 */
export const favourableVariance = (
  row: Pick<VsActualRow, 'accountType' | 'budgeted' | 'actual'>,
): Decimal =>
  isRevenueType(row.accountType)
    ? toDecimal(row.actual).minus(row.budgeted)
    : toDecimal(row.budgeted).minus(row.actual);

export type VarianceTone = 'favourable' | 'unfavourable' | 'on_budget';

export const varianceTone = (
  row: Pick<VsActualRow, 'accountType' | 'budgeted' | 'actual'>,
): VarianceTone => {
  const v = favourableVariance(row);
  if (v.isZero()) return 'on_budget';
  return v.isPositive() ? 'favourable' : 'unfavourable';
};

/** "Rs 4,000.00 under budget", "Rs 1,200.00 above target", "On budget". */
export const varianceLabel = (
  row: Pick<VsActualRow, 'accountType' | 'budgeted' | 'actual'>,
  format: (n: number) => string,
): string => {
  const v = favourableVariance(row);
  if (v.isZero()) return 'On budget';
  const amount = format(v.abs().toNumber());
  if (isRevenueType(row.accountType)) {
    return v.isPositive() ? `${amount} above target` : `${amount} below target`;
  }
  return v.isPositive() ? `${amount} under budget` : `${amount} over budget`;
};

// ─── Form ───────────────────────────────────────────────

export interface BudgetLineDraft {
  key: string;
  accountId: string;
  /** Twelve month amounts as typed; the annual figure is their sum. */
  months: string[];
}

export interface BudgetForm {
  name: string;
  fiscalYear: string;
  status: BudgetStatus;
  lines: BudgetLineDraft[];
}

let seq = 0;
const nextKey = () => `bl-${++seq}`;

export const newBudgetLine = (accountId = '', months: MoneyInput[] = []): BudgetLineDraft => ({
  key: nextKey(),
  accountId,
  months: Array.from({ length: 12 }, (_, i) => {
    const v = months[i];
    return v === undefined || v === null || toDecimal(v).isZero() ? '' : toDecimal(v).toString();
  }),
});

export const emptyBudgetForm = (fiscalYear: number): BudgetForm => ({
  name: '',
  fiscalYear: String(fiscalYear),
  status: 'draft',
  lines: [newBudgetLine()],
});

export const budgetToForm = (b: Budget): BudgetForm => ({
  name: b.name,
  fiscalYear: String(b.fiscalYear),
  status: b.status,
  lines: b.lines.length
    ? b.lines.map((l) => newBudgetLine(l.accountId, l.monthlyAmounts))
    : [newBudgetLine()],
});

const MONEY = /^\d+(\.\d{1,2})?$/;
const clean = (v: string) => v.replace(/[,\s]/g, '');

/** A month cell's value, or 0 when blank or unparseable (validation flags those). */
const cellValue = (v: string): Decimal => (MONEY.test(clean(v)) ? toDecimal(clean(v)) : new Decimal(0));

export const lineAnnual = (line: Pick<BudgetLineDraft, 'months'>): Decimal =>
  line.months.reduce((s, v) => s.plus(cellValue(v)), new Decimal(0));

/** Replace a line's months with an even spread of an annual figure. */
export const spreadAnnual = (line: BudgetLineDraft, annual: string): BudgetLineDraft => ({
  ...line,
  months: MONEY.test(clean(annual))
    ? evenSpread(clean(annual)).map((v) => (v === 0 ? '' : String(v)))
    : line.months,
});

export const formTotal = (form: Pick<BudgetForm, 'lines'>): Decimal =>
  form.lines.reduce((s, l) => s.plus(lineAnnual(l)), new Decimal(0));

export interface BudgetErrors {
  name?: string;
  fiscalYear?: string;
  lines?: string;
  line: Record<string, string>;
}

export const hasBudgetErrors = (e: BudgetErrors): boolean =>
  !!e.name || !!e.fiscalYear || !!e.lines || Object.keys(e.line).length > 0;

export const validateBudget = (form: BudgetForm): BudgetErrors => {
  const e: BudgetErrors = { line: {} };
  if (!form.name.trim()) e.name = 'Name the budget.';
  const year = Number(form.fiscalYear);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) e.fiscalYear = 'Enter a year like 2026.';

  const filled = form.lines.filter((l) => l.accountId);
  if (filled.length === 0) e.lines = 'Add at least one account.';

  const seen = new Set<string>();
  for (const l of form.lines) {
    if (!l.accountId) continue;
    if (seen.has(l.accountId)) {
      e.line[l.key] = 'This account is already in the budget.';
      continue;
    }
    seen.add(l.accountId);
    if (l.months.some((m) => m.trim() !== '' && !MONEY.test(clean(m)))) {
      e.line[l.key] = 'Months take amounts of 0 or more, up to 2 decimals.';
    } else if (!lineAnnual(l).greaterThan(0)) {
      e.line[l.key] = 'Enter an amount for at least one month.';
    }
  }
  return e;
};

/** CreateBudgetDto: twelve numbers per line, only lines with an account. */
export const budgetPayload = (form: BudgetForm) => ({
  name: form.name.trim(),
  fiscalYear: Number(form.fiscalYear),
  status: form.status,
  lines: form.lines
    .filter((l) => l.accountId)
    .map((l) => ({
      accountId: l.accountId,
      monthlyAmounts: l.months.map((m) => cellValue(m).toNumber()),
    })),
});
