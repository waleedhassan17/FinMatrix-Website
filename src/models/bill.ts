// ═══════════════════════════════════════════════════════
// FinMatrix Web — Bill model
// ═══════════════════════════════════════════════════════
// A bill is NOT the mirror image of an invoice.
//
// An invoice line sells an inventory item: it carries `itemId`, moves stock and
// posts COGS. A bill line is an **expense line**: it carries `accountId` and
// nothing else. There is no inventory linkage on a bill anywhere, and the
// server refuses to fake one — posting a bill against a PO that has received
// stock, without a line clearing GRNI, returns 400 BILL_PO_VIA_RECEIPT and
// tells you to use the purchase order's own Convert-to-Bill instead.
//
// So bills get their own line shape rather than reusing FormLineItem.

import Decimal from 'decimal.js';

import { lineTaxError } from '@/models/taxRate';
import { toDecimal, type MoneyInput } from '@/utils/money';

export { addDays, isoDate, isoToday } from '@/models/document';

/**
 * `draft | open` on create; the rest are reached by paying or posting.
 *
 * `overdue` is the odd one: it is **never stored**. BillsService derives it
 * when returning a bill and the column keeps whatever it had, which is why
 * `GET /bills?status=overdue` can only ever return an empty list.
 */
export type BillStatus = 'draft' | 'open' | 'partial' | 'paid' | 'overdue' | 'void';

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  partial: 'Partial',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
};

/**
 * The server's own derivation, reproduced exactly.
 *
 * `balance > 0 && dueDate < today && status ∈ {open, partial}`. It runs here
 * too because the Overdue tab has to filter client-side (the server can never
 * return that status) and because `/vendors/:id/bills` does not apply it at
 * all — without this the same bill would read `open` on the vendor page and
 * `overdue` in the bills list.
 */
export const deriveBillStatus = (
  status: BillStatus,
  balance: number,
  dueDate: string,
  today: string,
): BillStatus =>
  balance > 0 &&
  dueDate !== '' &&
  dueDate < today &&
  (status === 'open' || status === 'partial')
    ? 'overdue'
    : status;

export interface BillLine {
  id: string;
  accountId: string;
  accountName: string;
  description: string;
  /** A percentage, e.g. 17 means 17%. */
  taxRate: number;
  /** The line's own figure. Not qty × price — a bill line has neither. */
  amount: number;
}

export interface Bill {
  id: string;
  companyId: string;
  /**
   * The **vendor's** number, supplied by whoever enters the bill. Unlike every
   * other document in the system it is not generated and not unique-constrained
   * — two bills may carry the same number and the server will not object.
   */
  billNumber: string;
  vendorId: string;
  vendorName: string;
  /** The wire calls this `billDate`. */
  issueDate: string;
  dueDate: string;
  status: BillStatus;
  purchaseOrderId: string;
  lines: BillLine[];
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balance: number;
  /** The wire calls this `memo`. */
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Form ───────────────────────────────────────────────────────────────

export interface BillFormLine {
  /** Client-only key. Never sent. */
  id: string;
  accountId: string;
  description: string;
  amount: string;
  taxRate: string;
}

let lineSeq = 0;
export const freshBillLine = (accountId = ''): BillFormLine => ({
  id: `bill_line_${++lineSeq}_${Date.now()}`,
  accountId,
  description: '',
  amount: '',
  taxRate: '0',
});

export interface BillFormData {
  vendorId: string;
  vendorName: string;
  billNumber: string;
  issueDate: string;
  dueDate: string;
  lines: BillFormLine[];
  notes: string;
}

// ─── Totals ─────────────────────────────────────────────────────────────

export interface BillTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

const money = (d: Decimal): number => d.toDecimalPlaces(2).toNumber();

/**
 * Bill totals. Simpler than a sales document: there is **no discount** on a
 * bill — the DTO has no field for one — so the subtotal is the sum of the line
 * amounts and tax is charged on each line's own amount.
 */
export const computeBillTotals = (
  lines: Array<{ amount: MoneyInput; taxRate: MoneyInput }>,
): BillTotals => {
  let subtotal = new Decimal(0);
  let taxAmount = new Decimal(0);

  for (const line of lines) {
    const amount = toDecimal(line.amount);
    subtotal = subtotal.plus(amount);
    taxAmount = taxAmount.plus(amount.times(toDecimal(line.taxRate)).dividedBy(100));
  }

  return {
    subtotal: money(subtotal),
    taxAmount: money(taxAmount),
    total: money(subtotal.plus(taxAmount)),
  };
};

/**
 * Line checks. Every line needs an account, because without one the server
 * falls back to the company's COGS account and refuses the whole bill with
 * ACCOUNT_REQUIRED if that lookup fails — a failure with no obvious cause.
 */
export const validateBillLines = (
  lines: BillFormLine[],
  totals: BillTotals,
): string | null => {
  if (lines.length === 0) return 'At least one line is required';
  if (lines.some((l) => !l.accountId)) return 'Every line needs an account';
  if (lines.some((l) => !l.description.trim()))
    return 'Every line needs a description';
  if (lines.some((l) => !(parseFloat(l.amount) > 0)))
    return 'Every line needs an amount above zero';
  const taxError = lineTaxError(lines);
  if (taxError) return taxError;
  if (totals.total <= 0) return 'The total must be above zero';
  return null;
};

/** Only drafts can be edited; anything posted is refused server-side. */
export const isBillEditable = (status: BillStatus): boolean => status === 'draft';

/**
 * A bill can be paid once it is posted and still owes something. A draft is
 * refused outright with BILL_NOT_POSTED, so the action is hidden rather than
 * offered and failed.
 */
export const isBillPayable = (bill: Pick<Bill, 'status' | 'balance'>): boolean =>
  bill.status !== 'draft' && bill.status !== 'void' && bill.balance > 0;
