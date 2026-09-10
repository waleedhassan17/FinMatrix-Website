// ═══════════════════════════════════════════════════════
// FinMatrix Web — Journal Entry model
// ═══════════════════════════════════════════════════════
// Manual double-entry: the one screen that writes the ledger directly rather
// than as a side effect of a document. `journal.post` is REQUEST for staff, so
// every write here can come back as an approval instead of a result.
//
// There is no update and no delete. An entry is immutable once created, and a
// wrong one is voided — which books a reversing entry if it was posted — and
// re-entered. That is why the form has no edit mode.

import { Decimal, isBalanced, toDecimal } from '@/utils/money';

export type JournalEntryStatus = 'draft' | 'posted' | 'void';

export const JOURNAL_STATUS_LABELS: Record<JournalEntryStatus, string> = {
  draft: 'Draft',
  posted: 'Posted',
  void: 'Void',
};

/** A line as it reads back, enriched by the server with the account's names. */
export interface JournalEntryLine {
  id: string;
  accountId: string;
  accountNumber: string;
  accountName: string;
  description: string;
  debit: number;
  credit: number;
  lineOrder: number;
}

export interface JournalEntry {
  id: string;
  companyId: string;
  /** Server-generated, e.g. JE-2026-0001. Never sent. */
  reference: string;
  date: string;
  memo: string;
  status: JournalEntryStatus;
  lines: JournalEntryLine[];
  totalDebits: number;
  totalCredits: number;
  createdBy: string;
  postedBy: string;
  postedAt: string;
  voidReason: string;
  /** Set on the reversing entry a void books, pointing at what it reversed. */
  reversalOfId: string | null;
  sourceType: string;
  createdAt: string;
  updatedAt: string;
}

/** One row of the editor. Both sides are strings — they are inputs. */
export interface JournalFormLine {
  /** Client-only React key. Never sent. */
  id: string;
  accountId: string;
  description: string;
  debit: string;
  credit: string;
}

export interface JournalFormData {
  date: string;
  memo: string;
  lines: JournalFormLine[];
}

let lineSeq = 0;

export const freshJournalLine = (): JournalFormLine => {
  lineSeq += 1;
  return { id: `jl_${lineSeq}`, accountId: '', description: '', debit: '', credit: '' };
};

/** A new entry opens with two empty lines, the minimum an entry can have. */
export const emptyJournalForm = (date: string): JournalFormData => ({
  date,
  memo: '',
  lines: [freshJournalLine(), freshJournalLine()],
});

// ═══════════════════════════════════════════════════════
// Totals
// ═══════════════════════════════════════════════════════

export interface JournalTotals {
  debits: Decimal;
  credits: Decimal;
  /** debits − credits. Zero means balanced; the sign says which side is short. */
  difference: Decimal;
  balanced: boolean;
}

export const journalTotals = (
  lines: readonly JournalFormLine[],
): JournalTotals => {
  const debitValues = lines.map((l) => l.debit);
  const creditValues = lines.map((l) => l.credit);

  let debits = new Decimal(0);
  let credits = new Decimal(0);
  for (const line of lines) {
    debits = debits.plus(toDecimal(line.debit));
    credits = credits.plus(toDecimal(line.credit));
  }

  return {
    debits,
    credits,
    difference: debits.minus(credits),
    balanced: isBalanced(debitValues, creditValues),
  };
};

// ═══════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════

/**
 * A row the user has not started: no account and no figures. Dropped silently
 * because an untouched row is not a mistake — it is the blank the editor opened
 * with. Anything half-filled is reported instead.
 */
const isUntouched = (line: JournalFormLine): boolean =>
  line.accountId === '' &&
  !toDecimal(line.debit).greaterThan(0) &&
  !toDecimal(line.credit).greaterThan(0);

export const usableJournalLines = (
  lines: readonly JournalFormLine[],
): JournalFormLine[] => lines.filter((line) => !isUntouched(line));

