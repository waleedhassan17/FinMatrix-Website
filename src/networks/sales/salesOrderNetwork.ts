// ═══════════════════════════════════════════════════════
// FinMatrix Web — Sales Order Network
// ═══════════════════════════════════════════════════════
// The whole controller is @RequiresFeature('salesOrders'), which the feature
// map grants to the warehouse tier alone. Callers must gate on
// useFeature('salesOrders') or every call here is a 403.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  mapSalesOrder,
  salesOrderConvertSerializer,
  salesOrderListSerializer,
  salesOrderSingleSerializer,
  type SalesOrderWritePayload,
} from '@/serializers/salesOrderSerializer';
import type {
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

export const createSalesOrder = async (
  data: SalesOrderWritePayload,
): Promise<SalesOrder> => {
  try {
    const response = await api.post('/sales-orders', data);
    return mapSalesOrder(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
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
): Promise<SalesOrder> => {
  try {
    const response = await api.patch(`/sales-orders/${id}`, data);
    return mapSalesOrder(unwrapEnvelope(response.data));
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
): Promise<SalesOrder> => {
  try {
    const response = await api.post(`/sales-orders/${id}/fulfill`, { lines });
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
): Promise<{ salesOrder: SalesOrder | null; invoiceId: string | null }> => {
  try {
    const response = await api.post(
      `/sales-orders/${id}/convert-to-invoice`,
      dueDate ? { dueDate } : {},
    );
    return salesOrderConvertSerializer(unwrapEnvelope(response.data));
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
