// ═══════════════════════════════════════════════════════
// FinMatrix Web — Report serializers
// ═══════════════════════════════════════════════════════
// One mapper per report. Two jobs, both of which the app's equivalents skip —
// its nine report serializers are one-line `unwrapEnvelope` passthroughs:
//
//   1. COERCE EVERY AMOUNT through `toNumber`. The backend passes each figure
//      through its own `r2()` so they arrive as JSON numbers today. But the
//      columns behind them are Postgres `numeric`, and if any query ever returns
//      one unwrapped the statement renders `Rs NaN` with no error anywhere — a
//      silent failure on a page whose whole job is to be trusted.
//   2. DEFAULT EVERY COLLECTION to `[]`. A missing section should render as an
//      empty section, not crash the page on `.map` of undefined.
//
// The envelope is already handled upstream: `unwrapEnvelope` in apiHelpers
// documents that these report endpoints are unenveloped while /reports/dashboard
// and /reports/analytics-dashboard are, and its fallback covers both.

import type { StatementLine } from '@/models/reportStatement';
import { asRaw, str } from '@/serializers/documentLines';
import { assessmentSerializer, kpiOrNumber, type Kpi, type KpiAssessment } from '@/serializers/kpiSerializer';
import { toNumber } from '@/utils/money';

const lines = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** `{accountCode, accountName, amount}` — the shape every statement section uses. */
const mapStatementLine = (raw: unknown): StatementLine => {
  const r = asRaw(raw);
  return {
    accountCode: str(r.accountCode),
    accountName: str(r.accountName),
    amount: toNumber(r.amount as never),
  };
};

export interface ReportRangeMeta {
  startDate: string;
  endDate: string;
}

const mapRange = (raw: unknown): ReportRangeMeta => {
  const r = asRaw(raw);
  return { startDate: str(r.startDate), endDate: str(r.endDate) };
};

// ═══════════════════════════════════════════════════════
// Profit & Loss
// ═══════════════════════════════════════════════════════

export interface ProfitLossReport {
  range: ReportRangeMeta;
  /** All revenue, operating and not. */
  revenue: number;
  cogs: number;
  grossProfit: number;
  /** ALL non-COGS expense, including non-operating. */
  expenses: number;
  netIncome: number;

  income: StatementLine[];
  cogsLines: StatementLine[];
  expenseLines: StatementLine[];
  otherIncome: StatementLine[];
  otherExpense: StatementLine[];

  /** Operating only — excludes `otherIncome` / `otherExpense`. */
  totalIncome: number;
  totalCogs: number;
  totalExpenses: number;
  netOperatingIncome: number;
  netOtherIncome: number;
}

export const profitLossSerializer = (payload: unknown): ProfitLossReport => {
  const r = asRaw(payload);
  return {
    range: mapRange(r.range),
    revenue: toNumber(r.revenue as never),
    cogs: toNumber(r.cogs as never),
    grossProfit: toNumber(r.grossProfit as never),
    expenses: toNumber(r.expenses as never),
    netIncome: toNumber(r.netIncome as never),

    income: lines(r.income).map(mapStatementLine),
    cogsLines: lines(r.cogsLines).map(mapStatementLine),
    expenseLines: lines(r.expenseLines).map(mapStatementLine),
    otherIncome: lines(r.otherIncome).map(mapStatementLine),
    otherExpense: lines(r.otherExpense).map(mapStatementLine),

    totalIncome: toNumber(r.totalIncome as never),
    totalCogs: toNumber(r.totalCogs as never),
    totalExpenses: toNumber(r.totalExpenses as never),
    netOperatingIncome: toNumber(r.netOperatingIncome as never),
    netOtherIncome: toNumber(r.netOtherIncome as never),
  };
};

// ═══════════════════════════════════════════════════════
// Balance Sheet
// ═══════════════════════════════════════════════════════

/**
 * One account line in a v2 balance-sheet section. Every comparison figure is
 * the server's — `change` and `changePct` are not recomputed here.
 */
export interface BalanceSheetLine extends StatementLine {
  subType: string;
  /** Null when the report is not comparing. */
  priorAmount: number | null;
  change: number | null;
  /** Null when the prior figure is zero — a percentage of nothing says nothing. */
  changePct: number | null;
  pctOfTotalAssets: number | null;
  /**
   * Set on a computed line that no account holds: 'retainedEarnings' (when no
   * 3100 exists) or 'currentYearEarnings'. A synthetic line never carries a
   * real account code.
   */
  synthetic: string | null;
  /** On 3100 Retained Earnings: the posted balance plus prior years' earnings. */
  composite: { postedBalance: number; priorYearsEarnings: number } | null;
}

export interface BalanceSheetSection {
  /** cashAndBank | receivables | inventory | otherCurrentAssets | fixedAssets |
   *  currentLiabilities | longTermLiabilities | equity — or, from a server that
   *  predates sections, assets | liabilities | equity. */
  key: string;
  label: string;
  lines: BalanceSheetLine[];
  subtotal: number;
  priorSubtotal: number | null;
  /** The server's movement in the subtotal; null without a comparison. */
  change: number | null;
  changePct: number | null;
  pctOfTotalAssets: number | null;
}

/** A total the statement prints that spans sections (Total Current Assets …). */
export interface BalanceSheetTotal {
  key: BalanceSheetTotalKey;
  label: string;
  amount: number;
  prior: number | null;
  change: number | null;
  changePct: number | null;
  pctOfTotalAssets: number | null;
}

export type BalanceSheetTotalKey =
  | 'currentAssets'
  | 'totalAssets'
  | 'currentLiabilities'
  | 'totalLiabilities'
  | 'totalEquity'
  | 'totalLiabilitiesAndEquity';

export interface BalanceSheetReport {
  asOfDate: string;
  /** Flat, as the API has always sent them. Kept for shipped consumers. */
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  /**
   * The server's verdict, taken on UNROUNDED figures before presentation
   * rounding. Trusted rather than recomputed: re-testing the three rounded
   * totals is how a ledger that ties exactly comes to report a paisa gap.
   */
  isBalanced: boolean;

  /**
   * Grouped by the server (reports v2). From an older server this is the three
   * flat lists as three sections, so the page has one shape to draw.
   */
  sections: BalanceSheetSection[];
  /** Whether `sections` came from the server rather than from the flat lists. */
  grouped: boolean;
  /** Keyed totals; a key is absent when the server did not send that figure. */
  totals: Partial<Record<BalanceSheetTotalKey, BalanceSheetTotal>>;
  comparison: {
    asOfDate: string;
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
  } | null;
  /** The first day of the fiscal year `asOfDate` falls in, or '' if not sent. */
  fiscalYearStart: string;
  /** Assets − (Liabilities + Equity), raw then rounded; 0 when balanced. Null from an older server. */
  gap: number | null;
}

const TOTAL_LABELS: Record<BalanceSheetTotalKey, string> = {
  currentAssets: 'Total Current Assets',
  totalAssets: 'TOTAL ASSETS',
  currentLiabilities: 'Total Current Liabilities',
  totalLiabilities: 'Total Liabilities',
  totalEquity: 'Total Equity',
  totalLiabilitiesAndEquity: 'TOTAL LIABILITIES AND EQUITY',
};

const TOTAL_ALIASES: Record<string, BalanceSheetTotalKey> = {
  currentAssets: 'currentAssets',
  totalCurrentAssets: 'currentAssets',
  totalAssets: 'totalAssets',
  assets: 'totalAssets',
  currentLiabilities: 'currentLiabilities',
  totalCurrentLiabilities: 'currentLiabilities',
  totalLiabilities: 'totalLiabilities',
  liabilities: 'totalLiabilities',
  totalEquity: 'totalEquity',
  equity: 'totalEquity',
  totalLiabilitiesAndEquity: 'totalLiabilitiesAndEquity',
  liabilitiesAndEquity: 'totalLiabilitiesAndEquity',
};

const mapBalanceSheetLine = (raw: unknown): BalanceSheetLine => {
  const r = asRaw(raw);
  const composite = r.composite ? asRaw(r.composite) : null;
  return {
    ...mapStatementLine(raw),
    subType: str(r.subType),
    priorAmount: numberOrNull(r.priorAmount),
    change: numberOrNull(r.change),
    changePct: numberOrNull(r.changePct),
    pctOfTotalAssets: numberOrNull(r.pctOfTotalAssets),
    synthetic: r.synthetic ? str(r.synthetic) : null,
    composite: composite
      ? {
          postedBalance: toNumber(composite.postedBalance as never),
          priorYearsEarnings: toNumber(composite.priorYearsEarnings as never),
        }
      : null,
  };
};

/**
 * The subtotals that span sections. The contract names them without fixing a
 * shape, so an array of `{ key, amount, priorAmount }`, a keyed map of numbers
 * or objects, and flat `totalCurrentAssets`-style fields are all read.
 */
