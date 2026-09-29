// ═══════════════════════════════════════════════════════
// FinMatrix Web — Purchase Order Network
// ═══════════════════════════════════════════════════════

import {
  api,
  isPendingApproval,
  toApiError,
  unwrapEnvelope,
  type PendingApproval,
} from '@/networks/network/apiHelpers';
import {
  mapPurchaseOrder,
  purchaseOrderListSerializer,
  purchaseOrderSingleSerializer,
  type PurchaseOrderWritePayload,
} from '@/serializers/purchaseOrderSerializer';
import { asRaw } from '@/serializers/documentLines';
import { mapBill } from '@/serializers/billSerializer';
import type { Bill } from '@/models/bill';
import type {
  PurchaseOrder,
  PurchaseOrderStatus,
  ReceiptLinePayload,
} from '@/models/purchaseOrder';
import { documentPageOf, fetchAllPages, type DocumentPage } from '@/models/documentList';

export interface POQueryParams {
  search?: string;
  /** Orders with a line for this inventory item. */
  itemId?: string;
  status?: PurchaseOrderStatus;
  vendorId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export type POWriteResult =
  | { pending: false; purchaseOrder: PurchaseOrder }
  | { pending: true; approval: PendingApproval };

export const getPurchaseOrders = async (
  params: POQueryParams = {},
): Promise<PurchaseOrder[]> => {
  const { fromDate, toDate, ...rest } = params;
  const query: Record<string, unknown> = { ...rest };
  if (fromDate && toDate) {
    query.startDate = fromDate;
    query.endDate = toDate;
  }

  try {
    const response = await api.get('/purchase-orders', { params: query });
    return purchaseOrderListSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * One page of the list, with the server's summary (every row the filters
 * match) and pagination — what a list screen pages through with "Load more".
 */
export const getPurchaseOrderPage = async (
  params: POQueryParams & { page?: number; limit?: number } = {},
): Promise<DocumentPage<PurchaseOrder>> => {
  const { fromDate, toDate, ...rest } = params;
  const query: Record<string, unknown> = { ...rest };
  if (fromDate && toDate) {
    query.startDate = fromDate;
    query.endDate = toDate;
  }
  try {
    const response = await api.get('/purchase-orders', { params: query });
    return documentPageOf(response.data, purchaseOrderListSerializer(unwrapEnvelope(response.data)));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Every purchase order with a line for this item — the item page's Purchase
 * orders tab and its "on order" figure. Filtered by the server, every page:
 * this used to read the 100 most recent orders and filter their lines here,
 * so an item's older orders were never found.
 */
export const getPurchaseOrdersForItem = (itemId: string): Promise<PurchaseOrder[]> =>
  fetchAllPages((page, limit) =>
    getPurchaseOrderPage({ itemId, page, limit }).then((p) => ({ rows: p.rows, totalPages: p.totalPages })),
  );

export const getPurchaseOrderById = async (
  id: string,
): Promise<PurchaseOrder | null> => {
  try {
    const response = await api.get(`/purchase-orders/${id}`);
    return purchaseOrderSingleSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** `purchaseOrder.create` is `request` for staff — narrow before using. */
export const createPurchaseOrder = async (
  data: PurchaseOrderWritePayload,
): Promise<POWriteResult> => {
  try {
    const response = await api.post('/purchase-orders', data);
    const payload = unwrapEnvelope(response.data);
    if (isPendingApproval(payload)) return { pending: true, approval: payload };
    return { pending: false, purchaseOrder: mapPurchaseOrder(payload) };
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Rewrite a purchase order. **Admin only, drafts only.**
 *
 * There is no UpdatePurchaseOrderDto — PATCH takes the whole create DTO, and
 * the handler deletes every line and rebuilds it with `receivedQty: '0'`, with
 * no status guard. Stock and the GRNI journal entry stay posted. Calling this
 * on anything but a draft destroys the receipt record; the UI gates it twice.
 */
export const updatePurchaseOrder = async (
  id: string,
  data: PurchaseOrderWritePayload,
): Promise<PurchaseOrder> => {
  try {
    const response = await api.patch(`/purchase-orders/${id}`, data);
    return mapPurchaseOrder(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Set the status. **PATCH, not POST** — POST on this path is a 404.
 *
 * The handler assigns the column and returns: no transition rules, no
 * validation, `received → draft` included. `allowedTransitions` in the model
 * is what keeps the UI honest.
 */
export const setPurchaseOrderStatus = async (
  id: string,
  status: PurchaseOrderStatus,
): Promise<PurchaseOrder> => {
  try {
    const response = await api.patch(`/purchase-orders/${id}/status`, { status });
    return mapPurchaseOrder(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Book goods in.
 *
 * Every `receivedQty` is the **cumulative** figure, not today's delta — see
 * `receiptDraftsToPayload`. This is what moves stock and posts Goods Received
 * Not Invoiced; the server re-derives the PO status from the result and the
 * response says whether it is now `partial` or `received`.
 */
export const receivePurchaseOrderItems = async (
  id: string,
  lines: ReceiptLinePayload[],
): Promise<PurchaseOrder> => {
  try {
    const response = await api.post(`/purchase-orders/${id}/receive`, { lines });
    return mapPurchaseOrder(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};


export interface CreateBillFromPOBody {
  /** The vendor's own invoice number. Omit for BILL-YYYY-NNNN. */
  billNumber?: string;
  /** Defaults to today. */
  billDate?: string;
  /** Defaults to the bill date plus the vendor's payment terms. */
  dueDate?: string;
  /** Needed only for older non-stock lines saved without an expense account. */
  defaultAccountId?: string;
}

/**
 * Bill what has been received and not billed yet — once per delivery if need
 * be. The bill carries each line's purchase tax, and stock lines clear exactly
 * the Goods Received Not Invoiced their receipts accrued. Refused with
 * NOTHING_TO_BILL when everything received is already billed, and with
 * EXPENSE_ACCOUNT_REQUIRED when a non-stock line has no account.
 */
export const createBillFromPO = async (
  id: string,
  body: CreateBillFromPOBody = {},
): Promise<{ bill: Bill; purchaseOrder: PurchaseOrder | null }> => {
  try {
    const response = await api.post(`/purchase-orders/${id}/create-bill`, body);
    const payload = asRaw(unwrapEnvelope(response.data));
    return {
      bill: mapBill(payload.bill ?? { id: payload.billId }),
      purchaseOrder: payload.po ? mapPurchaseOrder(payload.po) : null,
    };
  } catch (e) {
    throw toApiError(e);
  }
};

/** Admin only. */
export const deletePurchaseOrder = async (id: string): Promise<void> => {
  try {
    await api.delete(`/purchase-orders/${id}`);
  } catch (e) {
    throw toApiError(e);
  }
};
