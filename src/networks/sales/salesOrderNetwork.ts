// ═══════════════════════════════════════════════════════
// FinMatrix Web — Sales Order Network
// ═══════════════════════════════════════════════════════
// The whole controller is @RequiresFeature('salesOrders'), which the feature
// map grants to the warehouse tier alone. Callers must gate on
// useFeature('salesOrders') or every call here is a 403.

import { toCreditAssessment, type CreditAssessment } from '@/models/credit';
import { api, ApiError, isPendingApproval, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  mapSalesOrder,
  salesOrderConvertSerializer,
  salesOrderListSerializer,
  salesOrderSingleSerializer,
  type SalesOrderWritePayload,
} from '@/serializers/salesOrderSerializer';
import type {
  BackorderLine,
  FulfilLinePayload,
  SalesOrder,
  SalesOrderStatus,
} from '@/models/salesOrder';
import { documentPageOf, type DocumentPage } from '@/models/documentList';

export interface SalesOrderQueryParams {
  search?: string;
  status?: SalesOrderStatus;
  customerId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export const getSalesOrders = async (
  params: SalesOrderQueryParams = {},
): Promise<SalesOrder[]> => {
  const { fromDate, toDate, ...rest } = params;
  const query: Record<string, unknown> = { ...rest };
  if (fromDate && toDate) {
    query.startDate = fromDate;
    query.endDate = toDate;
  }

  try {
    const response = await api.get('/sales-orders', { params: query });
    return salesOrderListSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * One page of the list, with the server's summary (every row the filters
 * match) and pagination — what a list screen pages through with "Load more".
 */
export const getSalesOrderPage = async (
  params: SalesOrderQueryParams & { page?: number; limit?: number } = {},
): Promise<DocumentPage<SalesOrder>> => {
  const { fromDate, toDate, ...rest } = params;
  const query: Record<string, unknown> = { ...rest };
  if (fromDate && toDate) {
    query.startDate = fromDate;
    query.endDate = toDate;
  }
  try {
    const response = await api.get('/sales-orders', { params: query });
    return documentPageOf(response.data, salesOrderListSerializer(unwrapEnvelope(response.data)));
  } catch (e) {
    throw toApiError(e);
  }
};

export const getSalesOrderById = async (
  id: string,
): Promise<SalesOrder | null> => {
  try {
    const response = await api.get(`/sales-orders/${id}`);
    return salesOrderSingleSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** The credit warning a saved order carries: shipping all of it would pass the limit. */
export type SavedSalesOrder = SalesOrder & { creditCheck: CreditAssessment | null };

const withCreditCheck = (payload: unknown): SavedSalesOrder => ({
  ...mapSalesOrder(payload),
  creditCheck: toCreditAssessment((payload as { creditCheck?: unknown } | null)?.creditCheck),
});

/**
 * Create an order. Asking for more than is available answers 409
 * BACKORDER_CONFIRMATION_REQUIRED (details.lines lists the short items) unless
 * `acceptBackorder` is set.
 */
export const createSalesOrder = async (
  data: SalesOrderWritePayload,
  acceptBackorder = false,
): Promise<SavedSalesOrder> => {
  try {
    const response = await api.post('/sales-orders', acceptBackorder ? { ...data, acceptBackorder } : data);
    return withCreditCheck(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** The short items behind a BACKORDER_CONFIRMATION_REQUIRED refusal, or null. */
export const backorderRefusal = (e: unknown): BackorderLine[] | null => {
  if (!(e instanceof ApiError) || e.code !== 'BACKORDER_CONFIRMATION_REQUIRED') return null;
  const lines = (e.details as { lines?: unknown[] } | undefined)?.lines ?? [];
  return lines.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      itemId: String(r.itemId ?? ''),
      name: String(r.name ?? ''),
      sku: String(r.sku ?? ''),
      requested: Number(r.requested ?? 0),
      available: Number(r.available ?? 0),
      shortfall: Number(r.shortfall ?? 0),
    };
  });
};

/**
 * Edit an order.
 *
 * Beware `lines`: sending them replaces the set wholesale, which resets every
 * line's `quantityFulfilled` to zero and issues new line ids. The caller is
 * expected to omit them for anything past `open` — see
 * `salesOrderFormToUpdatePayload`.
 */
export const updateSalesOrder = async (
  id: string,
  data: Record<string, unknown>,
  acceptBackorder = false,
): Promise<SavedSalesOrder> => {
  try {
    const response = await api.patch(`/sales-orders/${id}`, acceptBackorder ? { ...data, acceptBackorder } : data);
    return withCreditCheck(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Record a shipment.
 *
 * `quantityFulfilled` is the CUMULATIVE total for the line, not a delta — the
 * server assigns rather than adds. Build the payload with
 * `fulfilDraftsToPayload`, which does that sum.
 *
 * Fulfilment moves **no stock** on the books: stock moves when the invoice
 * for those goods posts. It is still refused (422 INSUFFICIENT_STOCK) when the
 * goods are not physically on the shelf — goods shipped on other orders but
 * not invoiced yet count as gone. The running total cannot go below what has
 * been invoiced (400 SHIPPED_BELOW_INVOICED).
 *
 * An order invoiced in full before partial invoicing existed can still record
 * the rest of its delivery here; those units are already billed, so they skip
 * the stock and credit checks.
 *
 * The whole call runs in a transaction, so one OVER_FULFILLED line rolls back
 * every other line in the same request.
 */
export const fulfillSalesOrder = async (
  id: string,
  lines: FulfilLinePayload[],
  creditOverrideReason?: string,
): Promise<SalesOrder> => {
  try {
    const response = await api.post(`/sales-orders/${id}/fulfill`, {
      lines,
      ...(creditOverrideReason ? { creditOverride: { reason: creditOverrideReason } } : {}),
    });
    return mapSalesOrder(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Invoice the order. **This posts**: the sale is recognised and the billed
 * stock leaves the books.
 *
 * It bills what has **shipped and is not invoiced yet** — `order.nextInvoice`
 * previews exactly that. An order with nothing shipped yet is shipped and
 * invoiced in full in one step. The order stays open for whatever has not
 * shipped; `closeRemaining` closes it instead (the rest will not ship).
 *
 * The owner posts directly; a staff member's call files an approval request
 * (`pending: true`) that bills exactly what was previewed, or is refused if
 * the order changed before the owner approved it.
 */
export const convertSalesOrderToInvoice = async (
  id: string,
  dueDate?: string,
  creditOverrideReason?: string,
  closeRemaining = false,
): Promise<{ salesOrder: SalesOrder | null; invoiceId: string | null; pending: boolean }> => {
  try {
    const response = await api.post(`/sales-orders/${id}/convert-to-invoice`, {
      ...(dueDate ? { dueDate } : {}),
      ...(closeRemaining ? { closeRemaining: true } : {}),
      ...(creditOverrideReason ? { creditOverride: { reason: creditOverrideReason } } : {}),
    });
    const payload = unwrapEnvelope(response.data);
    // Staff conversions post an invoice, so the owner signs them off first.
    if (isPendingApproval(payload)) return { salesOrder: null, invoiceId: null, pending: true };
    return { ...salesOrderConvertSerializer(payload), pending: false };
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Close the order short: what has not shipped will not ship. Posts nothing, so
 * staff may do it too. Refused while goods shipped on it are not invoiced
 * (SO_HAS_UNINVOICED_SHIPMENTS), and on an order with nothing shipped
 * (SO_NOTHING_TO_CLOSE — cancel it instead). Reversible with `reopenSalesOrder`.
 */
export const closeSalesOrder = async (id: string, reason?: string): Promise<SalesOrder> => {
  try {
    const response = await api.post(`/sales-orders/${id}/close`, reason?.trim() ? { reason: reason.trim() } : {});
    return mapSalesOrder(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** Reopen a closed order: it goes back to where its shipments and invoices put it. */
export const reopenSalesOrder = async (id: string): Promise<SalesOrder> => {
  try {
    const response = await api.post(`/sales-orders/${id}/reopen`, {});
    return mapSalesOrder(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Cancel the order. No body, no reason captured, and **irreversible** — there
 * is no un-cancel route and `update` refuses cancelled orders. Only an order
 * with nothing shipped or invoiced can be cancelled; one that has started is
 * closed instead.
 */
export const cancelSalesOrder = async (id: string): Promise<SalesOrder> => {
  try {
    const response = await api.post(`/sales-orders/${id}/cancel`, {});
    return mapSalesOrder(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** Admin only. Refused once anything has shipped or been invoiced (CANNOT_DELETE). */
export const deleteSalesOrder = async (id: string): Promise<void> => {
  try {
    await api.delete(`/sales-orders/${id}`);
  } catch (e) {
    throw toApiError(e);
  }
};