const mapBalanceSheetTotals = (
  r: Record<string, unknown>,
  comparison: BalanceSheetReport['comparison'],
): BalanceSheetReport['totals'] => {
  const out: BalanceSheetReport['totals'] = {};
  const put = (rawKey: string, value: unknown) => {
    const key = TOTAL_ALIASES[rawKey];
    if (!key || out[key]) return;
    if (value && typeof value === 'object') {
      const v = asRaw(value);
      out[key] = {
        key,
        label: str(v.label, TOTAL_LABELS[key]),
        amount: toNumber((v.amount ?? v.value ?? v.subtotal) as never),
        prior: numberOrNull(v.priorAmount ?? v.prior ?? v.priorSubtotal),
        change: numberOrNull(v.change),
        changePct: numberOrNull(v.changePct),
        pctOfTotalAssets: numberOrNull(v.pctOfTotalAssets ?? v.subtotalPctOfTotalAssets),
      };
    } else if (value !== undefined && value !== null) {
      out[key] = { key, label: TOTAL_LABELS[key], amount: toNumber(value as never), prior: null, change: null, changePct: null, pctOfTotalAssets: null };
    }
  };

  const source = r.subtotals ?? r.totals;
  if (Array.isArray(source)) {
    for (const item of source) put(str(asRaw(item).key), item);
  } else if (source && typeof source === 'object') {
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) put(key, value);
  }
  for (const flat of ['totalCurrentAssets', 'totalCurrentLiabilities', 'totalLiabilitiesAndEquity'] as const) {
    put(flat, r[flat]);
  }

  // The three totals every version of the API sends, with their prior figure
  // from `comparison` when the server's subtotal block did not carry one.
  const ensure = (key: BalanceSheetTotalKey, amount: unknown, prior: number | null) => {
    if (!out[key] && amount !== undefined && amount !== null) {
      out[key] = { key, label: TOTAL_LABELS[key], amount: toNumber(amount as never), prior, change: null, changePct: null, pctOfTotalAssets: null };
    } else if (out[key] && out[key]!.prior === null && prior !== null) {
      out[key] = { ...out[key]!, prior };
    }
  };
  ensure('totalAssets', r.totalAssets, comparison?.totalAssets ?? null);
  ensure('totalLiabilities', r.totalLiabilities, comparison?.totalLiabilities ?? null);
  ensure('totalEquity', r.totalEquity, comparison?.totalEquity ?? null);

  // The bottom line of the right-hand side. Read from the server when sent; a
  // server that predates it sends the two halves, and they are carried down
  // as one figure — the same derivation `partySummarySerializer` makes for an
  // absent `netDue`, and the only total on the statement not read verbatim.
  if (!out.totalLiabilitiesAndEquity && out.totalLiabilities && out.totalEquity) {
    const sum = (a: number, b: number) => Math.round((a + b) * 100) / 100;
    out.totalLiabilitiesAndEquity = {
      key: 'totalLiabilitiesAndEquity',
      label: TOTAL_LABELS.totalLiabilitiesAndEquity,
      amount: sum(out.totalLiabilities.amount, out.totalEquity.amount),
      prior:
        out.totalLiabilities.prior !== null && out.totalEquity.prior !== null
          ? sum(out.totalLiabilities.prior, out.totalEquity.prior)
          : null,
      change: null,
      changePct: null,
      pctOfTotalAssets: null,
    };
  }
  return out;
};

export const balanceSheetSerializer = (payload: unknown): BalanceSheetReport => {
  const r = asRaw(payload);
  const assets = lines(r.assets).map(mapStatementLine);
  const liabilities = lines(r.liabilities).map(mapStatementLine);
  const equity = lines(r.equity).map(mapStatementLine);
  const totalAssets = toNumber(r.totalAssets as never);
  const totalLiabilities = toNumber(r.totalLiabilities as never);
  const totalEquity = toNumber(r.totalEquity as never);

  const cmp = r.comparison ? asRaw(r.comparison) : null;
  const comparison = cmp
    ? {
        asOfDate: str(cmp.asOfDate),
        totalAssets: toNumber(cmp.totalAssets as never),
        totalLiabilities: toNumber(cmp.totalLiabilities as never),
        totalEquity: toNumber(cmp.totalEquity as never),
      }
    : null;

  const rawSections = lines(r.sections);
  const grouped = rawSections.length > 0;
  const legacy = (key: string, label: string, src: StatementLine[], subtotal: number): BalanceSheetSection => ({
    key,
    label,
    lines: src.map((line) => mapBalanceSheetLine(line)),
    subtotal,
    priorSubtotal: null,
    change: null,
    changePct: null,
    pctOfTotalAssets: null,
  });

  return {
    asOfDate: str(r.asOfDate),
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    // Defaults to TRUE when absent. A missing flag is an old or partial payload,
    // not evidence of an imbalance, and crying "out of balance" at a business
    // whose books are fine sends someone hunting an error nobody posted.
    isBalanced: r.isBalanced === undefined ? true : Boolean(r.isBalanced),
    grouped,
    sections: grouped
      ? rawSections.map((raw) => {
          const s = asRaw(raw);
          return {
            key: str(s.key),
            label: str(s.label),
            lines: lines(s.lines).map(mapBalanceSheetLine),
            subtotal: toNumber(s.subtotal as never),
            priorSubtotal: numberOrNull(s.priorSubtotal),
            change: numberOrNull(s.change),
            changePct: numberOrNull(s.changePct),
            // The contract names it `subtotalPctOfTotalAssets`.
            pctOfTotalAssets: numberOrNull(s.subtotalPctOfTotalAssets ?? s.pctOfTotalAssets),
          };
        })
      : // No grouping on this side: an older server's three flat lists, each
        // under its own heading, totalled by the server's own figure.
        [
          legacy('assets', 'Assets', assets, totalAssets),
          legacy('liabilities', 'Liabilities', liabilities, totalLiabilities),
          legacy('equity', 'Equity', equity, totalEquity),
        ],
    totals: mapBalanceSheetTotals(r, comparison),
    comparison,
    fiscalYearStart: str(r.fiscalYearStart),
    gap: numberOrNull(r.gap),
  };
};

// ═══════════════════════════════════════════════════════
// Trial Balance
// ═══════════════════════════════════════════════════════

/**
 * closing — where each account stands at the end date (balance-sheet accounts
 *   cumulative, P&L accounts fiscal-year-to-date); the trial balance an
 *   accountant means.
 * working — opening, the period's movement and closing side by side.
 * movement — what moved inside the range; the server's default and the only
 *   mode an older server knows.
 */
export type TrialBalanceMode = 'closing' | 'working' | 'movement';

export interface DebitCredit {
  debit: number;
  credit: number;
}

/** A column pair's totals, with the server's verdict taken on raw figures. */
export interface TrialBalanceColumnTotals extends DebitCredit {
  isBalanced: boolean;
}

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  /** The row's figure in this mode: closing in closing/working, movement in movement. */
  debit: number;
  credit: number;
  /** asset | liability | equity | revenue | expense — '' from an older server. */
  accountType: string;
  subType: string;
  group: string;
  /** 'abnormal_balance' | 'contra_assumed' | 'obe_nonzero' … */
  flags: string[];
  /** The computed prior-years retained-earnings row in closing mode. */
  synthetic: boolean;
  /** Working mode only. */
  opening: DebitCredit | null;
  period: DebitCredit | null;
  closing: DebitCredit | null;
}

/** A type group's subtotals (contract gap G2 — absent until the server sends it). */
export interface TrialBalanceGroup {
  key: string;
  label: string;
  main: DebitCredit;
  opening: DebitCredit | null;
  period: DebitCredit | null;
  closing: DebitCredit | null;
}

