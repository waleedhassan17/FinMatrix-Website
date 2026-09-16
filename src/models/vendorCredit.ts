// ═══════════════════════════════════════════════════════
// FinMatrix Web — Vendor Credit model
// ═══════════════════════════════════════════════════════
// The AP mirror of a credit memo: the supplier owes US money, because goods went
// back or a bill overcharged. The credit is then applied against their bills.
//
// WRITTEN AGAINST THE BACKEND DTO, NOT THE MOBILE APP. The app sends only
// `{description, amount, itemId?, quantity?}` and models the credit with no
// subtotal and no tax at all — but `VendorCreditLineDto` accepts two more fields
// and the entity stores `subtotal` + `taxAmount` alongside `total`:
//
//   taxRate    percent of input tax to reverse out of Sales Tax Recoverable
//              (account 1300) — the tax that was claimed on the original bill.
//              Omitting it credits the net only and leaves the input tax
//              overstated, which is a real reporting error, not a nicety.
//   accountId  the expense account a NON-STOCK line credits. Optional: the
//              server falls back to Cost of Goods Sold. A line naming an item
//              posts to Inventory (1200) instead and ignores this.
//
// There is still no refund — a credit memo can be paid back in cash, a vendor
// credit can only be applied or voided — so `canRefund` has no counterpart.

import { lineTaxError } from '@/models/taxRate';
import { Decimal, toDecimal } from '@/utils/money';

export type VendorCreditStatus = 'open' | 'applied' | 'closed' | 'void';

/** A line as it reads back. `amount` is NET; the wire field is `amount`. */
export interface VendorCreditLine {
  id: string;
  accountId: string;
  itemId: string;
  itemName: string;
  description: string;
  quantity: number;
  amount: number;
  taxRate: number;
  lineOrder: number;
}

export interface VendorCredit {
  id: string;
  companyId: string;
  /** Server-generated, and nullable until it is. Never sent. */
  vendorCreditNumber: string;
  vendorId: string;
  vendorName: string;
  date: string;
  originalBillId: string | null;
  reason: string;
  status: VendorCreditStatus;
  lines: VendorCreditLine[];
  /** The invariant the entity documents: total = subtotal + taxAmount. */
  subtotal: number;
  taxAmount: number;
  total: number;
  /** How much of the credit has been consumed by bills. */
  amountApplied: number;
  /** What is left. The invariant is `balance = total - amountApplied`. */
  balance: number;
  createdAt: string;
  updatedAt: string;
}

/** One row of the editor. Every figure is a string — it is an input. */
export interface VendorCreditFormLine {
  /** Client-only React key. Never sent. */
  id: string;
  itemId: string;
  accountId: string;
  description: string;
  quantity: string;
  /** Net, excluding tax. */
  amount: string;
  taxRate: string;
}

export interface VendorCreditFormData {
  vendorId: string;
  date: string;
  reason: string;
  lines: VendorCreditFormLine[];
}

export const VENDOR_CREDIT_STATUS_LABELS: Record<VendorCreditStatus, string> = {
  open: 'Open',
  applied: 'Applied',
  closed: 'Closed',
  void: 'Void',
};

let lineSeq = 0;

export const freshVendorCreditLine = (): VendorCreditFormLine => {
  lineSeq += 1;
  return {
    id: `vcl_${lineSeq}`,
    itemId: '',
    accountId: '',
    description: '',
    quantity: '',
    amount: '',
    taxRate: '0',
  };
};

/**
 * What a returned item is worth: quantity × the item's CARRYING cost.
 *
 * Cost, not selling price — this is stock going back, and the server relieves
 * inventory by exactly this figure. Returned as a 2-dp string because that is
 * what the payload sends and what the input holds.
 */
export const itemLineAmount = (quantity: string, unitCost: number): string =>
  toDecimal(quantity).times(toDecimal(unitCost)).toDecimalPlaces(2).toFixed(2);

