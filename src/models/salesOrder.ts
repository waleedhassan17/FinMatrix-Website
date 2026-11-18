// ═══════════════════════════════════════════════════════
// FinMatrix Web — Sales Order model
// ═══════════════════════════════════════════════════════

import Decimal from 'decimal.js';

import type { DiscountType, FormLineItem } from '@/models/document';
import type { DocumentLine } from '@/serializers/documentLines';
import { toDecimal } from '@/utils/money';

/**
 * open       nothing shipped or invoiced yet
 * partial    some shipped or invoiced, more to come
 * fulfilled  everything shipped, not all of it invoiced yet
 * invoiced   everything invoiced (an order invoiced in full before partial
 *            invoicing existed may still have goods to deliver)
 * closed     short-closed: the rest will not ship (can be reopened)
 * cancelled  withdrawn before anything shipped or was invoiced
 */
export type SalesOrderStatus =
  | 'open'
  | 'partial'
  | 'fulfilled'
  | 'invoiced'
  | 'closed'
  | 'cancelled';

/** A sales-order line carries how much of it has shipped and been invoiced. */
export interface SalesOrderLine extends DocumentLine {
  /** Cumulative quantity shipped so far. The wire field of the same name. */
  quantityFulfilled: number;
  /** Billed on the order's live invoices. */
  quantityInvoiced: number;
  /** Shipped but not invoiced yet — what the next invoice bills. */
  toInvoice: number;
  /** Not delivered yet (0 once the order is closed or cancelled). */
  toShip: number;
  /** Stock lines: on hand now, and the part of this line stock cannot cover. */
  onHand: number | null;
  backorderQty: number;
}

/** One invoice raised from the order (an order can have several). */
export interface SalesOrderInvoiceRef {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  total: number;
  balance: number;
  status: string;
}

/** What the next invoice raised from the order would bill. */
export interface SalesOrderNextInvoice {
  /**
   * `ship_and_invoice`: nothing has shipped yet, so invoicing ships and bills
   * the whole order in one step. `shipped`: it bills what has shipped and is
   * not invoiced yet.
   */
  mode: 'ship_and_invoice' | 'shipped';
  /** After it, every line is billed in full. */
  isFinal: boolean;
  lines: Array<{
    salesOrderLineId: string;
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
  }>;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

export interface SalesOrderTotals {
  ordered: number;
  shipped: number;
  invoiced: number;
  toInvoice: number;
  toShip: number;
  /** Billed ahead of delivery (orders invoiced in full before partial invoicing). */
  billedNotShipped: number;
}

/** What may be done with the order now — decided by the server. */
export interface SalesOrderActions {
  ship: boolean;
  invoice: boolean;
  close: boolean;
  reopen: boolean;
  cancel: boolean;
  delete: boolean;
  edit: boolean;
  editLines: boolean;
}

/** A line short of stock, as the server reports it when a backorder needs confirming. */
export interface BackorderLine {
  itemId: string;
  name: string;
  sku: string;
  requested: number;
  available: number;
  shortfall: number;
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
  /** The latest live invoice raised from it. `invoices` lists them all. */
  invoiceId: string | null;
  /** Every invoice raised from this order, oldest first (detail only). */
  invoices: SalesOrderInvoiceRef[];
  /** What invoicing now would bill; null when there is nothing to bill (detail only). */
  nextInvoice: SalesOrderNextInvoice | null;
  /** Unit totals across the lines (detail only). */
  totals: SalesOrderTotals | null;
  /** What may be done now (detail only; list rows fall back to the status). */
  actions: SalesOrderActions | null;
  /** Set when a delivery created this order: it ships and invoices it itself. */
  deliveryId: string | null;
  deliveryReference: string | null;
  createdAt: string;
  updatedAt: string;
  /** Some stock line is short: the order holds goods on backorder. */
  hasBackorder: boolean;
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
  closed: 'Closed',
  cancelled: 'Cancelled',
};

const isWorking = (status: SalesOrderStatus): boolean =>
  status === 'open' || status === 'partial' || status === 'fulfilled';

/** Server refuses PATCH on `invoiced`, `closed` and `cancelled` (400 CANNOT_EDIT). */
export const isSalesOrderEditable = (status: SalesOrderStatus): boolean =>
  isWorking(status);

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
  isWorking(status);

/** `convert-to-invoice` is refused on `invoiced`, `closed` and `cancelled`. */
export const isInvoiceable = (status: SalesOrderStatus): boolean =>
  isWorking(status);

/**
 * What may be done with the order now. The detail response carries the
 * server's own answer — use it; a list row (or an older server) falls back to
 * the status alone.
 */
export const salesOrderActions = (order: SalesOrder): SalesOrderActions => {
  if (order.actions) return order.actions;
  const s = order.status;
  const working = isWorking(s);
  return {
    ship: working && !isFullyFulfilled(order),
    invoice: working,
    close: s === 'partial',
    reopen: s === 'closed',
    cancel: s === 'open',
    delete: s === 'open',
    edit: working,
    editLines: s === 'open',
  };
};

/** Units billed but not delivered yet — orders invoiced in full the old way. */
export const billedNotShipped = (order: SalesOrder): number =>
  order.totals?.billedNotShipped ??
  order.lines.reduce(
    (sum, l) => sum + Math.max(l.quantityInvoiced - l.quantityFulfilled, 0),
    0,
  );

/** Units still to deliver on the order. */
export const unitsToShip = (order: SalesOrder): number =>
  order.totals?.toShip ??
  order.lines.reduce((sum, l) => sum + remainingOf(l), 0);

// ─── Fulfilment ─────────────────────────────────────────────────────────

export interface FulfilDraft {
  lineId: string;
  description: string;
  ordered: number;
  alreadyFulfilled: number;
  /** Already billed — shown so the user sees which goods are paid for. */
  invoiced: number;
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
    invoiced: l.quantityInvoiced ?? 0,
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
