// ═══════════════════════════════════════════════════════
// FinMatrix Web — Sales Order model
// ═══════════════════════════════════════════════════════

import Decimal from 'decimal.js';

import type { DiscountType, FormLineItem } from '@/models/document';
import type { DocumentLine } from '@/serializers/documentLines';
import { toDecimal } from '@/utils/money';

export type SalesOrderStatus =
  | 'open'
  | 'partial'
  | 'fulfilled'
  | 'invoiced'
  | 'cancelled';

/** A sales-order line carries how much of it has shipped. */
export interface SalesOrderLine extends DocumentLine {
  /** Cumulative quantity shipped so far. The wire field of the same name. */
  quantityFulfilled: number;
}

export interface SalesOrder {
  id: string;
  companyId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  orderDate: string;
  expectedDate: string | null;
  status: SalesOrderStatus;
  lines: SalesOrderLine[];
  subtotal: number;
  taxAmount: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  total: number;
  notes: string;
  /** Set when this order came from an estimate. */
  sourceEstimateId: string | null;
  /** Set once invoiced — use it to deep-link. */
  invoiceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalesOrderFormData {
  customerId: string;
  customerName: string;
  orderDate: string;
  expectedDate: string;
  lines: FormLineItem[];
  discountType: DiscountType;
  discountValue: string;
  notes: string;
}

export const SALES_ORDER_STATUS_LABELS: Record<SalesOrderStatus, string> = {
  open: 'Open',
  partial: 'Partial',
  fulfilled: 'Fulfilled',
  invoiced: 'Invoiced',
  cancelled: 'Cancelled',
};

/** Server refuses PATCH on `invoiced` and `cancelled` (400 CANNOT_EDIT). */
export const isSalesOrderEditable = (status: SalesOrderStatus): boolean =>
  status !== 'invoiced' && status !== 'cancelled';

/**
 * May the LINES be edited?
 *
 * Stricter than the server on purpose. `SalesOrdersService.update` replaces
 * lines by deleting and reinserting them, which resets every line's
 * `quantityFulfilled` to zero and mints new line ids — silently destroying
 * fulfilment progress, with no warning and no error. The server allows it on a
 * `partial` or `fulfilled` order; we do not.
 */
export const areLinesEditable = (status: SalesOrderStatus): boolean =>
  status === 'open';

export const isFulfillable = (status: SalesOrderStatus): boolean =>
  status !== 'invoiced' && status !== 'cancelled';

/** `convert-to-invoice` is refused only on `invoiced` and `cancelled`. */
export const isInvoiceable = (status: SalesOrderStatus): boolean =>
  status !== 'invoiced' && status !== 'cancelled';

// ─── Fulfilment ─────────────────────────────────────────────────────────

export interface FulfilDraft {
  lineId: string;
  description: string;
  ordered: number;
  alreadyFulfilled: number;
  /** What the user is shipping now. Defaults to the remainder. */
  shipping: string;
}

export const remainingOf = (line: SalesOrderLine): number =>
  Math.max(
    toDecimal(line.quantity).minus(toDecimal(line.quantityFulfilled)).toNumber(),
    0,
  );

export const buildFulfilDrafts = (lines: SalesOrderLine[]): FulfilDraft[] =>
  lines.map((l) => ({
    lineId: l.id,
    description: l.description || l.itemName,
    ordered: l.quantity,
    alreadyFulfilled: l.quantityFulfilled,
    shipping: String(remainingOf(l)),
  }));

export interface FulfilLinePayload {
  lineId: string;
  quantityFulfilled: string;
}

/**
 * Turn the dialog's drafts into the fulfil payload.
 *
 * **`quantityFulfilled` is CUMULATIVE, not a delta.** The server does
 * `line.quantityFulfilled = value` — a straight assignment — so sending "3"
 * twice leaves the line at 3, not 6. What goes on the wire is
 * `alreadyFulfilled + shipping`.
 *
 * Only lines actually being shipped are sent: omitted lines keep their current
 * value, so including a zero-shipment line is harmless but noisy, and sending
 * `"0"` for one would actively reset it.
 */
export const fulfilDraftsToPayload = (
  drafts: FulfilDraft[],
): FulfilLinePayload[] =>
  drafts
    .filter((d) => (parseFloat(d.shipping) || 0) > 0)
    .map((d) => ({
      lineId: d.lineId,
      quantityFulfilled: new Decimal(d.alreadyFulfilled)
        .plus(toDecimal(d.shipping))
        .toString(),
    }));

/**
 * Which drafts ship more than was ordered?
 *
 * The server refuses the whole call with 400 OVER_FULFILLED, and because the
 * loop runs inside a transaction a single bad line rolls back every other
 * line too. Catching it here keeps that from being the user's first feedback.
 */
export const overFulfilledDrafts = (drafts: FulfilDraft[]): FulfilDraft[] =>
  drafts.filter((d) =>
    new Decimal(d.alreadyFulfilled)
      .plus(toDecimal(d.shipping))
      .greaterThan(toDecimal(d.ordered)),
  );

/** 0–100, for a progress bar. */
export const fulfilmentPercent = (line: SalesOrderLine): number => {
  if (!(line.quantity > 0)) return 0;
  const pct = toDecimal(line.quantityFulfilled)
    .dividedBy(toDecimal(line.quantity))
    .times(100)
    .toNumber();
  return Math.max(0, Math.min(100, pct));
};

/** How many lines are fully shipped, for the list column. */
export const fulfilledLineCount = (order: SalesOrder): number =>
  order.lines.filter((l) => l.quantityFulfilled >= l.quantity).length;

export const isFullyFulfilled = (order: SalesOrder): boolean =>
  order.lines.length > 0 &&
  order.lines.every((l) => l.quantityFulfilled >= l.quantity);