export interface TrialBalanceReport {
  /** The mode the server answered in; 'movement' from a server without modes. */
  mode: TrialBalanceMode;
  range: ReportRangeMeta;
  rows: TrialBalanceRow[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  /** Per column pair in working mode; null where the server sent none. */
  columnTotals: {
    opening: TrialBalanceColumnTotals | null;
    period: TrialBalanceColumnTotals | null;
    closing: TrialBalanceColumnTotals | null;
  };
  groups: TrialBalanceGroup[];
  /** e.g. the range crosses a fiscal-year boundary. Null when there is nothing to say. */
  warning: string | null;
  fiscalYearStart: string;
}

const pairOrNull = (r: Record<string, unknown>, prefix: string): DebitCredit | null => {
  // `{ opening: { debit, credit } }` or flat `openingDebit` / `openingCredit`.
  const nested = r[prefix];
  if (nested && typeof nested === 'object') {
    const n = asRaw(nested);
    return { debit: toNumber(n.debit as never), credit: toNumber(n.credit as never) };
  }
  const dr = r[`${prefix}Debit`];
  const cr = r[`${prefix}Credit`];
  if (dr === undefined && cr === undefined) return null;
  return { debit: toNumber(dr as never), credit: toNumber(cr as never) };
};

const columnTotalsOrNull = (raw: unknown): TrialBalanceColumnTotals | null => {
  if (!raw || typeof raw !== 'object') return null;
  const t = asRaw(raw);
  return {
    debit: toNumber((t.debit ?? t.debits) as never),
    credit: toNumber((t.credit ?? t.credits) as never),
    isBalanced: t.isBalanced === undefined ? true : Boolean(t.isBalanced),
  };
};

const TB_MODES: TrialBalanceMode[] = ['closing', 'working', 'movement'];

export const trialBalanceSerializer = (payload: unknown): TrialBalanceReport => {
  const r = asRaw(payload);
  const mode = TB_MODES.includes(str(r.mode) as TrialBalanceMode)
    ? (str(r.mode) as TrialBalanceMode)
    : 'movement';
  const totalDebits = toNumber(r.totalDebits as never);
  const totalCredits = toNumber(r.totalCredits as never);
  const isBalanced = r.isBalanced === undefined ? true : Boolean(r.isBalanced);
  const main: TrialBalanceColumnTotals = { debit: totalDebits, credit: totalCredits, isBalanced };

  // Per column pair, nested (`{ opening: { debit, credit } }`) or flat
  // (`{ openingDebit, openingCredit }`, with the verdicts in `balanced`) —
  // the contract sends the flat form.
  const totals = asRaw(r.columnTotals ?? r.totals);
  const verdicts = asRaw(r.balanced);
  const pairTotals = (prefix: 'opening' | 'period' | 'closing'): TrialBalanceColumnTotals | null => {
    const nested = columnTotalsOrNull(totals[prefix]);
    if (nested) return nested;
    const flat = pairOrNull(totals, prefix);
    if (!flat) return null;
    const verdict = verdicts[prefix];
    return { ...flat, isBalanced: verdict === undefined ? true : Boolean(verdict) };
  };
  const columnTotals = {
    opening: pairTotals('opening'),
    period: pairTotals('period'),
    closing: pairTotals('closing'),
  };
  // The headline pair is the mode's own column; fill it from the flat totals
  // every version sends so a page never has to ask which one it got.
  if (mode === 'movement' && !columnTotals.period) columnTotals.period = main;
  if (mode !== 'movement' && !columnTotals.closing) columnTotals.closing = main;

  return {
    mode,
    range: mapRange(r.range),
    rows: lines(r.rows).map((raw) => {
      const row = asRaw(raw);
      return {
        accountCode: str(row.accountCode),
        accountName: str(row.accountName),
        debit: toNumber(row.debit as never),
        credit: toNumber(row.credit as never),
        accountType: str(row.accountType),
        subType: str(row.subType),
        group: str(row.group),
        flags: lines(row.flags).map((f) => str(f)).filter(Boolean),
        synthetic: Boolean(row.synthetic),
        opening: pairOrNull(row, 'opening'),
        period: pairOrNull(row, 'period'),
        closing: pairOrNull(row, 'closing'),
      };
    }),
    totalDebits,
    totalCredits,
    isBalanced,
    columnTotals,
    groups: lines(r.groups).map((raw) => {
      const g = asRaw(raw);
      return {
        key: str(g.key),
        label: str(g.label),
        main: { debit: toNumber(g.debit as never), credit: toNumber(g.credit as never) },
        opening: pairOrNull(g, 'opening'),
        period: pairOrNull(g, 'period'),
        closing: pairOrNull(g, 'closing'),
      };
    }),
    // `warnings: [{ code, message }]` in the contract; a bare `warning` string is read too.
    warning: r.warning
      ? str(r.warning)
      : lines(r.warnings)
          .map((w) => (typeof w === 'string' ? w : str(asRaw(w).message)))
          .filter(Boolean)
          .join(' ') || null,
    fiscalYearStart: str(r.fiscalYearStart),
  };
};

// ═══════════════════════════════════════════════════════
// Cash Flow
// ═══════════════════════════════════════════════════════

export interface CashFlowLine {
  /** A server-supplied description; these rows carry no account code. */
  label: string;
  amount: number;
  /**
   * A stable slug — op.customers, inv.fixed_assets, fin.loans … — that opens
   * the cash rows classified into this line. Null from an older server, and on
   * indirect adjustments until the server keys them (contract gap G7).
   */
  lineKey: string | null;
  section: string | null;
}

export interface CashFlowSection {
  lines: CashFlowLine[];
  total: number;
}

/** One cash or bank account's movement over the period. */
export interface CashFlowAccount {
  accountCode: string;
  accountName: string;
  beginning: number;
  ending: number;
}

/** One month of cash movement (contract gap G1 — absent until the server sends it). */
export interface CashFlowMonth {
  period: string;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
  endingCash: number;
}

export interface CashFlowReport {
  range: ReportRangeMeta;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  netChange: number;
  beginningCash: number;
  endingCash: number;
  /**
   * Net cash movement per month, zero-filled (reports v2). `endingCash` is the
   * Cash + Bank held at the month's end — null from an older server.
   */
  monthlyTrend: { label: string; value: number; endingCash: number | null }[];
  /** The server's own tie of ending cash to the balance sheet (reports v2). */
  cashTie: { endingCash: number; balanceSheetCash: number; ties: boolean } | null;
  /**
   * The indirect reconciliation — net income adjusted for non-cash items. Its
   * `total` always equals `operating.total`. Optional: older deployments omit it.
   */
  operatingIndirect: {
    netIncome: number;
    adjustments: CashFlowLine[];
    total: number;
    /**
     * Non-cash transactions kept OUT of the working-capital lines (IAS 7.43) —
     * opening balances, capex bought on credit — with the effect each would
     * have had. Empty from an older server.
     */
    excludedNonCash: CashFlowLine[];
  } | null;
  /** Per Cash/Bank account; Σ ending = endingCash. Empty from an older server. */
  accounts: CashFlowAccount[];
  monthly: CashFlowMonth[];
}

const mapCashFlowLine = (raw: unknown): CashFlowLine => {
  const r = asRaw(raw);
  return {
    label: str(r.label),
    amount: toNumber(r.amount as never),
    lineKey: r.lineKey ? str(r.lineKey) : null,
    section: r.section ? str(r.section) : null,
  };
};

const mapCashFlowSection = (raw: unknown): CashFlowSection => {
  const r = asRaw(raw);
  return {
    lines: lines(r.lines).map(mapCashFlowLine),
    total: toNumber(r.total as never),
  };
};

export const cashFlowSerializer = (payload: unknown): CashFlowReport => {
  const r = asRaw(payload);
  const indirect = r.operatingIndirect ? asRaw(r.operatingIndirect) : null;

  return {
    range: mapRange(r.range),
    operating: mapCashFlowSection(r.operating),
    investing: mapCashFlowSection(r.investing),
    financing: mapCashFlowSection(r.financing),
    netChange: toNumber(r.netChange as never),
    beginningCash: toNumber(r.beginningCash as never),
    endingCash: toNumber(r.endingCash as never),
    monthlyTrend: lines(r.monthlyTrend).map((raw) => {
      const point = asRaw(raw);
      return {
        label: str(point.label),
        value: toNumber(point.value as never),
        endingCash: numberOrNull(point.endingCash),
      };
    }),
    cashTie: r.cashTie
      ? {
          endingCash: toNumber(asRaw(r.cashTie).endingCash as never),
          balanceSheetCash: toNumber(asRaw(r.cashTie).balanceSheetCash as never),
          ties: Boolean(asRaw(r.cashTie).ties),
        }
      : null,
    operatingIndirect: indirect
      ? {
          netIncome: toNumber(indirect.netIncome as never),
          adjustments: lines(indirect.adjustments).map(mapCashFlowLine),
          total: toNumber(indirect.total as never),
          excludedNonCash: lines(indirect.excludedNonCash).map(mapCashFlowLine),
        }
      : null,
    accounts: lines(r.accounts).map((raw) => {
      const a = asRaw(raw);
      return {
        accountCode: str(a.accountCode),
        accountName: str(a.accountName),
        beginning: toNumber(a.beginning as never),
        ending: toNumber(a.ending as never),
      };
    }),
    monthly: lines(r.monthly).map((raw) => {
      const m = asRaw(raw);
      return {
        period: str(m.period ?? m.month),
        label: str(m.label),
        inflow: toNumber(m.inflow as never),
        outflow: toNumber(m.outflow as never),
        net: toNumber(m.net as never),
        endingCash: toNumber(m.endingCash as never),
      };
    }),
  };
};

// ═══════════════════════════════════════════════════════
// General Ledger
// ═══════════════════════════════════════════════════════

export interface LedgerEntry {
  /** Posting date. A DATE column — it carries no time. */
  date: string;
  /** When the entry was recorded. This is the audit-trail timestamp. */
  postedAt: string;
  reference: string;
  accountCode: string;
  accountName: string;
  memo: string;
  debit: number;
  credit: number;
  /** The server's running balance per account, debit-positive. Never recomputed. */
  balance: number;
  sourceType: string;
  /** The journal entry behind the row — what the drill-through links to. */
  sourceId: string;
  /**
   * A manual journal that was posted and later voided. It stays in the ledger
   * beside the reversal that cancels it, as it does in the trial balance.
   */
  voided: boolean;
}

export interface LedgerAccountBalance {
  accountCode: string;
  accountName: string;
  /** Debit-positive, like the running balance. */
  balance: number;
}

export interface GeneralLedgerReport {
  range: ReportRangeMeta;
  /** The account filter in force, or null for every account. */
  accountCode: string | null;
  /** **Oldest first.** The running balance depends on that order. */
  entries: LedgerEntry[];
  /** Balance brought forward into the period, per account in view. */
  openingBalances: LedgerAccountBalance[];
  /** Balance at the end of the period, per account in view. */
  closingBalances: LedgerAccountBalance[];
  totals: { debit: number; credit: number };
}

const mapAccountBalances = (value: unknown): LedgerAccountBalance[] =>
  lines(value).map((raw) => {
    const b = asRaw(raw);
    return {
      accountCode: str(b.accountCode),
      accountName: str(b.accountName),
      balance: toNumber(b.balance as never),
    };
  });

export const generalLedgerSerializer = (payload: unknown): GeneralLedgerReport => {
  const r = asRaw(payload);
  const totals = asRaw(r.totals);
  return {
    range: mapRange(r.range),
    accountCode: r.accountCode ? str(r.accountCode) : null,
    entries: lines(r.entries).map((raw) => {
      const e = asRaw(raw);
      return {
        date: str(e.date),
        postedAt: str(e.postedAt),
        reference: str(e.reference),
        accountCode: str(e.accountCode),
        accountName: str(e.accountName),
        memo: str(e.memo),
        debit: toNumber(e.debit as never),
        credit: toNumber(e.credit as never),
        balance: toNumber(e.balance as never),
        sourceType: str(e.sourceType),
        sourceId: str(e.sourceId),
        voided: e.voided === true,
      };
    }),
    openingBalances: mapAccountBalances(r.openingBalances),
    closingBalances: mapAccountBalances(r.closingBalances),
    totals: {
      debit: toNumber(totals.debit as never),
      credit: toNumber(totals.credit as never),
    },
  };
};

export interface LedgerAccountSummary {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  balance: number;
  /** A COUNT of entries, not a list. */
  entries: number;
}

export interface LedgerAccountsReport {
  range: ReportRangeMeta;
  accounts: LedgerAccountSummary[];
}

export const ledgerAccountsSerializer = (payload: unknown): LedgerAccountsReport => {
  const r = asRaw(payload);
  return {
    range: mapRange(r.range),
    accounts: lines(r.accounts).map((raw) => {
      const a = asRaw(raw);
      return {
        accountCode: str(a.accountCode),
        accountName: str(a.accountName),
        debit: toNumber(a.debit as never),
        credit: toNumber(a.credit as never),
        balance: toNumber(a.balance as never),
        entries: toNumber(a.entries as never),
      };
    }),
  };
};

// ═══════════════════════════════════════════════════════
// General Ledger — by customer or vendor
// ═══════════════════════════════════════════════════════
// The same ledger read by party: a customer's postings on 1100 Accounts
// Receivable and 2400 Customer Advances, a vendor's on 2000 Accounts Payable,
// each linked to the customer or vendor through the document that posted it.
// `GET /ledger?party=customer|vendor[&partyId=]` answers in the account view's
// shape, with the document and party on every line.

export type LedgerPartyType = 'customer' | 'vendor';

export interface PartyLedgerEntry extends LedgerEntry {
  /** The posting's own kind — `invoice`, `invoice_void`, `payment`, `bill`… */
  postingType: string;
  /** What the line is, in words: "Invoice", "Receipt", "Bill voided". */
  label: string;
  /** The document behind it, when it still exists. */
  documentType: string | null;
  documentId: string | null;
  documentNumber: string;
  partyId: string;
  partyCode: string;
  partyName: string;
}

export interface PartyLedgerBalance {
  partyId: string;
  partyCode: string;
  partyName: string;
  /** Debit-positive, like the running balance. */
  balance: number;
}

export interface PartyLedgerReport {
  range: ReportRangeMeta;
  party: { type: LedgerPartyType; id: string | null; code: string; name: string };
  /** **Oldest first.** The running balance per party depends on that order. */
  entries: PartyLedgerEntry[];
  openingBalances: PartyLedgerBalance[];
  closingBalances: PartyLedgerBalance[];
  totals: { debit: number; credit: number };
  /**
   * With every party in view: the control accounts' balance at the end of the
   * period, what belongs to a party, and what does not (a journal posted
   * straight to the account). Null for one party.
   */
  control: {
    accounts: { code: string; name: string }[];
    balance: number;
    linked: number;
    unlinked: number;
  } | null;
}

const mapPartyBalances = (value: unknown): PartyLedgerBalance[] =>
  lines(value).map((raw) => {
    const b = asRaw(raw);
    return {
      partyId: str(b.partyId),
      partyCode: str(b.partyCode),
      partyName: str(b.partyName),
      balance: toNumber(b.balance as never),
    };
  });

export const partyLedgerSerializer = (payload: unknown): PartyLedgerReport => {
  const r = asRaw(payload);
  const party = asRaw(r.party);
  const totals = asRaw(r.totals);
  const control = r.control ? asRaw(r.control) : null;
  return {
    range: mapRange(r.range),
    party: {
      type: str(party.type) === 'vendor' ? 'vendor' : 'customer',
      id: party.id ? str(party.id) : null,
      code: str(party.code),
      name: str(party.name),
    },
    entries: lines(r.entries).map((raw) => {
      const e = asRaw(raw);
      return {
        date: str(e.date),
        postedAt: str(e.postedAt),
        reference: str(e.reference),
        accountCode: str(e.accountCode),
        accountName: str(e.accountName),
        memo: str(e.memo),
        debit: toNumber(e.debit as never),
        credit: toNumber(e.credit as never),
        balance: toNumber(e.balance as never),
        sourceType: str(e.sourceType),
        sourceId: str(e.sourceId),
        voided: e.voided === true,
        postingType: str(e.postingType),
        label: str(e.label),
        documentType: e.documentType ? str(e.documentType) : null,
        documentId: e.documentId ? str(e.documentId) : null,
        documentNumber: str(e.documentNumber),
        partyId: str(e.partyId),
        partyCode: str(e.partyCode),
        partyName: str(e.partyName),
      };
    }),
    openingBalances: mapPartyBalances(r.openingBalances),
    closingBalances: mapPartyBalances(r.closingBalances),
    totals: {
      debit: toNumber(totals.debit as never),
      credit: toNumber(totals.credit as never),
    },
    control: control
      ? {
          accounts: lines(control.accounts).map((raw) => {
            const a = asRaw(raw);
            return { code: str(a.code), name: str(a.name) };
          }),
          balance: toNumber(control.balance as never),
          linked: toNumber(control.linked as never),
          unlinked: toNumber(control.unlinked as never),
        }
      : null,
  };
};

export interface LedgerPartySummary {
  partyId: string;
  partyCode: string;
  partyName: string;
  isActive: boolean;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  /** A COUNT of postings in the period, not a list. */
  entries: number;
}

export interface LedgerPartiesReport {
  range: ReportRangeMeta;
  parties: LedgerPartySummary[];
}

/** `GET /ledger/parties?type=` — every customer or vendor, for the ledger's picker. */
export const ledgerPartiesSerializer = (payload: unknown): LedgerPartiesReport => {
  const r = asRaw(payload);
  return {
    range: mapRange(r.range),
    parties: lines(r.parties).map((raw) => {
      const p = asRaw(raw);
      return {
        partyId: str(p.partyId),
        partyCode: str(p.partyCode),
        partyName: str(p.partyName),
        isActive: p.isActive !== false,
        opening: toNumber(p.opening as never),
        debit: toNumber(p.debit as never),
        credit: toNumber(p.credit as never),
        closing: toNumber(p.closing as never),
        entries: toNumber(p.entries as never),
      };
    }),
  };
};

// ═══════════════════════════════════════════════════════
// Aging (AR and AP share one shape)
// ═══════════════════════════════════════════════════════

/**
 * One aging column, as the server describes it.
 *
 * The bucket set is DATA now rather than five field names compiled into the
 * page, so a company trading on 3-day or weekly terms gets columns that match
 * how it actually sells. Render by walking `buckets` and reading
 * `row.amounts[bucket.key]` — never by naming a key.
 */
export interface AgingBucketDef {
  key: string;
  label: string;
  /** Inclusive days overdue; 0 on the not-yet-due bucket. */
  minDays: number;
  /** Inclusive; null on the open-ended final bucket. */
  maxDays: number | null;
}

export type AgingPresetKey =
  | 'days3'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'custom';

/**
 * The five fixed fields the report has always returned.
 *
 * The server still sends these and still computes them on 30/60/90 whatever
 * preset was requested, so the analytics A/R trend and anything else reading
 * them keeps working. Nothing new should: they cannot describe a weekly or
 * 3-day report.
 */
export interface AgingBuckets {
  current: number;
  bucket1to30: number;
  bucket31to60: number;
  bucket61to90: number;
  bucket90Plus: number;
  total: number;
}

export interface AgingRow extends AgingBuckets {
  /**
   * The counterparty's id. The server reuses the A/R field names for A/P, so on
   * the payables report this holds a VENDOR id — the page relabels it rather than
   * the serializer renaming a field the API owns.
   */
  customerId: string;
  customerName: string;
  /** Keyed by `AgingBucketDef.key`. */
  amounts: Record<string, number>;

