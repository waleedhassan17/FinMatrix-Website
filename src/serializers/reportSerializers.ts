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

export interface BalanceSheetReport {
  asOfDate: string;
  /** Flat — the server does no grouping. See `bucketStatementLines`. */
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
}

export const balanceSheetSerializer = (payload: unknown): BalanceSheetReport => {
  const r = asRaw(payload);
  return {
    asOfDate: str(r.asOfDate),
    assets: lines(r.assets).map(mapStatementLine),
    liabilities: lines(r.liabilities).map(mapStatementLine),
    equity: lines(r.equity).map(mapStatementLine),
    totalAssets: toNumber(r.totalAssets as never),
    totalLiabilities: toNumber(r.totalLiabilities as never),
    totalEquity: toNumber(r.totalEquity as never),
    // Defaults to TRUE when absent. A missing flag is an old or partial payload,
    // not evidence of an imbalance, and crying "out of balance" at a business
    // whose books are fine sends someone hunting an error nobody posted.
    isBalanced: r.isBalanced === undefined ? true : Boolean(r.isBalanced),
  };
};

// ═══════════════════════════════════════════════════════
// Trial Balance
// ═══════════════════════════════════════════════════════

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface TrialBalanceReport {
  range: ReportRangeMeta;
  rows: TrialBalanceRow[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}

export const trialBalanceSerializer = (payload: unknown): TrialBalanceReport => {
  const r = asRaw(payload);
  return {
    range: mapRange(r.range),
    rows: lines(r.rows).map((raw) => {
      const row = asRaw(raw);
      return {
        accountCode: str(row.accountCode),
        accountName: str(row.accountName),
        debit: toNumber(row.debit as never),
        credit: toNumber(row.credit as never),
      };
    }),
    totalDebits: toNumber(r.totalDebits as never),
    totalCredits: toNumber(r.totalCredits as never),
    isBalanced: r.isBalanced === undefined ? true : Boolean(r.isBalanced),
  };
};

// ═══════════════════════════════════════════════════════
// Cash Flow
// ═══════════════════════════════════════════════════════

export interface CashFlowLine {
  /** A server-supplied description; these rows carry no account code. */
  label: string;
  amount: number;
}

export interface CashFlowSection {
  lines: CashFlowLine[];
  total: number;
}

export interface CashFlowReport {
  range: ReportRangeMeta;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  netChange: number;
  beginningCash: number;
  endingCash: number;
  monthlyTrend: { label: string; value: number }[];
  /**
   * The indirect reconciliation — net income adjusted for non-cash items. Its
   * `total` always equals `operating.total`. Optional: older deployments omit it.
   */
  operatingIndirect: {
    netIncome: number;
    adjustments: CashFlowLine[];
    total: number;
  } | null;
}

const mapCashFlowLine = (raw: unknown): CashFlowLine => {
  const r = asRaw(raw);
  return { label: str(r.label), amount: toNumber(r.amount as never) };
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
      return { label: str(point.label), value: toNumber(point.value as never) };
    }),
    operatingIndirect: indirect
      ? {
          netIncome: toNumber(indirect.netIncome as never),
          adjustments: lines(indirect.adjustments).map(mapCashFlowLine),
          total: toNumber(indirect.total as never),
        }
      : null,
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
// Aging (AR and AP share one shape)
// ═══════════════════════════════════════════════════════

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
}

export interface AgingReport {
  asOfDate: string;
  rows: AgingRow[];
  totals: AgingBuckets;
}

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

export const agingSerializer = (payload: unknown): AgingReport => {
  const r = asRaw(payload);
  return {
    asOfDate: str(r.asOfDate),
    rows: lines(r.rows).map((raw) => {
      const row = asRaw(raw);
      return {
        customerId: str(row.customerId),
        customerName: str(row.customerName, 'Unknown'),
        ...mapBuckets(row),
      };
    }),
    totals: mapBuckets(r.totals),
  };
};

/**
 * What is genuinely late, excluding the 1–30 bucket.
 *
 * A bill a week past its due date is chased, not provisioned for; treating it as
 * overdue alongside something 90 days out overstates the problem. The app draws
 * the same line.
 */
export const overdueTotal = (totals: AgingBuckets): number =>
  totals.bucket31to60 + totals.bucket61to90 + totals.bucket90Plus;

// ═══════════════════════════════════════════════════════
// Inventory Valuation
// ═══════════════════════════════════════════════════════

export interface InventoryValuationRow {
  itemId: string;
  itemName: string;
  sku: string;
  category: string;
  qty: number;
  cost: number;
  value: number;
}

export interface InventoryValuationReport {
  rows: InventoryValuationRow[];
  byCategory: { category: string; totalValue: number }[];
  totalValue: number;
}

export const inventoryValuationSerializer = (
  payload: unknown,
): InventoryValuationReport => {
  const r = asRaw(payload);
  return {
    rows: lines(r.rows).map((raw) => {
      const row = asRaw(raw);
      return {
        itemId: str(row.itemId),
        itemName: str(row.itemName),
        sku: str(row.sku),
        category: str(row.category, 'Uncategorized'),
        qty: toNumber(row.qty as never),
        cost: toNumber(row.cost as never),
        value: toNumber(row.value as never),
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
