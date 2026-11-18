// ═══════════════════════════════════════════════════════
// FinMatrix Web — Sales Order Serializer
// ═══════════════════════════════════════════════════════

import type { DiscountType } from '@/models/document';
import type {
  SalesOrder,
  SalesOrderActions,
  SalesOrderFormData,
  SalesOrderInvoiceRef,
  SalesOrderLine,
  SalesOrderNextInvoice,
  SalesOrderStatus,
  SalesOrderTotals,
} from '@/models/salesOrder';
import {
  asRaw,
  linesToForm,
  linesToPayload,
  mapDocumentLine,
  str,
  type DocumentLineWritePayload,
} from '@/serializers/documentLines';
import { toNumber } from '@/utils/money';

const mapSalesOrderLine = (raw: unknown): SalesOrderLine => {
  const r = asRaw(raw);
  const stock = r.stock ? asRaw(r.stock) : null;
  return {
    ...mapDocumentLine(raw),
    quantityFulfilled: toNumber(r.quantityFulfilled as never),
    quantityInvoiced: toNumber((r.quantityInvoiced ?? 0) as never),
    toInvoice: toNumber((r.toInvoice ?? 0) as never),
    toShip: toNumber((r.toShip ?? 0) as never),
    onHand: stock ? toNumber(stock.onHand as never) : null,
    backorderQty: toNumber((r.backorderQty ?? 0) as never),
  };
};

const mapInvoiceRef = (raw: unknown): SalesOrderInvoiceRef => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    invoiceNumber: str(r.invoiceNumber),
    invoiceDate: str(r.invoiceDate),
    dueDate: str(r.dueDate),
    total: toNumber(r.total as never),
    balance: toNumber(r.balance as never),
    status: str(r.status),
  };
};

const mapNextInvoice = (raw: unknown): SalesOrderNextInvoice | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = asRaw(raw);
  const lines = Array.isArray(r.lines) ? r.lines : [];
  return {
    mode: str(r.mode) === 'ship_and_invoice' ? 'ship_and_invoice' : 'shipped',
    isFinal: r.isFinal === true,
    lines: lines.map((l) => {
      const x = asRaw(l);
      return {
        salesOrderLineId: str(x.salesOrderLineId),
        description: str(x.description),
        quantity: toNumber(x.quantity as never),
        unitPrice: toNumber(x.unitPrice as never),
        taxRate: toNumber(x.taxRate as never),
      };
    }),
    subtotal: toNumber(r.subtotal as never),
    discountAmount: toNumber(r.discountAmount as never),
    taxAmount: toNumber(r.taxAmount as never),
    total: toNumber(r.total as never),
  };
};

const mapTotals = (raw: unknown): SalesOrderTotals | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = asRaw(raw);
  return {
    ordered: toNumber(r.ordered as never),
    shipped: toNumber(r.shipped as never),
    invoiced: toNumber(r.invoiced as never),
    toInvoice: toNumber(r.toInvoice as never),
    toShip: toNumber(r.toShip as never),
    billedNotShipped: toNumber((r.billedNotShipped ?? 0) as never),
  };
};

const mapActions = (raw: unknown): SalesOrderActions | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = asRaw(raw);
  return {
    ship: r.ship === true,
    invoice: r.invoice === true,
    close: r.close === true,
    reopen: r.reopen === true,
    cancel: r.cancel === true,
    delete: r.delete === true,
    edit: r.edit === true,
    editLines: r.editLines === true,
  };
};