  // ── reports v2 — absent (empty / null / false) from an older server ──
  /** The API's dialect (`net30`); map with `paymentTermsFromApi`. */
  paymentTerms: string;
  /** A/R only. Null when the customer has no limit. */
  creditLimit: number | null;
  overLimit: boolean;
  /** The balance as a share of the limit; null with no limit. */
  creditUsedPct: number | null;
  lastPaymentDate: string | null;
  lastPaymentAmount: number | null;
  oldestDueDate: string | null;
}

export interface AgingTotals extends AgingBuckets {
  amounts: Record<string, number>;
}

/** The v2 party facts as an older server leaves them: unknown, not zero. */
export const NO_AGING_PARTY_FACTS: Pick<
  AgingRow,
  'paymentTerms' | 'creditLimit' | 'overLimit' | 'creditUsedPct' | 'lastPaymentDate' | 'lastPaymentAmount' | 'oldestDueDate'
> = {
  paymentTerms: '',
  creditLimit: null,
  overLimit: false,
  creditUsedPct: null,
  lastPaymentDate: null,
  lastPaymentAmount: null,
  oldestDueDate: null,
};

/** One slice of what falls due, by due date from today. */
export interface AgingScheduleSlice {
  /** overdue | d0_7 | d8_14 | d15_30 | d31_60 | d60_plus */
  key: string;
  label: string;
  amount: number;
  count: number;
}

export interface AgingInsights {
  /** DSO on receivables, DPO on payables — a KPI object, formula and all. */
  days: Kpi | null;
  totalOpen: number;
  overdue: number;
  overduePct: number | null;
  /** Balance-weighted. */
  weightedAvgDaysOverdue: number | null;
  top5SharePct: number | null;
  /** Σ amount = totalOpen. */
  schedule: AgingScheduleSlice[];
  /**
   * Each ratio against its rule of thumb, from the server. On payables the
   * concentration is stated, never judged (neutral). Empty from an older server.
   */
  assessments: {
    overduePct: KpiAssessment | null;
    weightedAvgDaysOverdue: KpiAssessment | null;
    top5SharePct: KpiAssessment | null;
  };
}

export interface AgingReport {
  asOfDate: string;
  preset: AgingPresetKey;
  buckets: AgingBucketDef[];
  rows: AgingRow[];
  totals: AgingTotals;
  /** Null from a server that predates aging insights. */
  insights: AgingInsights | null;
}

/** The classic columns, for a response from a server that predates buckets[]. */
export const LEGACY_AGING_BUCKETS: AgingBucketDef[] = [
  { key: 'current', label: 'Current', minDays: 0, maxDays: 0 },
  { key: 'd1to30', label: '1\u201330', minDays: 1, maxDays: 30 },
  { key: 'd31to60', label: '31\u201360', minDays: 31, maxDays: 60 },
  { key: 'd61to90', label: '61\u201390', minDays: 61, maxDays: 90 },
  { key: 'd91plus', label: '91 and over', minDays: 91, maxDays: null },
];

const LEGACY_FIELD_BY_KEY: Record<string, keyof AgingBuckets> = {
  current: 'current',
  d1to30: 'bucket1to30',
  d31to60: 'bucket31to60',
  d61to90: 'bucket61to90',
  d91plus: 'bucket90Plus',
};

const mapBuckets = (raw: unknown): AgingBuckets => {
  const r = asRaw(raw);
  return {
    current: toNumber(r.current as never),
    bucket1to30: toNumber(r.bucket1to30 as never),
    bucket31to60: toNumber(r.bucket31to60 as never),
    bucket61to90: toNumber(r.bucket61to90 as never),
    bucket90Plus: toNumber(r.bucket90Plus as never),
    total: toNumber(r.total as never),
  };
};

/**
 * Normalise the aging payload so the page only ever sees one shape.
 *
 * A deployment that predates configurable buckets returns only the classic five
 * fields. Rather than render a table of blanks, such a response is rebuilt into
 * the 30/60/90 bucket set from the fields it does have — the same report the
 * page showed before, with the preset control simply having nothing to change.
 */
export const agingSerializer = (payload: unknown): AgingReport => {
  const r = asRaw(payload);
  const rawBuckets = lines(r.buckets);
  const modern = rawBuckets.length > 0;

  const buckets: AgingBucketDef[] = modern
    ? rawBuckets.map((b) => {
        const d = asRaw(b);
        return {
          key: str(d.key),
          label: str(d.label),
          minDays: toNumber(d.minDays as never),
          maxDays: d.maxDays === null || d.maxDays === undefined
            ? null
            : toNumber(d.maxDays as never),
        };
      })
    : LEGACY_AGING_BUCKETS;

  // Coercion applies to BOTH paths: these columns are Postgres `numeric` and an
  // unwrapped one arrives as a string, which formats fine and fails on
  // arithmetic.
  const amountsFor = (src: Record<string, unknown>): Record<string, number> => {
    const amounts = modern ? asRaw(src.amounts) : {};
    return Object.fromEntries(
      buckets.map((b) => [
        b.key,
        toNumber(
          (modern ? amounts[b.key] : src[LEGACY_FIELD_BY_KEY[b.key]]) as never,
        ),
      ]),
    );
  };

  const totalsRaw = asRaw(r.totals);
  const ins = r.insights ? asRaw(r.insights) : null;

  return {
    asOfDate: str(r.asOfDate),
    preset: (str(r.preset, 'monthly') as AgingPresetKey),
    buckets,
    rows: lines(r.rows).map((raw) => {
      const row = asRaw(raw);
      return {
        customerId: str(row.customerId),
        customerName: str(row.customerName, 'Unknown'),
        amounts: amountsFor(row),
        ...mapBuckets(row),
        paymentTerms: str(row.paymentTerms),
        // The contract sends 0 for a customer with no limit; a limit of nothing
        // is "no limit", not "everything is over it".
        creditLimit: numberOrNull(row.creditLimit) ? numberOrNull(row.creditLimit) : null,
        overLimit: Boolean(row.overLimit),
        creditUsedPct: numberOrNull(row.creditUsedPct),
        lastPaymentDate: row.lastPaymentDate ? str(row.lastPaymentDate) : null,
        lastPaymentAmount: numberOrNull(row.lastPaymentAmount),
        oldestDueDate: row.oldestDueDate ? str(row.oldestDueDate) : null,
      };
    }),
    totals: { amounts: amountsFor(totalsRaw), ...mapBuckets(r.totals) },
    insights: ins
      ? {
          // `dso` on A/R and `dpo` on A/P — whichever arrived.
          days:
            ins.dso !== undefined
              ? kpiOrNumber(ins.dso, 'dso', 'Days sales outstanding', 'days')
              : kpiOrNumber(ins.dpo, 'dpo', 'Days payables outstanding', 'days'),
          totalOpen: toNumber(ins.totalOpen as never),
          overdue: toNumber(ins.overdue as never),
          overduePct: numberOrNull(ins.overduePct),
          weightedAvgDaysOverdue: numberOrNull(ins.weightedAvgDaysOverdue),
          top5SharePct: numberOrNull(ins.top5SharePct),
          schedule: lines(ins.schedule).map((raw) => {
            const s = asRaw(raw);
            return {
              key: str(s.key),
              label: str(s.label),
              amount: toNumber(s.amount as never),
              count: toNumber(s.count as never),
            };
          }),
          assessments: {
            overduePct: assessmentSerializer(asRaw(ins.assessments).overduePct),
            weightedAvgDaysOverdue: assessmentSerializer(asRaw(ins.assessments).weightedAvgDaysOverdue),
            top5SharePct: assessmentSerializer(asRaw(ins.assessments).top5SharePct),
          },
        }
      : null,
  };
};

/**
 * What is genuinely late: everything past its due date.
 *
 * Derived from the bucket spec rather than hardcoded as "31 days and over".
 * That line was drawn for 30/60/90 buckets, where a bill a week late is chased
 * rather than provisioned for — but under a 3-day preset it would report nearly
 * a month of debt as current, which is the opposite of what the preset was
 * chosen to reveal. The caller decides the granularity; this follows it.
 */
export const overdueTotal = (report: AgingReport): number =>
  report.buckets
    .filter((b) => b.minDays > 0)
    .reduce((t, b) => t + (report.totals.amounts[b.key] ?? 0), 0);

/** What is in the not-yet-due column. */
export const notYetDueTotal = (report: AgingReport): number =>
  report.totals.amounts[report.buckets[0]?.key] ?? 0;

/**
 * Wrap the legacy five-field shape as AgingTotals on the classic buckets.
 *
 * The analytics dashboard's `arAgingTrend` is still built from those five
 * fields server-side and is not configurable — it is one fixed snapshot, not a
 * report anyone re-buckets. This lets it reuse AgingChart without the chart
 * needing to understand two shapes.
 */
export const legacyAgingTotals = (src: AgingBuckets): AgingTotals => ({
  ...src,
  amounts: Object.fromEntries(
    LEGACY_AGING_BUCKETS.map((b) => [b.key, src[LEGACY_FIELD_BY_KEY[b.key]] ?? 0]),
  ),
});

// ═══════════════════════════════════════════════════════
// Aging drill-down — one party's open documents
// ═══════════════════════════════════════════════════════

/** One open invoice or bill behind an aging row. */
export interface AgingPartyDocument {
  documentId: string;
  /** Drives which detail page the number links to. */
  documentType: 'invoice' | 'bill';
  documentNumber: string;
  issueDate: string;
  dueDate: string;
  /**
   * Signed: negative means not yet due. Sent that way so the panel can say
   * "due in 4 days" without recomputing a date the server already knows.
   */
  daysOverdue: number;
  bucketKey: string;
  bucketLabel: string;
  total: number;
  amountPaid: number;
  balance: number;
  status: string;
}

export interface AgingPartyDocuments {
  partyType: 'customer' | 'vendor';
  partyId: string;
  /**
   * The party's own name. The summary calls a vendor `customerName` for
   * back-compat with shipped clients; this endpoint is new and does not inherit
   * that, which is what lets one component serve both sides.
   */
  partyName: string;
  asOfDate: string;
  preset: AgingPresetKey;
  buckets: AgingBucketDef[];
  /** The bucket that was filtered on, or null for every open document. */
  bucket: string | null;
  /**
   * Money over every matching document, not just this page — the figure that
   * has to reconcile against the aging row.
   */
  outstandingTotal: number;
  documents: AgingPartyDocument[];
  /** Matching documents, which may exceed what one page returned. */
  total: number;
  page: number;
  limit: number;
}

/** One open invoice or bill, as both the drill-down and the party summary send it. */
const agingDocumentSerializer = (raw: unknown): AgingPartyDocument => {
  const d = asRaw(raw);
  return {
    documentId: str(d.documentId),
    documentType: str(d.documentType) === 'bill' ? 'bill' : 'invoice',
    documentNumber: str(d.documentNumber),
    issueDate: str(d.issueDate),
    dueDate: str(d.dueDate),
    // 0 is a real answer here (due today) and so is a negative one (not yet
    // due), so this must not be coerced through a falsy fallback.
    daysOverdue: toNumber(d.daysOverdue as never),
    bucketKey: str(d.bucketKey),
    bucketLabel: str(d.bucketLabel),
    // Postgres `numeric` arrives as a string, which formats fine and fails
    // on arithmetic.
    total: toNumber(d.total as never),
    amountPaid: toNumber(d.amountPaid as never),
    balance: toNumber(d.balance as never),
    status: str(d.status),
  };
};

const agingBucketSerializer = (raw: unknown): AgingBucketDef => {
  const d = asRaw(raw);
  return {
    key: str(d.key),
    label: str(d.label),
    minDays: toNumber(d.minDays as never),
    maxDays: d.maxDays === null || d.maxDays === undefined ? null : toNumber(d.maxDays as never),
  };
};

export const agingPartyDocumentsSerializer = (
  payload: unknown,
): AgingPartyDocuments => {
  const r = asRaw(payload);
  // A bare array is tolerated for the same reason `statementLineEntries`
  // tolerates one: if a response ever arrives with its rows under `data`, the
  // envelope lifts them into its own slot and discards the siblings, and the
  // panel should still show documents rather than nothing at all.
  const rows = Array.isArray(payload)
    ? (payload as unknown[])
    : lines(r.documents).length
      ? lines(r.documents)
      : lines(r.data);

  return {
    partyType: str(r.partyType) === 'vendor' ? 'vendor' : 'customer',
    partyId: str(r.partyId),
    partyName: str(r.partyName, 'Unknown'),
    asOfDate: str(r.asOfDate),
    preset: str(r.preset, 'monthly') as AgingPresetKey,
    buckets: lines(r.buckets).map(agingBucketSerializer),
    bucket: r.bucket === null || r.bucket === undefined ? null : str(r.bucket),
    outstandingTotal: toNumber(r.outstandingTotal as never),
    documents: rows.map(agingDocumentSerializer),
    total: toNumber(r.total as never),
    page: toNumber(r.page as never) || 1,
    limit: toNumber(r.limit as never) || 50,
  };
};

// ═══════════════════════════════════════════════════════
// Party summary — everything one customer or vendor has open
// ═══════════════════════════════════════════════════════

/** An aging bucket with what this party has in it. */
export interface PartySummaryBucket extends AgingBucketDef {
  amount: number;
  count: number;
}

/**
 * Money on the party's account that no document has used yet. It comes off
 * what is due: a customer's unapplied receipt or open credit memo, or an open
 * vendor credit.
 */
export interface PartySummaryCredit {
  kind: 'payment' | 'credit_memo' | 'vendor_credit';
  id: string;
  reference: string;
  date: string;
  amount: number;
  /** What is left to apply — the part that reduces what is due. */
  available: number;
}

/**
 * What GET /reports/ar-aging/customers/:id/summary (and its A/P twin) returns:
 * the outstanding-invoices or payables summary a business sends.
 *
 * `totals.outstanding` is the party's aging row; `netDue` is that less the
 * credits, and can be zero or negative when credits cover everything.
 */
export interface PartySummary {
  partyType: 'customer' | 'vendor';
  party: {
    id: string;
    /** The customer or vendor ID (C-0007); empty from a server that predates IDs. */
    code: string;
    name: string;
    contactPerson: string;
    email: string;
    phone: string;
    /** One line, already joined by the server. */
    address: string;
    /** The API's dialect (`net30`); map with `paymentTermsFromApi`. */
    paymentTerms: string;
    taxId: string;
  };
  asOfDate: string;
  preset: AgingPresetKey;
  buckets: PartySummaryBucket[];
  /** Soonest due first. */
  documents: AgingPartyDocument[];
  totals: {
    count: number;
    outstanding: number;
    overdue: number;
    overdueCount: number;
    notYetDue: number;
  };
  credits: { total: number; items: PartySummaryCredit[] };
  netDue: number;
  lastPayment: { date: string; amount: number; reference: string } | null;
}

const CREDIT_KINDS: PartySummaryCredit['kind'][] = ['payment', 'credit_memo', 'vendor_credit'];

export const partySummarySerializer = (payload: unknown): PartySummary => {
  const r = asRaw(payload);
  const party = asRaw(r.party);
  const totals = asRaw(r.totals);
  const credits = asRaw(r.credits);
  const documents = lines(r.documents).map(agingDocumentSerializer);
  const outstanding = toNumber(totals.outstanding as never);
  const creditTotal = toNumber(credits.total as never);
  const last = r.lastPayment ? asRaw(r.lastPayment) : null;

  return {
    partyType: str(r.partyType) === 'vendor' ? 'vendor' : 'customer',
    party: {
      id: str(party.id),
      code: str(party.code),
      name: str(party.name, 'Unknown'),
      contactPerson: str(party.contactPerson),
      email: str(party.email),
      phone: str(party.phone),
      address: str(party.address),
      paymentTerms: str(party.paymentTerms),
      taxId: str(party.taxId),
    },
    asOfDate: str(r.asOfDate),
    preset: str(r.preset, 'monthly') as AgingPresetKey,
    buckets: lines(r.buckets).map((b) => ({
      ...agingBucketSerializer(b),
      amount: toNumber(asRaw(b).amount as never),
      count: toNumber(asRaw(b).count as never),
    })),
    documents,
    totals: {
      count: toNumber(totals.count as never) || documents.length,
      outstanding,
      overdue: toNumber(totals.overdue as never),
      overdueCount: toNumber(totals.overdueCount as never),
      notYetDue: toNumber(totals.notYetDue as never),
    },
    credits: {
      total: creditTotal,
      items: lines(credits.items).map((raw) => {
        const c = asRaw(raw);
        const kind = str(c.kind) as PartySummaryCredit['kind'];
        return {
          kind: CREDIT_KINDS.includes(kind) ? kind : 'payment',
          id: str(c.id),
          reference: str(c.reference),
          date: str(c.date),
          amount: toNumber(c.amount as never),
          available: toNumber(c.available as never),
        };
      }),
    },
    // Derived when absent rather than read as zero: "nothing due" is the one
    // wrong answer a summary sent to a customer must never give by accident.
    netDue:
      r.netDue === undefined || r.netDue === null
        ? Math.round((outstanding - creditTotal) * 100) / 100
        : toNumber(r.netDue as never),
    lastPayment: last
      ? { date: str(last.date), amount: toNumber(last.amount as never), reference: str(last.reference) }
      : null,
  };
};

// ═══════════════════════════════════════════════════════
// Statement line drill-down
// ═══════════════════════════════════════════════════════

/** One posted ledger row behind a statement line. */
export interface StatementLineEntry {
  id: string;
  date: string;
  reference: string;
  memo: string;
  debit: number;
  credit: number;
  /**
   * Signed the way the statement reads this account, so the entries on a line
   * add up to the line. Revenue is credit-normal, expenses debit-normal.
   */
  amount: number;
  sourceType: string;
  /** The document's id, for opening it. */
  sourceId: string;
  /** `sourceType` in words, e.g. 'Invoice'. */
  sourceLabel: string;
  /**
   * The document's own number — INV-2026-0001.
   *
   * What someone actually wants when they open an account. `reference` is the
   * journal-entry number, which identifies the posting rather than the record.
   * Falls back to `reference` on a manual entry, which has no document.
   */
  documentNumber: string;
  /** The customer or vendor. Empty on a manual journal entry. */
  counterpartyName: string;
}

export interface StatementLineEntries {
  accountCode: string;
  accountName: string;
  accountType: string;
  /** The figure on the statement line, over the whole range. */
  lineAmount: number;
  entries: StatementLineEntry[];
  /** Rows in the range, which may exceed what one page returned. */
  total: number;
  page: number;
  limit: number;
}

export const statementLineEntriesSerializer = (
  payload: unknown,
): StatementLineEntries => {
  const r = asRaw(payload);
  // `data` is the server's key for the page of rows; `entries` is accepted too
  // so this does not break if the envelope is ever flattened.
  // `entries` first. The server briefly returned these under `data`, which the
  // response envelope then lifted into its own slot — discarding every sibling
  // — so the client received a bare array and rendered "no transactions" for
  // every account. An array is tolerated outright so that shape can never
  // blank the screen again.
  const rows = Array.isArray(payload)
    ? (payload as unknown[])
    : lines(r.entries).length
      ? lines(r.entries)
      : lines(r.data);
  return {
    accountCode: str(r.accountCode),
    accountName: str(r.accountName),
    accountType: str(r.accountType),
    lineAmount: toNumber(r.lineAmount as never),
    entries: rows.map((raw) => {
      const e = asRaw(raw);
      return {
        id: str(e.id),
        date: str(e.date),
        reference: str(e.reference),
        memo: str(e.memo),
        debit: toNumber(e.debit as never),
        credit: toNumber(e.credit as never),
        amount: toNumber(e.amount as never),
        sourceType: str(e.sourceType),
        sourceId: str(e.sourceId),
        sourceLabel: str(e.sourceLabel, 'Journal entry'),
        documentNumber: str(e.documentNumber) || str(e.reference),
        counterpartyName: str(e.counterpartyName),
      };
    }),
    total: toNumber(r.total as never),
    page: toNumber(r.page as never) || 1,
    limit: toNumber(r.limit as never) || 50,
  };
};

// ═══════════════════════════════════════════════════════
// Inventory Valuation
// ═══════════════════════════════════════════════════════

export interface InventoryValuationRow {
  itemId: string;
  itemName: string;
  sku: string;
  category: string;
  qty: number;
  /** Null when an as-of valuation could not tell what the item cost. */
  cost: number | null;
  value: number;
  /**
   * False when an as-of valuation could not value the item — a movement on
   * record carries no cost. `value` then reads 0 and is not in the total; the
   * page shows a dash, never an estimate.
   */
  valueKnown: boolean;
}

/** One month on a value-over-time series. */
export interface ValuationTrendPoint {
  /** 'YYYY-MM' — a stable key, unlike the label. */
  period: string;
  /** 'Mar 26'. */
  label: string;
  /** Month end, which is the date the figure closes on. */
  asOfDate: string;
  value: number;
}

/**
 * Company-wide stock value over time.
 *
 * Derived from general ledger account 1200, so every point is EXACT and ties to
 * the balance sheet — the same identity verify-reports.mjs already asserts for
 * the current snapshot, extended backwards. No new column and no estimate: the
 * ledger has always recorded what inventory was worth, only nothing asked it.
 */
export interface InventoryValuationTrend {
  months: number;
  points: ValuationTrendPoint[];
}

export const inventoryValuationTrendSerializer = (
  payload: unknown,
): InventoryValuationTrend => {
  const r = asRaw(payload);
  return {
    months: toNumber(r.months as never) || 12,
    points: lines(r.points).map((raw) => {
      const p = asRaw(raw);
      return {
        period: str(p.period),
        label: str(p.label),
        asOfDate: str(p.asOfDate),
        value: toNumber(p.value as never),
      };
    }),
  };
};

/** One month of a single item's stock history. */
export interface ItemHistoryPoint {
  period: string;
  label: string;
  asOfDate: string;
  /**
   * On hand at month end. `null` before the item's first movement — which is
   * "it did not exist yet", a different claim from a zero, which would say it
   * existed and was out of stock.
   */
  closingQty: number | null;
  qtyIn: number;
  qtyOut: number;
  /** Null until per-movement cost is recorded — see `coverage`. */
  closingValue: number | null;
  valueKnown: boolean;
}

export interface InventoryItemHistory {
  itemId: string;
  itemName: string;
  sku: string;
  months: number;
  points: ItemHistoryPoint[];
  coverage: {
    quantity: string;
    /** 'exact' | 'partial' | 'unavailable'. */
    value: string;
    /** The first date an item's value can be read for. Null means never. */
    costHistoryFrom: string | null;
    /** Why some or all of the value is missing, or why a month is below zero. */
    message: string;
  };
}

/**
 * Preserves null, which on these series means "not known" and never "zero".
 * Coercing it to 0 would invent a stockout for every month before the item
 * existed.
 */
const numberOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const x = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(x) ? x : null;
};

