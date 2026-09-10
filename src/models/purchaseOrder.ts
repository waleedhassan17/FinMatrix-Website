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
  draft: 'Draft',
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
  /** Set once converted — use it to deep-link rather than convert again. */
  billId: string;
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
      return ['closed'];
    case 'partial':
    case 'received':
      return ['closed'];
    default:
      return [];
  }
};

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
 * The value a Convert-to-Bill would raise.
 *
 * `create-bill` bills **only what was received** — received quantity × unit
 * cost — not the ordered value. Showing the ordered total on that confirmation
 * would misstate what the user is about to owe.
 */
export const receivedValue = (po: PurchaseOrder): number =>
  po.lines
    .reduce(
      (acc, l) => acc.plus(toDecimal(l.receivedQuantity).times(toDecimal(l.unitPrice))),
      new Decimal(0),
    )
    .toDecimalPlaces(2)
    .toNumber();
