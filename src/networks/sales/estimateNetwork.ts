// ═══════════════════════════════════════════════════════
// FinMatrix Web — Estimate Network
// ═══════════════════════════════════════════════════════

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  convertResultSerializer,
  estimateListSerializer,
  estimateSingleSerializer,
  mapEstimate,
  type EstimateWritePayload,
} from '@/serializers/estimateSerializer';
import type {
  Estimate,
  EstimateSettableStatus,
  EstimateStatus,
} from '@/models/estimate';

export interface EstimateQueryParams {
  search?: string;
  status?: EstimateStatus;
  customerId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export const getEstimates = async (
  params: EstimateQueryParams = {},
): Promise<Estimate[]> => {
  // The server names them startDate/endDate and applies the range only when
  // BOTH are present.
  const { fromDate, toDate, ...rest } = params;
  const query: Record<string, unknown> = { ...rest };
  if (fromDate && toDate) {
    query.startDate = fromDate;
    query.endDate = toDate;
  }

  try {
    const response = await api.get('/estimates', { params: query });
    return estimateListSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const getEstimateById = async (id: string): Promise<Estimate | null> => {
  try {
    const response = await api.get(`/estimates/${id}`);
    return estimateSingleSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const createEstimate = async (
  data: EstimateWritePayload,
): Promise<Estimate> => {
  try {
    const response = await api.post('/estimates', data);
    return mapEstimate(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const updateEstimate = async (
  id: string,
  data: Omit<EstimateWritePayload, 'customerId' | 'status'>,
): Promise<Estimate> => {
  try {
    const response = await api.patch(`/estimates/${id}`, data);
    return mapEstimate(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Set the status. **PATCH**, not POST — POST on this path is a 404.
 *
 * Accepts only `sent | accepted | declined`. There is no way to set `draft`,
 * `converted` or `expired`, and there is no transition validation at all:
 * `accepted → sent` and `declined → accepted` are both legal. Accepting has no
 * side effects — it sets a string, and is not a precondition for conversion.
 */
export const setEstimateStatus = async (
  id: string,
  status: EstimateSettableStatus,
): Promise<Estimate> => {
  try {
    const response = await api.patch(`/estimates/${id}/status`, { status });
    return mapEstimate(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Convert to an invoice. **This posts.**
 *
 * The server creates the invoice with `status: 'sent'`, which writes the
 * journal entry, increments the customer balance, posts COGS and decrements
 * stock. `invoiceDate` is always TODAY (not the estimate date) and `dueDate`
 * defaults to today + 30 days.
 *
 * Note this route has NO maker-checker branch — a staff caller gets a real
 * posted invoice, not an approval request. The UI therefore offers it to
 * admins only; see the plan's headline finding.
 */
export const convertEstimateToInvoice = async (
  id: string,
  dueDate?: string,
): Promise<{ estimate: Estimate | null; invoiceId: string | null }> => {
  try {
    const response = await api.post(
      `/estimates/${id}/convert-to-invoice`,
      dueDate ? { dueDate } : {},
    );
    const { estimate, createdId } = convertResultSerializer(
      unwrapEnvelope(response.data),
    );
    return { estimate, invoiceId: createdId };
  } catch (e) {
    throw toApiError(e);
  }
};

/** Convert to a sales order. Posts nothing to the ledger. */
export const convertEstimateToSalesOrder = async (
  id: string,
): Promise<{ estimate: Estimate | null; salesOrderId: string | null }> => {
  try {
    const response = await api.post(`/estimates/${id}/convert-to-sales-order`, {});
    const { estimate, createdId } = convertResultSerializer(
      unwrapEnvelope(response.data),
    );
    return { estimate, salesOrderId: createdId };
  } catch (e) {
    throw toApiError(e);
  }
};

/** Admin only. Refused on a converted estimate (CANNOT_DELETE_CONVERTED). */
export const deleteEstimate = async (id: string): Promise<void> => {
  try {
    await api.delete(`/estimates/${id}`);
  } catch (e) {
    throw toApiError(e);
  }
};