export const inventoryItemHistorySerializer = (
  payload: unknown,
): InventoryItemHistory => {
  const r = asRaw(payload);
  const coverage = asRaw(r.coverage);
  return {
    itemId: str(r.itemId),
    itemName: str(r.itemName),
    sku: str(r.sku),
    months: toNumber(r.months as never) || 12,
    points: lines(r.points).map((raw) => {
      const p = asRaw(raw);
      return {
        period: str(p.period),
        label: str(p.label),
        asOfDate: str(p.asOfDate),
        closingQty: numberOrNull(p.closingQty),
        qtyIn: toNumber(p.qtyIn as never),
        qtyOut: toNumber(p.qtyOut as never),
        closingValue: numberOrNull(p.closingValue),
        valueKnown: p.valueKnown === true,
      };
    }),
    coverage: {
      quantity: str(coverage.quantity, 'exact'),
      value: str(coverage.value, 'unavailable'),
      costHistoryFrom: coverage.costHistoryFrom ? str(coverage.costHistoryFrom) : null,
      message: str(coverage.message),
    },
  };
};

/** One month of an item's sales and margin. */
export interface ItemPerformancePoint {
  period: string;
  label: string;
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  /** Null in a month with no sales: a zero margin is a claim about a period
   *  that traded, not about one that did not. */
  marginPct: number | null;
  costKnown: boolean;
}

