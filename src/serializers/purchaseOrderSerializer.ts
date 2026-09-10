// ═══════════════════════════════════════════════════════
// FinMatrix Web — Purchase Order Serializer
// ═══════════════════════════════════════════════════════

import type {
  PurchaseOrder,
  PurchaseOrderFormData,
  PurchaseOrderLine,
  PurchaseOrderStatus,
} from '@/models/purchaseOrder';
import { asRaw, str } from '@/serializers/documentLines';
import type { FormLineItem } from '@/models/document';
import { toNumber } from '@/utils/money';

/**
 * PO lines use their own vocabulary on the wire:
 *
 *   orderedQty   → quantity
 *   unitCost     → unitPrice
 *   lineTotal    → amount
 *   receivedQty  → receivedQuantity
 *
 * Mapping them onto the shared DocumentLine shape is what lets one DocumentView
 * and one LineItemRow serve purchase orders too — the labels change, the
 * arithmetic does not.
 */
const mapPOLine = (raw: unknown): PurchaseOrderLine => {
  const r = asRaw(raw);
  const item = asRaw(r.item ?? r.inventoryItem);
  return {
    id: str(r.id),
    itemId: str(r.itemId ?? r.inventoryItemId),
    itemName: str(item.name ?? r.itemName ?? r.description),
    description: str(r.description),
    quantity: toNumber((r.orderedQty ?? r.quantity) as never),
    unitPrice: toNumber((r.unitCost ?? r.unitPrice) as never),
    taxRate: toNumber(r.taxRate as never),
    amount: toNumber((r.lineTotal ?? r.amount) as never),
    receivedQuantity: toNumber((r.receivedQty ?? r.receivedQuantity) as never),
  };
};

export const mapPurchaseOrder = (raw: unknown): PurchaseOrder => {
  const r = asRaw(raw);
  const vendor = asRaw(r.vendor);
  const lines = Array.isArray(r.lines) ? r.lines : [];

  return {
    id: str(r.id),
    companyId: str(r.companyId),
    poNumber: str(r.poNumber ?? r.orderNumber),
    vendorId: str(r.vendorId),
    vendorName: str(vendor.companyName ?? vendor.name ?? r.vendorName),
    orderDate: str(r.orderDate),
    expectedDate: str(r.expectedDate),
    status: (str(r.status) || 'draft') as PurchaseOrderStatus,
    lines: lines.map(mapPOLine),
    subtotal: toNumber(r.subtotal as never),
    taxAmount: toNumber((r.taxAmount ?? r.taxTotal) as never),
    total: toNumber(r.total as never),
    notes: str(r.notes ?? r.memo),
    billId: str(r.billId),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
};

/**
 * `GET /purchase-orders` is flat — `{ data, pagination }` — so the envelope
 * keeps only `data` and the pagination is gone. First page only, as with bills
 * and invoices.
 */
export const purchaseOrderListSerializer = (payload: unknown): PurchaseOrder[] => {
  if (Array.isArray(payload)) return payload.map(mapPurchaseOrder);
  const d = asRaw(payload);
  const rows = Array.isArray(d.data)
    ? d.data
    : Array.isArray(d.purchaseOrders)
      ? (d.purchaseOrders as unknown[])
      : [];
  return rows.map(mapPurchaseOrder);
};

export const purchaseOrderSingleSerializer = (
  payload: unknown,
): PurchaseOrder | null => {
  if (!payload || Array.isArray(payload)) return null;
  const d = asRaw(payload);
  const raw = d.purchaseOrder ?? (d.id ? d : null);
  return raw ? mapPurchaseOrder(raw) : null;
};

// ═══════════════════════════════════════════════════════
// Form ↔ API
// ═══════════════════════════════════════════════════════

export interface POLineWritePayload {
  description: string;
  orderedQty: string;
  unitCost: string;
  taxRate: string;
  itemId?: string;
}

export interface PurchaseOrderWritePayload {
  vendorId: string;
  orderDate: string;
  lines: POLineWritePayload[];
  expectedDate?: string;
  notes?: string;
}

let importedSeq = 0;

export const purchaseOrderToFormData = (
  po: PurchaseOrder,
): PurchaseOrderFormData => ({
  vendorId: po.vendorId,
  vendorName: po.vendorName,
  orderDate: po.orderDate.slice(0, 10),
  expectedDate: po.expectedDate.slice(0, 10),
  lines: po.lines.map(
    (l): FormLineItem => ({
      id: l.id || `imported_${++importedSeq}`,
      itemId: l.itemId,
      description: l.description,
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
      taxRate: String(l.taxRate),
    }),
  ),
  notes: po.notes,
});

/**
 * Form → the create payload.
 *
 * The line fields are `orderedQty` and `unitCost`, all `@IsNumberString`. There
 * is **no discount** on a purchase order. `expectedDate` and `itemId` are
 * `@IsOptional()`, which skips only null and undefined — an empty string would
 * still reach `@IsDateString()` / `@IsUUID()` and 400 — so both are omitted
 * rather than sent blank.
 */
export const purchaseOrderFormToPayload = (
  form: PurchaseOrderFormData,
): PurchaseOrderWritePayload => ({
  vendorId: form.vendorId,
  orderDate: form.orderDate,
  lines: form.lines.map((l) => ({
    description: l.description.trim(),
    orderedQty: String(parseFloat(l.quantity) || 0),
    unitCost: String(parseFloat(l.unitPrice) || 0),
    taxRate: String(parseFloat(l.taxRate) || 0),
    ...(l.itemId ? { itemId: l.itemId } : {}),
  })),
  ...(form.expectedDate ? { expectedDate: form.expectedDate } : {}),
  ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
});
