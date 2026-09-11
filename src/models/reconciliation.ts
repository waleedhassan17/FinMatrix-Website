// ═══════════════════════════════════════════════════════
// FinMatrix Web — Bank Reconciliation model
// ═══════════════════════════════════════════════════════
// Matching the book cash/bank ledger against a bank statement. Admin only, end
// to end: every endpoint is `@Roles('admin')`, because whoever records receipts
// and payments must not also be the one who reconciles the bank against them —
// that is the segregation of duties this control exists to keep.
//
// Reconciling posts NOTHING. It verifies and marks: finishing stamps the cleared
// ledger rows with the reconciliation's id, and from then on the server refuses
// to void or delete the documents behind them (`TRANSACTION_RECONCILED`) until
// the reconciliation is undone.

import { Decimal, toDecimal } from '@/utils/money';

/** A Cash or Bank account that can be reconciled. */
export interface ReconcilableAccount {
  accountId: string;
  accountNumber: string;
  name: string;
  subType: string;
  bookBalance: number;
  lastReconciledDate: string | null;
  lastReconciledBalance: number | null;
}

/** One ledger row on a Cash/Bank account. */
export interface ReconEntry {
  /** The general-ledger row id — what gets ticked and stamped. */
  id: string;
  date: string;
  reference: string;
  memo: string;
  sourceType: string;
  sourceId: string;
  debit: number;
  credit: number;
  /** debit − credit. Positive is a deposit, negative a payment. */
  amount: number;
  /** An in-progress tick saved by `PATCH /reconciliations/mark`. */
  cleared: boolean;
}

/** Everything the reconcile screen needs, from `GET /reconciliations/unreconciled`. */
export interface UnreconciledSet {
  accountId: string;
  accountName: string;
  accountNumber: string;
  /** Net of every row already reconciled — where this statement starts. */
  beginningBalance: number;
  lastStatementDate: string | null;
  lastStatementEndingBalance: number | null;
  /**
   * Non-null means the carried-in balance no longer matches the last
   * statement's ending balance — reconciled history was altered outside the
   * app — and this is the amount it is off by.
   */
  beginningMismatch: number | null;
  entries: ReconEntry[];
}

export interface Reconciliation {
  id: string;
  accountId: string;
  statementDate: string;
  statementEndingBalance: number;
  beginningBalance: number;
  clearedBalance: number;
  difference: number;
  clearedCount: number;
  status: string;
  notes: string;
  createdBy: string;
  reconciledAt: string;
  createdAt: string;
}

export interface ReconciliationDetail extends Reconciliation {
  /** The rows this reconciliation cleared and locked. */
  entries: ReconEntry[];
  /**
   * Book transactions dated on or before the statement that this
   * reconciliation did NOT clear — the timing items that explain book vs bank.
   */
  outstanding: ReconEntry[];
  outstandingTotal: number;
}

