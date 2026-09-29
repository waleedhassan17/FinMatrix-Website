// ═══════════════════════════════════════════════════════
// FinMatrix Web — An inventory item's purchase orders
// ═══════════════════════════════════════════════════════
// The item page's "Create PO" and its Purchase orders tab, as the app has them.
// GET /purchase-orders?itemId= returns the orders with a line for the item,
// lines included; these helpers read this item's lines off them.

import type { ApprovalRequest } from '@/models/approval';
import { freshLine, type FormLineItem } from '@/models/document';
import type { InventoryItem } from '@/models/inventory';
import type { PurchaseOrder, PurchaseOrderStatus } from '@/models/purchaseOrder';
import { toDecimal } from '@/utils/money';

/** Purchase orders with at least one line for the item. */
export const purchaseOrdersForItem = (pos: PurchaseOrder[], itemId: string): PurchaseOrder[] =>
  itemId ? pos.filter((po) => po.lines.some((l) => l.itemId === itemId)) : [];

/** Ordered and received on this item's lines only — not the order's total. */
export const itemLineQuantities = (
  po: PurchaseOrder,
  itemId: string,
): { ordered: number; received: number } => {
  let ordered = toDecimal(0);
  let received = toDecimal(0);
  for (const l of po.lines) {
    if (l.itemId !== itemId) continue;
    ordered = ordered.plus(toDecimal(l.quantity));
    received = received.plus(toDecimal(l.receivedQuantity));
  }
  return { ordered: ordered.toNumber(), received: received.toNumber() };
};

/** Sent to the supplier and still waiting on goods. Drafts have not been ordered. */
const OPEN_STATUSES: ReadonlySet<PurchaseOrderStatus> = new Set(['sent', 'partial']);

/**
 * What is still to arrive for the item, and on how many orders.
 *
 * Computed from the orders because the item's own `quantityOnOrder` column is
 * only ever written as zero by the server — the app dropped that tile for the
 * same reason.
 */
export const onOrderForItem = (
  pos: PurchaseOrder[],
  itemId: string,
): { quantity: number; orders: number } => {
  let quantity = toDecimal(0);
  let orders = 0;
  for (const po of pos) {
    if (!OPEN_STATUSES.has(po.status)) continue;
    const { ordered, received } = itemLineQuantities(po, itemId);
    const remaining = toDecimal(ordered).minus(received);
    if (remaining.greaterThan(0)) {
      quantity = quantity.plus(remaining);
      orders += 1;
    }
  }
  return { quantity: quantity.toNumber(), orders };
};

/**
 * A staff member's own requests for a PO on this item, still waiting on the
 * owner. Not purchase orders yet, so they have nothing to open.
 *
 * `approving` is excluded: it is a claim held while the server posts the
 * request, and the PO may already exist. The payload is the original request
 * body, typed as an open record, so nothing about its shape is assumed.
 */
export const pendingPORequestsForItem = (
  requests: ApprovalRequest[],
  itemId: string,
): ApprovalRequest[] =>
  requests.filter((req) => {
    if (!req || req.type !== 'po' || req.status !== 'pending') return false;
    const lines = (req.payload as { lines?: unknown } | null)?.lines;
    return (
      Array.isArray(lines) &&
      lines.some((l) => (l as { itemId?: unknown } | null)?.itemId === itemId)
    );
  });

/**
 * The first line of a PO raised from an item, as the app seeds it: the item,
 * its **cost** (not its selling price), and its reorder quantity — at least one.
 */
export const poPrefillLine = (
  item: Pick<InventoryItem, 'id' | 'name' | 'description' | 'unitCost' | 'reorderQuantity'>,
): FormLineItem => ({
  ...freshLine(),
  itemId: item.id,
  description: item.description || item.name,
  unitPrice: String(item.unitCost),
  quantity: String(Math.max(item.reorderQuantity, 1)),
});
