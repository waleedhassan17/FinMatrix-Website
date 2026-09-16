// ═══════════════════════════════════════════════════════
// FinMatrix Web — Purchase Order model
// ═══════════════════════════════════════════════════════

import Decimal from 'decimal.js';

import type { FormLineItem } from '@/models/document';
import type { DocumentLine } from '@/serializers/documentLines';
import { toDecimal } from '@/utils/money';

/**
 * The five statuses the column actually holds.
 *
 * There is no `partially_received` or `fully_received`, whatever the build
 * document says — and there are **no transition rules server-side at all**.
 * `PATCH /purchase-orders/:id/status` assigns the column and returns, so
 * `received → draft` is accepted. Sane transitions are the client's job; see
 * `allowedTransitions` below.
 */
export type PurchaseOrderStatus =
  | 'draft'
  | 'sent'
  | 'partial'
  | 'received'
  | 'closed';

export const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  // An unsent draft is a purchase REQUISITION: a request to buy that nobody
  // outside the company has seen.
  draft: 'Requisition',
  sent: 'Sent',
  partial: 'Partial',
  received: 'Received',
  closed: 'Closed',
};

/**
 * A PO line orders a quantity at a cost — `orderedQty` / `unitCost`, not
 * `quantity` / `unitPrice`. The serializer maps them onto the shared
 * DocumentLine shape so one view component can draw every document, and
 * `receivedQty` rides alongside.
 */
export interface PurchaseOrderLine extends DocumentLine {
  /** Cumulative quantity received so far. The wire field is `receivedQty`. */
  receivedQuantity: number;
  /** Quantity already billed. A PO is billed per receipt: received − billed is billable. */
  billedQuantity: number;
  /** Expense lines: the account the bill posts to. */
  accountId: string;
}

/** A bill raised from this purchase order. */
export interface POBillRef {
  id: string;
  billNumber: string;
  billDate: string;
  total: number;
  balance: number;
  status: string;
}