/** 'ok' | 'low' | 'out' — the Health tab's reorder rule, applied to one item. */
export type ItemStockStatus = 'ok' | 'low' | 'out';

/** The item as it stands today — stock figures are AS OF NOW. */
export interface ItemFacts {
  category: string;
  unitOfMeasure: string;
  sellingPrice: number;
  unitCost: number;
  qtyOnHand: number;
  stockValue: number;
  reorderPoint: number;
  isActive: boolean;
  /** The last sale of any date, not only in the range. Null: never sold. */
  lastSoldDate: string | null;
  /** Signed links to the item's photo; null without one, or from an older server. */
  imageUrl: string | null;
  thumbnailUrl: string | null;
  /** Where the item is kept; null when it has no location. */
  location: string | null;
  /** Null from a server that predates it — the page then works it out from the figures. */
  stockStatus: ItemStockStatus | null;
  /** What the reorder list suggests ordering; null when no reorder is due. */
  suggestedOrderQty: number | null;
  /**
   * The server's days of cover. Undefined from an older server (the page
   * then works it out); null when nothing sold to measure against.
   */
  daysOfCover?: number | null;
  /** Its verdict — the rule lives on the server, never guessed here. */
  cover: KpiAssessment | null;
  /** On hand, with nothing out in 180 days — the Health tab's dead stock. */
  deadStock: boolean;
  lastOutboundDate: string | null;
}

