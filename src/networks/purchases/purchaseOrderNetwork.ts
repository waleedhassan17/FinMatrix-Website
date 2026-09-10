// ═══════════════════════════════════════════════════════
// FinMatrix Web — Purchase Order Network
// ═══════════════════════════════════════════════════════

import {
  api,
  ApiError,
  extractErrorCode,
  extractErrorMessage,
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
import { asRaw, str } from '@/serializers/documentLines';
import { mapBill } from '@/serializers/billSerializer';
import type { Bill } from '@/models/bill';
import type {
  PurchaseOrder,
  PurchaseOrderStatus,
  ReceiptLinePayload,
} from '@/models/purchaseOrder';

export interface POQueryParams {
  search?: string;
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

/**
 * A second Convert-to-Bill on the same PO.
 *
 * `PO_ALREADY_BILLED` carries `billId` and `billNumber` in its error body — but
 * `ApiError` keeps only the message, code and status, so those two ids would be
 * lost by the time a screen caught it. This subclass carries them through, and
 * lets the UI offer "View bill" instead of reporting a failure for something
 * that had in fact already succeeded.
 */
export class POAlreadyBilledError extends ApiError {
  billId: string;
  billNumber: string;

  constructor(message: string, billId: string, billNumber: string) {
    super(message, 'PO_ALREADY_BILLED', 400);
    this.name = 'POAlreadyBilledError';
    this.billId = billId;
    this.billNumber = billNumber;
  }
}

/**
 * Raise a bill for what has been received.
 *
 * Bills **only the received quantity × unit cost**, not the ordered value, and
 * the line it writes clears GRNI against accounts payable. Refused on a second
 * attempt with PO_ALREADY_BILLED.
 */
export const createBillFromPO = async (id: string): Promise<Bill> => {
  try {
    const response = await api.post(`/purchase-orders/${id}/create-bill`);
    return mapBill(unwrapEnvelope(response.data));
  } catch (e) {
    // Read the ids off the raw error while the body is still in reach.
    if (extractErrorCode(e) === 'PO_ALREADY_BILLED') {
      const body = asRaw(
        asRaw(asRaw((e as { response?: unknown }).response).data).error,
      );
      const billId = str(body.billId);
      if (billId) {
        throw new POAlreadyBilledError(
          extractErrorMessage(e),
          billId,
          str(body.billNumber),
        );
      }
    }
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