export const mapSalesOrder = (raw: unknown): SalesOrder => {
  const r = asRaw(raw);
  const rawLines = Array.isArray(r.lines) ? r.lines : [];

  return {
    id: str(r.id),
    companyId: str(r.companyId),
    orderNumber: str(r.orderNumber),
    customerId: str(r.customerId),
    customerName: str(r.customerName ?? asRaw(r.customer).name),
    orderDate: str(r.orderDate),
    expectedDate: r.expectedDate ? str(r.expectedDate) : null,
    // Note the default is 'open', not 'draft' — a sales order has no draft.
    status: (str(r.status) || 'open') as SalesOrderStatus,
    lines: rawLines.map(mapSalesOrderLine),
    subtotal: toNumber(r.subtotal as never),
    taxAmount: toNumber(r.taxAmount as never),
    discountType: (str(r.discountType) || 'none') as DiscountType,
    discountValue: toNumber(r.discountValue as never),
    discountAmount: toNumber(r.discountAmount as never),
    total: toNumber(r.total as never),
    notes: str(r.notes),
    sourceEstimateId: r.sourceEstimateId ? str(r.sourceEstimateId) : null,
    invoiceId: r.invoiceId ? str(r.invoiceId) : null,
    invoices: Array.isArray(r.invoices) ? r.invoices.map(mapInvoiceRef) : [],
    nextInvoice: mapNextInvoice(r.nextInvoice),
    totals: mapTotals(r.totals),
    actions: mapActions(r.actions),
    deliveryId: r.deliveryId ? str(r.deliveryId) : null,
    deliveryReference: r.deliveryReference ? str(r.deliveryReference) : null,
    hasBackorder: r.hasBackorder === true,
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
};

/**
 * `GET /sales-orders` — a BARE ARRAY, like estimates and invoices.
 * `SalesOrdersService.list` returns a flat `{data, summary, pagination}` and
 * the envelope keeps only `data`.
 */
export const salesOrderListSerializer = (payload: unknown): SalesOrder[] => {
  if (Array.isArray(payload)) return payload.map(mapSalesOrder);
  const d = asRaw(payload);
  const rows = Array.isArray(d.data) ? d.data : [];
  return rows.map(mapSalesOrder);
};

export const salesOrderSingleSerializer = (payload: unknown): SalesOrder | null => {
  if (!payload || Array.isArray(payload)) return null;
  const d = asRaw(payload);
  const raw = d.salesOrder ?? (d.id ? d : null);
  return raw ? mapSalesOrder(raw) : null;
};

/** `convert-to-invoice` returns `{salesOrder, invoice}`. */
export const salesOrderConvertSerializer = (
  payload: unknown,
): { salesOrder: SalesOrder | null; invoiceId: string | null } => {
  const d = asRaw(payload);
  const invoice = asRaw(d.invoice);
  return {
    salesOrder: d.salesOrder ? mapSalesOrder(d.salesOrder) : null,
    invoiceId: invoice.id ? str(invoice.id) : null,
  };
};

// ═══════════════════════════════════════════════════════
// Form ↔ API
// ═══════════════════════════════════════════════════════

export interface SalesOrderWritePayload {
  customerId: string;
  orderDate: string;
  expectedDate?: string;
  discountType: DiscountType;
  discountValue: string;
  notes?: string;
  lines: DocumentLineWritePayload[];
}

/**
 * Form → create payload.
 *
 * There is **no `status` field** on `CreateSalesOrderDto` — the server forces
 * `'open'`. And `orderNumber` is server-generated as `SO-<year>-NNNN`.
 */
export const salesOrderFormToPayload = (
  form: SalesOrderFormData,
): SalesOrderWritePayload => ({
  customerId: form.customerId,
  orderDate: form.orderDate,
  ...(form.expectedDate ? { expectedDate: form.expectedDate } : {}),
  discountType: form.discountType,
  discountValue: String(parseFloat(form.discountValue) || 0),
  notes: form.notes.trim() || undefined,
  lines: linesToPayload(form.lines),
});

/**
 * Form → update payload, with the customer dropped (immutable server-side).
 *
 * `includeLines` defaults to false and that default matters: sending `lines`
 * deletes and reinserts them, resetting every `quantityFulfilled` to zero. Only
 * pass true for an `open` order.
 */
export const salesOrderFormToUpdatePayload = (
  form: SalesOrderFormData,
  includeLines = false,
): Omit<SalesOrderWritePayload, 'customerId' | 'lines'> & {
  lines?: DocumentLineWritePayload[];
} => {
  const { customerId: _c, lines, ...rest } = salesOrderFormToPayload(form);
  return includeLines ? { ...rest, lines } : rest;
};

export const salesOrderToFormData = (order: SalesOrder): SalesOrderFormData => ({
  customerId: order.customerId,
  customerName: order.customerName,
  orderDate: order.orderDate.slice(0, 10),
  expectedDate: order.expectedDate ? order.expectedDate.slice(0, 10) : '',
  discountType: order.discountType,
  discountValue: String(order.discountValue ?? 0),
  notes: order.notes,
  lines: linesToForm(order.lines),
});