/** One buyer of the item over the range. */
export interface ItemCustomer {
  customerId: string | null;
  customerName: string;
  unitsSold: number;
  revenue: number;
  grossProfit: number;
  /** Share of the window's revenue, 0–100; null for a negative part. */
  sharePct: number | null;
}

/** How the item went out: invoiced directly, or on a delivery. */
export interface ItemChannel {
  key: 'invoice' | 'delivery';
  unitsSold: number;
  revenue: number;
  grossProfit: number;
  /** Invoices — a delivery is sold on the invoice it raised. */
  documents: number;
  /** Share of what went out before returns, 0–100. */
  sharePct: number | null;
}

/** What came back on credit notes: every figure is negative. */
export interface ItemReturns {
  unitsSold: number;
  revenue: number;
  grossProfit: number;
  documents: number;
}

export interface ItemPerformance {
  itemId: string;
  itemName: string;
  sku: string;
  range: { startDate: string; endDate: string };
  points: ItemPerformancePoint[];
  totals: {
    unitsSold: number;
    revenue: number;
    cogs: number;
    grossProfit: number;
    marginPct: number | null;
  };
  /** First date from which cost is recorded. Null means never. */
  costHistoryFrom: string | null;
  /** 0..1 — how much of the cost is an apportioned estimate. Each invoice's
   *  total is exact; the split between items on one invoice is not. */
  estimatedCogsShare: number;
  /** Null from a server that predates it — the explorer then shows less. */
  item: ItemFacts | null;
  /** The top buyers over the range, largest first. */
  customers: ItemCustomer[];
  /** Everyone after the top few, folded. */
  otherCustomers: {
    count: number;
    unitsSold: number;
    revenue: number;
    grossProfit: number;
    sharePct: number | null;
  };
  /**
   * The same lines by document type; with `returns` they add up to `totals`.
   * Null from a server that predates them.
   */
  channels: ItemChannel[] | null;
  returns: ItemReturns | null;
}

const itemCustomerSerializer = (raw: unknown): ItemCustomer => {
  const c = asRaw(raw);
  return {
    customerId: c.customerId ? str(c.customerId) : null,
    customerName: str(c.customerName) || '(no customer)',
    unitsSold: toNumber(c.unitsSold as never),
    revenue: toNumber(c.revenue as never),
    grossProfit: toNumber(c.grossProfit as never),
    sharePct: numberOrNull(c.sharePct),
  };
};

const ITEM_STOCK_STATUSES: readonly ItemStockStatus[] = ['ok', 'low', 'out'];
const ITEM_CHANNELS: readonly ItemChannel['key'][] = ['invoice', 'delivery'];

export const itemPerformanceSerializer = (payload: unknown): ItemPerformance => {
  const r = asRaw(payload);
  const t = asRaw(r.totals);
  const range = asRaw(r.range);
  const item = r.item ? asRaw(r.item) : null;
  const others = asRaw(r.otherCustomers);
  return {
    itemId: str(r.itemId),
    itemName: str(r.itemName),
    sku: str(r.sku),
    range: { startDate: str(range.startDate), endDate: str(range.endDate) },
    points: lines(r.points).map((raw) => {
      const p = asRaw(raw);
      return {
        period: str(p.period),
        label: str(p.label),
        unitsSold: toNumber(p.unitsSold as never),
        revenue: toNumber(p.revenue as never),
        cogs: toNumber(p.cogs as never),
        grossProfit: toNumber(p.grossProfit as never),
        marginPct: numberOrNull(p.marginPct),
        costKnown: p.costKnown !== false,
      };
    }),
    totals: {
      unitsSold: toNumber(t.unitsSold as never),
      revenue: toNumber(t.revenue as never),
      cogs: toNumber(t.cogs as never),
      grossProfit: toNumber(t.grossProfit as never),
      marginPct: numberOrNull(t.marginPct),
    },
    costHistoryFrom: r.costHistoryFrom ? str(r.costHistoryFrom) : null,
    estimatedCogsShare: toNumber(r.estimatedCogsShare as never),
    item: item
      ? {
          category: str(item.category, 'Uncategorized'),
          unitOfMeasure: str(item.unitOfMeasure, 'unit'),
          sellingPrice: toNumber(item.sellingPrice as never),
          unitCost: toNumber(item.unitCost as never),
          qtyOnHand: toNumber(item.qtyOnHand as never),
          stockValue: toNumber(item.stockValue as never),
          reorderPoint: toNumber(item.reorderPoint as never),
          isActive: item.isActive !== false,
          lastSoldDate: item.lastSoldDate ? str(item.lastSoldDate) : null,
          imageUrl: item.imageUrl ? str(item.imageUrl) : null,
          thumbnailUrl: item.thumbnailUrl ? str(item.thumbnailUrl) : null,
          location: item.location ? str(item.location) : null,
          stockStatus: ITEM_STOCK_STATUSES.includes(item.stockStatus as ItemStockStatus)
            ? (item.stockStatus as ItemStockStatus)
            : null,
          suggestedOrderQty: numberOrNull(item.suggestedOrderQty),
          // Absent (an older server) stays undefined, so the page can tell it
          // from "nothing sold" and work the figure out itself.
          ...('daysOfCover' in item ? { daysOfCover: numberOrNull(item.daysOfCover) } : {}),
          cover: assessmentSerializer(item.cover),
          deadStock: item.deadStock === true,
          lastOutboundDate: item.lastOutboundDate ? str(item.lastOutboundDate) : null,
        }
      : null,
    customers: lines(r.customers).map(itemCustomerSerializer),
    otherCustomers: {
      count: toNumber(others.count as never),
      unitsSold: toNumber(others.unitsSold as never),
      revenue: toNumber(others.revenue as never),
      grossProfit: toNumber(others.grossProfit as never),
      sharePct: numberOrNull(others.sharePct),
    },
    channels: Array.isArray(r.channels)
      ? lines(r.channels)
          .map((raw) => {
            const c = asRaw(raw);
            return {
              key: str(c.key) as ItemChannel['key'],
              unitsSold: toNumber(c.unitsSold as never),
              revenue: toNumber(c.revenue as never),
              grossProfit: toNumber(c.grossProfit as never),
              documents: toNumber(c.documents as never),
              sharePct: numberOrNull(c.sharePct),
            };
          })
          .filter((c) => ITEM_CHANNELS.includes(c.key))
      : null,
    returns: r.returns
      ? (() => {
          const x = asRaw(r.returns);
          return {
            unitsSold: toNumber(x.unitsSold as never),
            revenue: toNumber(x.revenue as never),
            grossProfit: toNumber(x.grossProfit as never),
            documents: toNumber(x.documents as never),
          };
        })()
      : null,
  };
};

/** One document line behind an item's figures. */
export interface ItemSalesEntry {
  date: string;
  /** A delivery opens the invoice it raised, so it links like an invoice. */
  docType: 'invoice' | 'delivery' | 'credit_memo';
  docId: string;
  docNumber: string;
  customerId: string | null;
  customerName: string;
  /** Negative on a return. */
  units: number;
  /** Net of tax and the invoice discount. */
  unitPrice: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPct: number | null;
  costBasis: string;
  costKnown: boolean;
}

export interface ItemSalesEntries {
  itemId: string;
  range: { startDate: string; endDate: string };
  entries: ItemSalesEntry[];
  /** Lines in the whole range, not just this page. */
  total: number;
  page: number;
  limit: number;
  /** Over the whole range — equal to the matching months on item-performance. */
  totals: { unitsSold: number; revenue: number; cogs: number; grossProfit: number };
}

const DOC_TYPES = ['invoice', 'delivery', 'credit_memo'] as const;