/**
 * Why a DRAFT cannot be saved. Empty string means it can.
 *
 * A draft may be unbalanced — that is the point of a draft, and the server only
 * checks the balance when `status === 'posted'`. But `createEntry` validates the
 * line SHAPE whatever the status, so these rules are not relaxed for drafts:
 *
 *   * at least 2 lines (`ArrayMinSize(2)`, and INSUFFICIENT_LINES behind it)
 *   * every line names an account
 *   * every line has exactly one non-zero side — the server throws when
 *     `debitPositive === creditPositive`, and the DB backs it with a CHECK:
 *     `(debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)`
 *
 * That last rule is why the editor clears the opposite side as soon as one is
 * typed: a row with both filled in cannot be saved at all, draft or not.
 */
export const validateJournalDraft = (
  lines: readonly JournalFormLine[],
): string => {
  const usable = usableJournalLines(lines);

  if (usable.length < 2) {
    return 'An entry needs at least two lines — one account debited, another credited.';
  }

  if (usable.some((line) => line.accountId === '')) {
    return 'Every line needs an account.';
  }

  const bothSides = usable.some(
    (line) =>
      toDecimal(line.debit).greaterThan(0) && toDecimal(line.credit).greaterThan(0),
  );
  if (bothSides) {
    return 'A line is either a debit or a credit, never both.';
  }

  const neitherSide = usable.some(
    (line) =>
      !toDecimal(line.debit).greaterThan(0) &&
      !toDecimal(line.credit).greaterThan(0),
  );
  if (neitherSide) {
    return 'Every line needs an amount on one side.';
  }

  const negative = usable.some(
    (line) =>
      toDecimal(line.debit).lessThan(0) || toDecimal(line.credit).lessThan(0),
  );
  if (negative) {
    return 'Amounts cannot be negative — put the figure on the other side instead.';
  }

  return '';
};

/**
 * Why an entry cannot be POSTED. Empty string means it can.
 *
 * Everything a draft requires, and then the balance.
 *
 * **Exact equality, not an epsilon.** The server allows 0.0001 of tolerance,
 * and the app uses 0.01 — but the figures here are typed by a human into
 * 2-decimal fields and summed with Decimal, so there is no float drift to
 * absorb and no way to enter a sub-cent difference. An epsilon would only ever
 * serve to accept an entry that is genuinely a cent out.
 */
export const validateJournalPost = (
  lines: readonly JournalFormLine[],
): string => {
  const draftError = validateJournalDraft(lines);
  if (draftError) return draftError;

  const totals = journalTotals(usableJournalLines(lines));

  // Implied by the shape rule once the entry balances, but stated anyway: it is
  // the rule that stops an all-zero entry, which `isBalanced` alone accepts.
  if (!totals.debits.greaterThan(0)) {
    return 'An entry needs an amount.';
  }

  if (!totals.balanced) {
    const short = totals.difference.greaterThan(0) ? 'Credits' : 'Debits';
    return `${short} are short by ${totals.difference.abs().toFixed(2)}. Debits and credits must match exactly.`;
  }

  return '';
};

// ═══════════════════════════════════════════════════════
// Guards
// ═══════════════════════════════════════════════════════

/** Only a draft can be posted. */
export const canPost = (entry: Pick<JournalEntry, 'status'>): boolean =>
  entry.status === 'draft';

/**
 * Anything not already void can be voided. A posted entry is reversed with a
 * balancing entry rather than erased, which is why there is no "only drafts"
 * restriction here.
 */
export const canVoid = (entry: Pick<JournalEntry, 'status'>): boolean =>
  entry.status !== 'void';

/** A reversing entry the system booked, not something the user wrote. */
export const isReversal = (entry: Pick<JournalEntry, 'reversalOfId'>): boolean =>
  entry.reversalOfId !== null;

export const isOpeningBalanceEntry = (
  entry: Pick<JournalEntry, 'sourceType'>,
): boolean => entry.sourceType === 'opening_balance';
