// ═══════════════════════════════════════════════════════
// FinMatrix Web — Transaction document primitives
// ═══════════════════════════════════════════════════════
// Everything invoices, estimates, sales orders, credit memos, bills and
// purchase orders have in common: a customer or vendor, a list of priced
// lines, a discount, and a total.
//
// This lives apart from any one document type so the six forms cannot drift.
// The server computes all of these figures itself and is authoritative — what
// is here is the preview the user types against, and it has to agree.

import Decimal from 'decimal.js';

import { lineTaxError } from '@/models/taxRate';
import { toDecimal, type MoneyInput } from '@/utils/money';

export type DiscountType = 'percent' | 'amount' | 'none';

/**
 * A line as the form holds it: all strings, because every field is a text
 * input and because the server's DTOs are `@IsNumberString` anyway.
 */
/**
 * What a line is, when the company tracks inventory.
 *   item    — an inventory item (sales: relieves stock; purchases: adds stock)
 *   service — a typed sales line with no stock: a service or charge
 *   expense — a typed purchase line with no stock, billed to an expense account
 */
export type LineKind = 'item' | 'service' | 'expense';

export interface FormLineItem {
  /** Client-only key, for React and for targeting updates. Never sent. */
  id: string;
  /** Links the line to stock. Drives COGS and the stock decrement server-side. */
  itemId: string;
  /** Unset on companies without inventory, where every line is free text. */
  lineKind?: LineKind;
  /** Purchase expense lines only: the expense account the bill posts to. */
  accountId?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
}

let lineSeq = 0;
export const freshLine = (): FormLineItem => ({
  id: `line_${++lineSeq}_${Date.now()}`,
  itemId: '',
  description: '',
  quantity: '1',
  unitPrice: '',
  taxRate: '0',
});

export const DISCOUNT_TYPE_OPTIONS = [
  { label: 'No discount', value: 'none' as const },
  { label: 'Percentage', value: 'percent' as const },
  { label: 'Fixed amount', value: 'amount' as const },
];

// ─── Totals ─────────────────────────────────────────────────────────────

export interface DocumentTotals {
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
}

const money = (d: Decimal): number => d.toDecimalPlaces(2).toNumber();

/**
 * Compute a document's totals, matching the server exactly.
 *
 * The same arithmetic runs in InvoicesService, EstimatesService and
 * SalesOrdersService, so one implementation serves all three. Two rules are
 * easy to get wrong and expensive to get wrong:
 *
 *  1. **Tax is charged on the pre-discount base.** A discount reduces what is
 *     owed but not what is taxed, so tax is summed per line from
 *     `qty × price × rate`, never from the discounted subtotal.
 *
 *  2. **The discount is clamped to the subtotal.** The app's invoice form does
 *     not clamp, so entering a discount larger than the subtotal previews a
 *     negative total there while the server posts zero. (Its estimate form
 *     clamps but does not round; its invoice form rounds but does not clamp.)
 *     We do both, which is what the server does.
 *
 * Decimal throughout, so the displayed components always sum to the displayed
 * total — the app computes its total from unrounded values while showing
 * rounded ones, and the two need not agree.
 */
export const computeTotals = (
  lines: Array<{ quantity: MoneyInput; unitPrice: MoneyInput; taxRate: MoneyInput }>,
  discountType: DiscountType,
  discountValue: MoneyInput,
): DocumentTotals => {
  let subtotal = new Decimal(0);
  let taxAmount = new Decimal(0);

  for (const line of lines) {
    const lineAmount = toDecimal(line.quantity).times(toDecimal(line.unitPrice));
    subtotal = subtotal.plus(lineAmount);
    taxAmount = taxAmount.plus(
      lineAmount.times(toDecimal(line.taxRate)).dividedBy(100),
    );
  }

  const value = toDecimal(discountValue);
  let discountAmount =
    discountType === 'percent'
      ? subtotal.times(value).dividedBy(100)
      : discountType === 'amount'
        ? value
        : new Decimal(0);

  if (discountAmount.greaterThan(subtotal)) discountAmount = subtotal;
  if (discountAmount.isNegative()) discountAmount = new Decimal(0);

  return {
    subtotal: money(subtotal),
    taxAmount: money(taxAmount),
    discountAmount: money(discountAmount),
    total: money(subtotal.minus(discountAmount).plus(taxAmount)),
  };
};

/** A single line's displayed total: qty × price, tax excluded. */
export const lineAmountOf = (line: {
  quantity: MoneyInput;
  unitPrice: MoneyInput;
}): number => money(toDecimal(line.quantity).times(toDecimal(line.unitPrice)));

// ─── Shared validation ──────────────────────────────────────────────────

/**
 * The line checks every document form makes. Returns a message, or null.
 *
 * The server accepts a line with an empty description (`@IsString()` with no
 * MinLength) and would happily store it, so this is the only thing stopping a
 * blank row reaching a customer's invoice.
 */
export const validateLines = (
  lines: FormLineItem[],
  totals: DocumentTotals,
): string | null => {
  if (lines.length === 0) return 'At least one line item is required';
  const incomplete = lines.some(
    (l) =>
      !l.description.trim() ||
      !(parseFloat(l.quantity) > 0) ||
      !(parseFloat(l.unitPrice) > 0),
  );
  if (incomplete) return 'Every line needs a description, a quantity and a rate';
  const taxError = lineTaxError(lines);
  if (taxError) return taxError;
  // The server refuses to post a zero-total document; catching it here saves a
  // round trip and a confusing error.
  if (totals.total <= 0) return 'The total must be above zero';
  return null;
};

/**
 * In a company that tracks inventory, every sales line is either a stock item
 * or a declared service/charge. A typed product — "Roar-X Drinks", not in the
 * catalogue — used to save, and invoicing it posted revenue with no cost and
 * moved no stock. The server refuses it (LINE_ITEM_REQUIRED); this says so
 * before the round trip.
 */
export const validateSalesLineKinds = (
  lines: FormLineItem[],
  inventoryEnabled: boolean,
): string | null => {
  if (!inventoryEnabled) return null;
  const index = lines.findIndex((l) => (l.lineKind ?? 'item') === 'item' && !l.itemId);
  return index === -1
    ? null
    : `Line ${index + 1}: pick the inventory item it sells, or make it a service / charge line.`;
};

// ─── Dates ──────────────────────────────────────────────────────────────

/** Today as `YYYY-MM-DD`, the only date format the API accepts. */
export const isoToday = (): string => isoDate(new Date());

export const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

export const addDays = (iso: string, days: number): string => {
  // Parsed at local midnight rather than as a bare date string: `new
  // Date('2026-09-10')` is UTC, which reads as the previous day in PKT.
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
};