export interface PurchaseOrder {
  id: string;
  companyId: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  orderDate: string;
  expectedDate: string;
  status: PurchaseOrderStatus;
  lines: PurchaseOrderLine[];
  subtotal: number;
  taxAmount: number;
  total: number;
  notes: string;
  /** The latest bill raised from this order, if any. */
  billId: string;
  /** Every bill raised from this order, oldest first. */
  bills: POBillRef[];
  /** Tax-inclusive — comparable with `total`, which includes tax. */
  receivedValueGross: number;
  billedValueGross: number;
  /** Received but not yet billed, tax-inclusive: what "Convert to bill" raises. */
  unbilledValueGross: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderFormData {
  vendorId: string;
  vendorName: string;
  orderDate: string;
  expectedDate: string;
  /** A PO has no discount, but otherwise takes the same line shape. */
  lines: FormLineItem[];
  notes: string;
}

/**
 * Which status changes the UI will offer.
 *
 * Entirely a client-side invention: the server enforces nothing. Going
 * backwards is excluded because stock and the GRNI journal entry have already
 * posted by the time a PO is `partial`, and moving the label back to `draft`
 * would make the paperwork disagree with the ledger without reversing anything.
 */
export const allowedTransitions = (
  status: PurchaseOrderStatus,
): PurchaseOrderStatus[] => {
  switch (status) {
    case 'draft':
      return ['sent'];
    case 'sent':
      return ['draft', 'closed'];
    case 'partial':
    case 'received':
      return ['closed'];
    case 'closed':
      return ['sent'];
    default:
      return [];
  }
};

/** A draft purchase order is a requisition until it is approved and sent. */
export const isRequisition = (po: Pick<PurchaseOrder, 'status'>): boolean => po.status === 'draft';

/**
 * May this PO be edited?
 *
 * **`draft` only** — stricter than the server, deliberately and importantly.
 * There is no UpdatePurchaseOrderDto: PATCH takes the full create DTO, and
 * `update()` runs `manager.delete(PurchaseOrderLine, …)` then rebuilds every
 * line with `receivedQty: '0'`, with no status guard of any kind. Inventory
 * and the GRNI entry stay posted, so editing a part-received PO silently
 * destroys the record of what actually arrived while leaving the stock behind.
 *
 * It is also gated on `purchaseOrder.edit`, which is `false` for staff — so a
 * staff member never sees the button and an admin only sees it on a draft.
 */
export const isPOEditable = (status: PurchaseOrderStatus): boolean =>
  status === 'draft';

/** Goods can arrive against anything that has been sent and is not closed. */
export const isReceivable = (status: PurchaseOrderStatus): boolean =>
  status === 'sent' || status === 'partial' || status === 'received';

// ─── Receiving ──────────────────────────────────────────────────────────

export interface ReceiptDraft {
  lineId: string;
  description: string;
  ordered: number;
  alreadyReceived: number;
  /** What arrived today. Defaults to the remainder. */
  arriving: string;
  /** A stock item: receiving it raises on-hand. An expense line moves no stock. */
  stock: boolean;
}

export const remainingOf = (line: PurchaseOrderLine): number =>
  Math.max(
    toDecimal(line.quantity).minus(toDecimal(line.receivedQuantity)).toNumber(),
    0,
  );

export const buildReceiptDrafts = (lines: PurchaseOrderLine[]): ReceiptDraft[] =>
  lines.map((l) => ({
    lineId: l.id,
    description: l.description || l.itemName,
    ordered: l.quantity,
    alreadyReceived: l.receivedQuantity,
    arriving: String(remainingOf(l)),
    stock: Boolean(l.itemId),
  }));

export interface ReceiptLinePayload {
  lineId: string;
  receivedQty: string;
}

/**
 * Turn the receiving drafts into the payload.
 *
 * **`receivedQty` is CUMULATIVE, not a delta** — exactly as sales-order
 * fulfilment is. The server assigns the value, then computes the stock movement
 * from the difference against what was there before. Sending today's delta
 * would make the *second* receipt compute a negative difference and quietly
 * claw stock back off the shelf.
 *
 * So what goes on the wire is `alreadyReceived + arriving`, and lines with
 * nothing arriving are **omitted** — sending `"0"` for one would reset it and
 * reverse the stock already booked in.
 */
export const receiptDraftsToPayload = (
  drafts: ReceiptDraft[],
): ReceiptLinePayload[] =>
  drafts
    .filter((d) => (parseFloat(d.arriving) || 0) > 0)
    .map((d) => ({
      lineId: d.lineId,
      receivedQty: new Decimal(d.alreadyReceived)
        .plus(toDecimal(d.arriving))
        .toString(),
    }));

/** Drafts receiving more than was ordered — refused server-side. */
export const overReceivedDrafts = (drafts: ReceiptDraft[]): ReceiptDraft[] =>
  drafts.filter((d) =>
    new Decimal(d.alreadyReceived)
      .plus(toDecimal(d.arriving))
      .greaterThan(toDecimal(d.ordered)),
  );

/** 0–100, for the progress bar on the detail page. */
export const receivedPercent = (line: PurchaseOrderLine): number => {
  if (!(line.quantity > 0)) return 0;
  const pct = toDecimal(line.receivedQuantity)
    .dividedBy(toDecimal(line.quantity))
    .times(100)
    .toNumber();
  return Math.max(0, Math.min(100, pct));
};

export const isFullyReceived = (po: PurchaseOrder): boolean =>
  po.lines.length > 0 &&
  po.lines.every((l) => l.receivedQuantity >= l.quantity);

export const hasAnyReceipt = (po: PurchaseOrder): boolean =>
  po.lines.some((l) => l.receivedQuantity > 0);

/**
 * The value a Convert-to-Bill would raise: goods received and not yet billed,
 * INCLUDING their purchase tax — the bill carries the tax, so the vendor is
 * owed (and paid) the gross amount. Server-computed.
 */
export const unbilledValue = (po: PurchaseOrder): number => po.unbilledValueGross;

/** Anything received that no bill covers yet. */
export const hasUnbilledReceipts = (po: PurchaseOrder): boolean =>
  po.lines.some((l) => l.receivedQuantity > l.billedQuantity);