export interface VendorCreditTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

/**
 * Tax is charged per line on that line's own net amount — the same shape as a
 * bill, and the reason neither document has a document-level tax rate.
 */
export const computeVendorCreditTotals = (
  lines: readonly VendorCreditFormLine[],
): VendorCreditTotals => {
  let subtotal = new Decimal(0);
  let taxAmount = new Decimal(0);

  for (const line of lines) {
    const net = toDecimal(line.amount);
    subtotal = subtotal.plus(net);
    taxAmount = taxAmount.plus(net.times(toDecimal(line.taxRate)).dividedBy(100));
  }

  // The total comes off the UNROUNDED tax, which is how the server computes it
  // (`subtotal.plus(tax)` at 4 dp). Rounding tax first and then adding can land
  // a cent away from what actually posts.
  return {
    subtotal: subtotal.toDecimalPlaces(2).toNumber(),
    taxAmount: taxAmount.toDecimalPlaces(2).toNumber(),
    total: subtotal.plus(taxAmount).toDecimalPlaces(2).toNumber(),
  };
};

/** Lines worth sending: a description and a positive amount. */
export const usableVendorCreditLines = (
  lines: readonly VendorCreditFormLine[],
): VendorCreditFormLine[] =>
  lines.filter(
    (line) => line.description.trim() !== '' && toDecimal(line.amount).greaterThan(0),
  );

/**
 * Why the editor will not submit. Empty string means it will.
 *
 * A line carrying an amount but no description is called out rather than
 * silently dropped — the mobile app drops it, which loses a figure the user
 * typed without ever saying so.
 */
export const validateVendorCreditLines = (
  lines: readonly VendorCreditFormLine[],
): string => {
  const usable = usableVendorCreditLines(lines);
  if (usable.length === 0) {
    return 'Add at least one line with a description and an amount.';
  }

  const amountWithoutDescription = lines.some(
    (line) =>
      line.description.trim() === '' && toDecimal(line.amount).greaterThan(0),
  );
  if (amountWithoutDescription) {
    return 'Every line with an amount needs a description.';
  }

  // The DTO makes quantity optional, but the service relieves stock by it — a
  // returned item with no quantity would take nothing off the shelf.
  const itemWithoutQuantity = lines.some(
    (line) => line.itemId !== '' && !toDecimal(line.quantity).greaterThan(0),
  );
  if (itemWithoutQuantity) {
    return 'A returned item needs a quantity.';
  }

  const taxError = lineTaxError(lines);
  if (taxError) return taxError;

  if (computeVendorCreditTotals(usable).total <= 0) {
    return 'The credit total must be more than zero.';
  }

  return '';
};

/**
 * Money comparisons use a small epsilon rather than `> 0`.
 *
 * Balances are 4-dp decimals, so a fully-consumed credit can land on 0.0001
 * through rounding. The app uses the same 0.01 threshold.
 */
const EPSILON = 0.01;

/** Can this credit still be put against a bill? */
export const canApply = (
  credit: Pick<VendorCredit, 'balance' | 'status'>,
): boolean =>
  credit.balance > EPSILON &&
  credit.status !== 'void' &&
  credit.status !== 'closed';

/**
 * Void is blocked the moment any of the credit has been consumed — the server
 * returns ALREADY_APPLIED. So the button has to disappear, not fail.
 */
export const canVoid = (
  credit: Pick<VendorCredit, 'status' | 'amountApplied'>,
): boolean => credit.status === 'open' && credit.amountApplied < EPSILON;

/** Delete is admin-only and refused unless the credit is untouched. */
export const canDelete = canVoid;

/**
 * The most that can go against a given bill: whichever runs out first, the
 * credit or the bill's balance.
 */
export const maxApplicable = (
  creditBalance: number,
  billBalance: number,
): number => Math.max(0, Math.min(creditBalance, billBalance));
