// ═══════════════════════════════════════════════════════
// FinMatrix Web — Document allocation
// ═══════════════════════════════════════════════════════
// Splitting one payment across several documents: customer receipts across
// invoices, vendor payments across bills. The arithmetic is identical, so it
// lives once — a second copy of the logic that decides where money lands is
// exactly the thing that drifts.
//
// The two sides use it differently, and both are supported:
//   • Receive Payments has a typed amount to spread    → autoDistribute()
//   • Pay Bills has no typed amount; the total IS the
//     sum of the rows                                  → fillToBalance()

import Decimal from 'decimal.js';

import { toDecimal, type MoneyInput } from '@/utils/money';

/** One open document a payment can be put against. */
export interface AllocationRow {
  documentId: string;
  documentNumber: string;
  dueDate: string;
  total: number;
  amountPaid: number;
  /** What is still owed. The wire field is `balance` on both sides. */
  balance: number;
  checked: boolean;
  /** What this payment puts against it, as a string — it is an input. */
  applied: string;
}

const money = (d: Decimal): number => d.toDecimalPlaces(2).toNumber();

export const totalAllocated = (rows: AllocationRow[]): number =>
  money(
    rows
      .filter((r) => r.checked)
      .reduce((acc, r) => acc.plus(toDecimal(r.applied)), new Decimal(0)),
  );

export const totalOutstanding = (rows: AllocationRow[]): number =>
  money(rows.reduce((acc, r) => acc.plus(toDecimal(r.balance)), new Decimal(0)));

/**
 * The part of a payment not put against any document.
 *
 * Floored at zero: allocations exceeding the amount is a separate error state,
 * not a negative remainder. Only the AR side can have one — a bill payment has
 * no typed total to exceed.
 */
export const unappliedOf = (amount: MoneyInput, allocated: number): number => {
  const diff = toDecimal(amount).minus(toDecimal(allocated));
  return diff.isNegative() ? 0 : money(diff);
};

/** Allocations may never exceed the payment. */
export const isOverAllocated = (
  amount: MoneyInput,
  allocated: number,
): boolean => toDecimal(allocated).greaterThan(toDecimal(amount));

/**
 * Rows given more than the document actually owes.
 *
 * Both servers refuse the entire request for this — `PAYMENT_EXCEEDS_BALANCE`
 * on either side — so it has to be caught before sending, not after.
 */
export const overAppliedRows = (rows: AllocationRow[]): AllocationRow[] =>
  rows.filter(
    (r) => r.checked && toDecimal(r.applied).greaterThan(toDecimal(r.balance)),
  );

/**
 * Spread an amount across the checked rows, oldest due date first.
 *
 * Each row takes `min(rowBalance, remaining)`, which is what makes
 * over-allocation structurally impossible: no row can exceed what it owes and
 * the total can never exceed the amount. Rows arrive already sorted oldest
 * first from both servers.
 *
 * This is the starting point, not a constraint — every row stays editable
 * afterwards, guarded by `overAppliedRows` and `isOverAllocated`.
 */
export const autoDistribute = (
  rows: AllocationRow[],
  amount: MoneyInput,
): AllocationRow[] => {
  let remaining = toDecimal(amount);

  return rows.map((row) => {
    if (!row.checked) return { ...row, applied: '0' };
    if (!remaining.greaterThan(0)) return { ...row, applied: '0' };

    const balance = toDecimal(row.balance);
    const take = remaining.lessThan(balance) ? remaining : balance;
    remaining = remaining.minus(take);
    return { ...row, applied: String(money(take)) };
  });
};

/** Check every row and set the amount to the full outstanding total. */
export const payInFull = (
  rows: AllocationRow[],
): { rows: AllocationRow[]; amount: string } => {
  const total = totalOutstanding(rows);
  const checked = rows.map((r) => ({ ...r, checked: true }));
  return { rows: autoDistribute(checked, total), amount: String(total) };
};

/**
 * Check every row and fill each to its own balance.
 *
 * The AP counterpart of `payInFull`. There is no payment amount to spread on
 * that side — `PayBillsDto` has no top-level `amount` at all, so the total is
 * simply whatever the rows add up to.
 */
export const fillToBalance = (rows: AllocationRow[]): AllocationRow[] =>
  rows.map((r) => ({ ...r, checked: true, applied: String(r.balance) }));

/** Clamp one row's figure to what that document owes. */
export const clampToBalance = (row: AllocationRow, value: string): string => {
  const parsed = toDecimal(value);
  const balance = toDecimal(row.balance);
  return parsed.greaterThan(balance) ? String(money(balance)) : value;
};

// ─── Credit on account ───────────────────────────────────────────────────
// Money the party already has with you — a customer's advance or credit memo,
// a vendor's credit — spent on documents alongside (or instead of) new cash.

/** Credit available to spend, and how much of it the user chose to use. */
export interface CreditSource {
  /** The receipt holding an advance, a credit memo, or a vendor credit. */
  id: string;
  /** `advance` / `credit_memo` on the customer side; unused on the vendor side. */
  kind?: string;
  reference: string;
  date: string;
  available: number;
  /** The part to use, as typed. Capped at `available` when spread. */
  use: string;
}

/** One credit, on one document. */
export interface CreditPiece {
  creditId: string;
  kind?: string;
  documentId: string;
  amount: number;
}

export interface CreditSpread {
  pieces: CreditPiece[];
  /** Credit landing on each document. */
  perDocument: Record<string, number>;
  /** How much of each credit was actually spent. */
  perCredit: Record<string, number>;
  used: number;
}

/**
 * Spend credits over documents, in the order both are given — credits oldest
 * first, documents oldest due first — each document taking no more than its
 * `cap`.
 *
 * A credit's `use` beyond what the documents can absorb is simply not spent:
 * the server refuses a credit larger than the invoice it lands on, so this is
 * the only place that decides where credit goes, and it can never send one.
 */
export const spreadCredits = (
  targets: { documentId: string; cap: number }[],
  credits: CreditSource[],
): CreditSpread => {
  const capLeft = new Map(targets.map((t) => [t.documentId, toDecimal(Math.max(t.cap, 0))]));
  const pieces: CreditPiece[] = [];
  const perDocument: Record<string, number> = {};
  const perCredit: Record<string, number> = {};
  let used = new Decimal(0);

  for (const credit of credits) {
    const wanted = toDecimal(credit.use || 0);
    let remaining = Decimal.min(
      wanted.isNegative() ? new Decimal(0) : wanted,
      toDecimal(Math.max(credit.available, 0)),
    );
    let spent = new Decimal(0);
    for (const t of targets) {
      if (!remaining.greaterThan(0)) break;
      const left = capLeft.get(t.documentId) ?? new Decimal(0);
      if (!left.greaterThan(0)) continue;
      const take = Decimal.min(remaining, left);
      capLeft.set(t.documentId, left.minus(take));
      remaining = remaining.minus(take);
      spent = spent.plus(take);
      pieces.push({ creditId: credit.id, kind: credit.kind, documentId: t.documentId, amount: money(take) });
      perDocument[t.documentId] = money(toDecimal(perDocument[t.documentId] ?? 0).plus(take));
    }
    perCredit[credit.id] = money(spent);
    used = used.plus(spent);
  }
  return { pieces, perDocument, perCredit, used: money(used) };
};

/**
 * Every credit set to use all it holds — the natural first choice. (Not
 * `useAll…`: a `use` prefix reads as a React hook to the linter and to people.)
 */
export const fillCredits = (credits: CreditSource[]): CreditSource[] =>
  credits.map((c) => ({ ...c, use: String(money(toDecimal(c.available))) }));