export const itemSalesEntriesSerializer = (payload: unknown): ItemSalesEntries => {
  const r = asRaw(payload);
  const range = asRaw(r.range);
  const t = asRaw(r.totals);
  return {
    itemId: str(r.itemId),
    range: { startDate: str(range.startDate), endDate: str(range.endDate) },
    entries: lines(r.entries).map((raw) => {
      const e = asRaw(raw);
      const docType = str(e.docType) as ItemSalesEntry['docType'];
      return {
        date: str(e.date),
        docType: DOC_TYPES.includes(docType) ? docType : 'invoice',
        docId: str(e.docId),
        docNumber: str(e.docNumber),
        customerId: e.customerId ? str(e.customerId) : null,
        customerName: str(e.customerName) || '(no customer)',
        units: toNumber(e.units as never),
        unitPrice: toNumber(e.unitPrice as never),
        revenue: toNumber(e.revenue as never),
        cogs: toNumber(e.cogs as never),
        grossProfit: toNumber(e.grossProfit as never),
        marginPct: numberOrNull(e.marginPct),
        costBasis: str(e.costBasis, 'unknown'),
        costKnown: e.costKnown !== false,
      };
    }),
    total: toNumber(r.total as never),
    page: toNumber(r.page as never) || 1,
    limit: toNumber(r.limit as never) || 25,
    totals: {
      unitsSold: toNumber(t.unitsSold as never),
      revenue: toNumber(t.revenue as never),
      cogs: toNumber(t.cogs as never),
      grossProfit: toNumber(t.grossProfit as never),
    },
  };
};

export type InventoryPerformanceSort =
  | 'grossProfit'
  | 'revenue'
  | 'marginPct'
  | 'stockValue';

/** One item: what it is carrying, and what it earned. */
export interface InventoryPerformanceRow {
  itemId: string;
  itemName: string;
  sku: string;
  category: string;
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  /** Null in a period the item did not trade — not zero. */
  marginPct: number | null;
  /** AS OF NOW, not the period end — these tie to the balance sheet. */
  qtyOnHand: number;
  unitCost: number;
  stockValue: number;
  costBasis: string;
  /** The last sale of any date. Null: never sold, or a server that predates it. */
  lastSoldDate: string | null;
}

export interface ReconcilingItem {
  label: string;
  revenue: number;
  cogs: number;
  reason: string;
}

export interface InventoryPerformance {
  range: { startDate: string; endDate: string };
  sort: InventoryPerformanceSort;
  rows: InventoryPerformanceRow[];
  totals: {
    unitsSold: number;
    revenue: number;
    cogs: number;
    grossProfit: number;
    marginPct: number | null;
    stockValue: number;
    /** GL 1200, all time — what `stockValue` should equal. Null from an older server. */
    ledgerValue: number | null;
  };
  /**
   * Why this report does not equal the Profit & Loss, itemised — and it foots:
   * goods sold plus every line equals the ledger figure. Showing the difference
   * and naming it is what lets an accountant trust the rows above.
   */
  reconciliation: {
    glRevenue: number;
    glCogs: number;
    itemRevenue: number;
    itemCogs: number;
    unallocatedRevenue: number;
    unallocatedCogs: number;
    items: ReconcilingItem[];
    note: string;
  };
  estimatedCogsShare: number;
  costHistoryFrom: string | null;
}

export const inventoryPerformanceSerializer = (
  payload: unknown,
): InventoryPerformance => {
  const r = asRaw(payload);
  const t = asRaw(r.totals);
  const rc = asRaw(r.reconciliation);
  return {
    range: (r.range as { startDate: string; endDate: string }) ?? {
      startDate: '',
      endDate: '',
    },
    sort: (str(r.sort, 'grossProfit') as InventoryPerformanceSort),
    rows: lines(r.rows).map((raw) => {
      const x = asRaw(raw);
      return {
        itemId: str(x.itemId),
        itemName: str(x.itemName),
        sku: str(x.sku),
        category: str(x.category, 'Uncategorized'),
        unitsSold: toNumber(x.unitsSold as never),
        revenue: toNumber(x.revenue as never),
        cogs: toNumber(x.cogs as never),
        grossProfit: toNumber(x.grossProfit as never),
        marginPct: numberOrNull(x.marginPct),
        qtyOnHand: toNumber(x.qtyOnHand as never),
        unitCost: toNumber(x.unitCost as never),
        stockValue: toNumber(x.stockValue as never),
        costBasis: str(x.costBasis, 'posted'),
        lastSoldDate: x.lastSoldDate ? str(x.lastSoldDate) : null,
      };
    }),
    totals: {
      unitsSold: toNumber(t.unitsSold as never),
      revenue: toNumber(t.revenue as never),
      cogs: toNumber(t.cogs as never),
      grossProfit: toNumber(t.grossProfit as never),
      marginPct: numberOrNull(t.marginPct),
      stockValue: toNumber(t.stockValue as never),
      ledgerValue: numberOrNull(t.ledgerValue),
    },
    reconciliation: {
      glRevenue: toNumber(rc.glRevenue as never),
      glCogs: toNumber(rc.glCogs as never),
      itemRevenue: toNumber(rc.itemRevenue as never),
      itemCogs: toNumber(rc.itemCogs as never),
      unallocatedRevenue: toNumber(rc.unallocatedRevenue as never),
      unallocatedCogs: toNumber(rc.unallocatedCogs as never),
      items: lines(rc.items).map((raw) => {
        const i = asRaw(raw);
        return {
          label: str(i.label),
          revenue: toNumber(i.revenue as never),
          cogs: toNumber(i.cogs as never),
          reason: str(i.reason),
        };
      }),
      note: str(rc.note),
    },
    estimatedCogsShare: toNumber(r.estimatedCogsShare as never),
    costHistoryFrom: r.costHistoryFrom ? str(r.costHistoryFrom) : null,
  };
};

export interface InventoryValuationReport {
  rows: InventoryValuationRow[];
  byCategory: { category: string; totalValue: number }[];
  totalValue: number;
  /** Set when the valuation was asked for as of a date; '' for today's snapshot. */
  asOfDate: string;
  /**
   * The server's own tie-out against GL 1200 for that date. Null from a server
   * that predates as-of valuation.
   */
  ledgerTie: { gl1200: number; valuation: number; gap: number } | null;
  /**
   * How much of the history carries a recorded value. Below 100 the server did
   * not estimate the rest — the figure is what is known, and this says so.
   */
  coverage: { pct: number; message: string } | null;
}

export const inventoryValuationSerializer = (
  payload: unknown,
): InventoryValuationReport => {
  const r = asRaw(payload);
  const tie = r.ledgerTie ? asRaw(r.ledgerTie) : null;
  // `coverage` may be a bare percentage or `{ pct, message }`.
  const cov = r.coverage;
  const coverage =
    cov === null || cov === undefined
      ? null
      : typeof cov === 'object'
        ? {
            pct: toNumber((asRaw(cov).pct ?? asRaw(cov).percent) as never),
            // The contract counts the items it could not value rather than
            // sending a sentence; the sentence is made here.
            message:
              str(asRaw(cov).message) ||
              (toNumber(asRaw(cov).unvaluedItems as never) > 0
                ? `${toNumber(asRaw(cov).unvaluedItems as never)} item${toNumber(asRaw(cov).unvaluedItems as never) === 1 ? ' has' : 's have'} no recorded value on that date`
                : ''),
          }
        : { pct: toNumber(cov as never), message: '' };
  return {
    asOfDate: str(r.asOfDate),
    ledgerTie: tie
      ? {
          gl1200: toNumber(tie.gl1200 as never),
          valuation: toNumber(tie.valuation as never),
          gap: toNumber(tie.gap as never),
        }
      : null,
    coverage,
    rows: lines(r.rows).map((raw) => {
      const row = asRaw(raw);
      return {
        itemId: str(row.itemId),
        itemName: str(row.itemName),
        sku: str(row.sku),
        category: str(row.category, 'Uncategorized'),
        qty: toNumber(row.qty as never),
        cost: numberOrNull(row.cost),
        value: toNumber(row.value as never),
        valueKnown: row.valueKnown === undefined ? row.value !== null : Boolean(row.valueKnown),
      };
    }),
    byCategory: lines(r.byCategory).map((raw) => {
      const c = asRaw(raw);
      return {
        category: str(c.category, 'Uncategorized'),
        totalValue: toNumber(c.totalValue as never),
      };
    }),
    totalValue: toNumber(r.totalValue as never),
  };
};

// ═══════════════════════════════════════════════════════
// Analytics
// ═══════════════════════════════════════════════════════

export interface TrendPoint {
  label: string;
  value: number;
}

export interface AgingTrendPoint {
  label: string;
  current: number;
  bucket1to30: number;
  bucket31to60: number;
  bucket61to90: number;
  bucket90Plus: number;
}

export interface AnalyticsReport {
  revenueTrend: TrendPoint[];
  /**
   * Grouped by VENDOR, not by expense account, despite the API's name — the query
   * joins bills to vendors. The page labels it "Spend by supplier", which is what
   * it is.
   */
  expenseCategories: TrendPoint[];
  cashFlowTrend: TrendPoint[];
  topCustomers: TrendPoint[];
  arAgingTrend: AgingTrendPoint[];
}

/**
 * A trend series, safe to hand straight to recharts.
 *
 * No finite-value filter is needed: `toNumber` coerces anything unparseable to 0
 * rather than NaN, so a bad point plots as zero instead of making recharts draw
 * nothing and log nothing. The app filters with `Number.isFinite` after its own
 * coercion, which can never fire.
 */
const trend = (v: unknown): TrendPoint[] =>
  lines(v).map((raw) => {
    const p = asRaw(raw);
    return { label: str(p.label), value: toNumber(p.value as never) };
  });

export const analyticsSerializer = (payload: unknown): AnalyticsReport => {
  const r = asRaw(payload);
  return {
    revenueTrend: trend(r.revenueTrend),
    expenseCategories: trend(r.expenseCategories),
    cashFlowTrend: trend(r.cashFlowTrend),
    topCustomers: trend(r.topCustomers),
    arAgingTrend: lines(r.arAgingTrend).map((raw) => {
      const p = asRaw(raw);
      return {
        label: str(p.label),
        current: toNumber(p.current as never),
        bucket1to30: toNumber(p.bucket1to30 as never),
        bucket31to60: toNumber(p.bucket31to60 as never),
        bucket61to90: toNumber(p.bucket61to90 as never),
        bucket90Plus: toNumber(p.bucket90Plus as never),
      };
    }),
  };
};
