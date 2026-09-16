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
 * Fulfilment moves **no stock**: this module never touches inventory, and
 * `quantityCommitted` is not written anywhere in the codebase. It is a
 * bookkeeping counter. Stock moves once, at convert-to-invoice.
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
 * Convert to an invoice. **This posts**, exactly as the estimate route does —
 * and with no maker-checker branch, so it is admin-only in our UI.
 *
 * It bills the **full ordered quantity** regardless of how much has actually
 * been fulfilled. There is no partial invoicing.
 */
export const convertSalesOrderToInvoice = async (
  id: string,
  dueDate?: string,
  creditOverrideReason?: string,
): Promise<{ salesOrder: SalesOrder | null; invoiceId: string | null; pending: boolean }> => {
  try {
    const response = await api.post(`/sales-orders/${id}/convert-to-invoice`, {
      ...(dueDate ? { dueDate } : {}),
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
 * Cancel the order. No body, no reason captured, and **irreversible** — there
 * is no un-cancel route and `update` refuses cancelled orders. It releases
 * nothing, because nothing was ever reserved.
 */
export const cancelSalesOrder = async (id: string): Promise<SalesOrder> => {
  try {
    const response = await api.post(`/sales-orders/${id}/cancel`, {});
    return mapSalesOrder(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** Admin only. Refused once invoiced (CANNOT_DELETE). */
export const deleteSalesOrder = async (id: string): Promise<void> => {
  try {
    await api.delete(`/sales-orders/${id}`);
  } catch (e) {
    throw toApiError(e);
  }
};
