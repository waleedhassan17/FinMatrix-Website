// ═══════════════════════════════════════════════════════
// FinMatrix Web — Credit Memo model
// ═══════════════════════════════════════════════════════
// A credit memo reverses a sale: it credits the customer, and where a line
// carries an itemId it also restocks the goods and reverses their COGS.

import type { FormLineItem } from '@/models/document';
import type { DocumentLine } from '@/serializers/documentLines';

export type CreditMemoStatus =
  | 'open'
  | 'applied'
  | 'closed'
  | 'refunded'
  | 'void';

export interface CreditMemo {
  id: string;
  companyId: string;
  /** Server-generated, `CM-<year>-NNNN`. Never sent. */
  creditMemoNumber: string;
  customerId: string;
  customerName: string;
  /** The wire field is `date` — not creditMemoDate, not issueDate. */
  date: string;
  originalInvoiceId: string | null;
  reason: string;
  status: CreditMemoStatus;
  lines: DocumentLine[];
  subtotal: number;
  taxAmount: number;
  total: number;
  /** How much of the credit has been consumed. */
  amountApplied: number;
  /** What is left. The invariant is `balance = total - amountApplied`. */
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreditMemoFormData {
  customerId: string;
  customerName: string;
  date: string;
  reason: string;
  lines: FormLineItem[];
}

export const CREDIT_MEMO_STATUS_LABELS: Record<CreditMemoStatus, string> = {
  open: 'Open',
  applied: 'Applied',
  closed: 'Closed',
  refunded: 'Refunded',
  void: 'Void',
};

/**
 * Money comparisons use a small epsilon rather than `> 0`.
 *
 * Balances are 4-dp decimal strings, so an "empty" credit can land on
 * 0.0001 through rounding. The app uses the same 0.01 threshold.
 */
const EPSILON = 0.01;

/** Can this credit still be put against an invoice? */
export const canApply = (memo: Pick<CreditMemo, 'balance' | 'status'>): boolean =>
  memo.balance > EPSILON &&
  memo.status !== 'void' &&
  memo.status !== 'refunded' &&
  memo.status !== 'closed';

/** Refund pays out the whole remaining balance — same precondition as apply. */
export const canRefund = canApply;

/**
 * Void is blocked the moment any of the credit has been consumed — the server
 * returns 400 ALREADY_APPLIED. So the button has to disappear, not fail.
 */
export const canVoid = (
  memo: Pick<CreditMemo, 'status' | 'amountApplied'>,
): boolean => memo.status === 'open' && memo.amountApplied < EPSILON;

/** Delete is admin-only and refused unless the memo is untouched. */
export const canDelete = canVoid;

/**
 * The most that can be applied to a given invoice: whichever runs out first,
 * the credit or the invoice's balance. This is the figure the app fixes and
 * we merely pre-fill.
 */
export const maxApplicable = (creditBalance: number, invoiceBalance: number): number =>
  Math.max(0, Math.min(creditBalance, invoiceBalance));