export interface CreateReconciliationPayload {
  accountId: string;
  statementDate: string;
  /** A number string, two decimals. */
  statementEndingBalance: string;
  clearedEntryIds: string[];
  notes?: string;
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The typed statement balance as the two-decimal string the API takes, or null
 * when it is not a number.
 *
 * Commas and spaces are stripped because people copy balances off statements
 * that print them. Everything else is refused rather than guessed at — the
 * mobile app runs the input through `parseFloat`, which reads "1,000" as 1 and
 * "15250abc" as 15250, and reconciles against a figure nobody typed. More than
 * two decimals is refused for the same reason: rounding 1.005 silently is a
 * guess about which paisa the statement meant.
 *
 * Negative is allowed — an overdrawn account has a negative statement balance.
 */
export const normalizeStatementBalance = (input: string): string | null => {
  const s = input.replace(/[,\s]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return toDecimal(s).toFixed(2);
};

export interface ReconciliationMath {
  /** The statement balance as it would be sent, or null if unreadable. */
  statementBalance: string | null;
  /** Beginning balance + net of the ticked rows. */
  clearedBalance: number;
  clearedNet: number;
  /** Statement − cleared. Null while there is no readable statement balance. */
  difference: number | null;
  /** Exactly zero. The only state in which the server will finish. */
  balanced: boolean;
}

/**
 * The running figures, exactly as the server computes them.
 *
 *   cleared    = beginning + Σ(debit − credit) of the ticked rows
 *   difference = statement ending balance − cleared
 *
 * In Decimal, and balanced means EXACTLY zero. The mobile app sums JavaScript
 * floats and accepts |difference| < 0.005 — looser than the server's 0.0001, so
 * it can enable Finish for a reconciliation the server then refuses. Every input
 * here is a two-decimal figure, so the true difference is always a whole number
 * of paisa and there is no drift to tolerate.
 *
 * Ticks for rows that are not in `entries` are ignored: a row that dropped out
 * of the list (the statement date moved back past it) must not still count.
 */
export const reconciliationMath = (
  beginningBalance: number,
  entries: readonly Pick<ReconEntry, 'id' | 'amount'>[],
  clearedIds: ReadonlySet<string>,
  statementInput: string,
): ReconciliationMath => {
  let net = new Decimal(0);
  for (const e of entries) {
    if (clearedIds.has(e.id)) net = net.plus(toDecimal(e.amount));
  }
  const cleared = toDecimal(beginningBalance).plus(net);
  const statement = normalizeStatementBalance(statementInput);
  const difference = statement === null ? null : toDecimal(statement).minus(cleared);

  return {
    statementBalance: statement,
    clearedBalance: cleared.toNumber(),
    clearedNet: net.toNumber(),
    difference: difference === null ? null : difference.toNumber(),
    balanced: difference !== null && difference.isZero(),
  };
};

export interface SectionSummary {
  entries: ReconEntry[];
  clearedCount: number;
  /** Signed sum of the ticked rows. */
  clearedTotal: number;
}

const summarise = (
  entries: ReconEntry[],
  clearedIds: ReadonlySet<string>,
): SectionSummary => {
  let total = new Decimal(0);
  let count = 0;
  for (const e of entries) {
    if (!clearedIds.has(e.id)) continue;
    count += 1;
    total = total.plus(toDecimal(e.amount));
  }
  return { entries, clearedCount: count, clearedTotal: total.toNumber() };
};

/**
 * Deposits and payments, the way a bank statement lists them.
 *
 * A zero-amount row lands in deposits, matching the app; it has no effect on
 * the difference either way.
 */
export const splitSections = (
  entries: readonly ReconEntry[],
  clearedIds: ReadonlySet<string>,
): { deposits: SectionSummary; payments: SectionSummary } => ({
  deposits: summarise(
    entries.filter((e) => e.amount >= 0),
    clearedIds,
  ),
  payments: summarise(
    entries.filter((e) => e.amount < 0),
    clearedIds,
  ),
});

/**
 * Statements reconcile in order: one dated before the account's last
 * reconciliation would corrupt every later beginning balance, and the server
 * refuses it (`RECONCILIATION_OUT_OF_ORDER`). Same-day is allowed.
 */
export const isBeforeLastStatement = (
  statementDate: string,
  lastStatementDate: string | null,
): boolean => lastStatementDate !== null && statementDate < lastStatementDate;

type HistoryKey = Pick<Reconciliation, 'id' | 'accountId' | 'statementDate' | 'createdAt'>;

/**
 * Whether this is the account's most recent reconciliation — the only one the
 * server will undo (`RECONCILIATION_NOT_LATEST`). Ordered the way the server
 * orders it: statement date, then creation time for same-day statements.
 *
 * The app offers Undo on every reconciliation and lets the older ones fail.
 */
export const isLatestForAccount = (
  recon: HistoryKey,
  history: readonly HistoryKey[],
): boolean =>
  !history.some(
    (r) =>
      r.accountId === recon.accountId &&
      r.id !== recon.id &&
      (r.statementDate > recon.statementDate ||
        (r.statementDate === recon.statementDate && r.createdAt > recon.createdAt)),
  );

const SOURCE_TYPE_LABELS: Record<string, string> = {
  journal_entry: 'Journal entry',
  opening_balance: 'Opening balance',
  invoice: 'Invoice',
  payment: 'Customer payment',
  bill: 'Bill',
  bill_payment: 'Bill payment',
  credit_memo: 'Credit memo',
  vendor_credit: 'Vendor credit',
  tax_payment: 'Tax payment',
  tax_payment_void: 'Tax payment reversal',
  payroll: 'Payroll',
};

/** What posted this row, in words. Unknown types are humanised, not hidden. */
export const sourceTypeLabel = (sourceType: string): string => {
  const known = SOURCE_TYPE_LABELS[sourceType];
  if (known) return known;
  if (!sourceType) return '—';
  const words = sourceType.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};
