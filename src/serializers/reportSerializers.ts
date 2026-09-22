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
}

export interface AgingTotals extends AgingBuckets {
  amounts: Record<string, number>;
}

export interface AgingReport {
  asOfDate: string;
  preset: AgingPresetKey;
  buckets: AgingBucketDef[];
  rows: AgingRow[];
  totals: AgingTotals;
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
      };
    }),
    totals: { amounts: amountsFor(totalsRaw), ...mapBuckets(r.totals) },
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
    buckets: lines(r.buckets).map((b) => {
      const d = asRaw(b);
      return {
        key: str(d.key),
        label: str(d.label),
        minDays: toNumber(d.minDays as never),
        maxDays:
          d.maxDays === null || d.maxDays === undefined
            ? null
            : toNumber(d.maxDays as never),
      };
    }),
    bucket: r.bucket === null || r.bucket === undefined ? null : str(r.bucket),
    outstandingTotal: toNumber(r.outstandingTotal as never),
    documents: rows.map((raw) => {
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
    }),
    total: toNumber(r.total as never),
    page: toNumber(r.page as never) || 1,
    limit: toNumber(r.limit as never) || 50,
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
  cost: number;
  value: number;
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
  coverage: { quantity: string; value: string; message: string };
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

export interface ItemPerformance {
  itemId: string;
  itemName: string;
  sku: string;
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
}

export const itemPerformanceSerializer = (payload: unknown): ItemPerformance => {
  const r = asRaw(payload);
  const t = asRaw(r.totals);
  return {
    itemId: str(r.itemId),
    itemName: str(r.itemName),
    sku: str(r.sku),
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
      };
    }),
    totals: {
      unitsSold: toNumber(t.unitsSold as never),
      revenue: toNumber(t.revenue as never),
      cogs: toNumber(t.cogs as never),
      grossProfit: toNumber(t.grossProfit as never),
      marginPct: numberOrNull(t.marginPct),
      stockValue: toNumber(t.stockValue as never),
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
