// ═══════════════════════════════════════════════════════
// FinMatrix Web — Invoice Network
// ═══════════════════════════════════════════════════════

import {
  api,
  authedBlobUrl,
  isPendingApproval,
  toApiError,
  unwrapEnvelope,
  type PendingApproval,
} from '@/networks/network/apiHelpers';
import {
  invoiceListSerializer,
  invoiceSingleSerializer,
  mapInvoice,
  type InvoiceWritePayload,
} from '@/serializers/invoiceSerializer';
import type { Invoice, InvoiceStatus } from '@/models/invoice';

export interface InvoiceQueryParams {
  search?: string;
  status?: InvoiceStatus;
  customerId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

/**
 * A write that may not have written anything.
 *
 * Staff POSTs return 200/201 carrying a PendingApproval instead of the
 * document — no invoice, no ledger entry, no stock movement. Callers must
 * narrow on `isPendingApproval` before touching the result.
 */
export type InvoiceWriteResult =
  | { pending: false; invoice: Invoice }
  | { pending: true; approval: PendingApproval };

export const getInvoices = async (
  params: InvoiceQueryParams = {},
): Promise<Invoice[]> => {
  // The UI calls them fromDate/toDate; the server wants startDate/endDate, and
  // applies the range only when BOTH are present.
  const { fromDate, toDate, ...rest } = params;
  const query: Record<string, unknown> = { ...rest };
  if (fromDate && toDate) {
    query.startDate = fromDate;
    query.endDate = toDate;
  }

  try {
    const response = await api.get('/invoices', { params: query });
    return invoiceListSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const getInvoiceById = async (id: string): Promise<Invoice | null> => {
  try {
    const response = await api.get(`/invoices/${id}`);
    return invoiceSingleSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const createInvoice = async (
  data: InvoiceWritePayload,
): Promise<InvoiceWriteResult> => {
  try {
    const response = await api.post('/invoices', data);
    const payload = unwrapEnvelope(response.data);
    if (isPendingApproval(payload)) {
      return { pending: true, approval: payload };
    }
    return { pending: false, invoice: mapInvoice(payload) };
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Edit a draft. Not gated for staff — only create and void are.
 * A non-draft invoice returns 400 CANNOT_EDIT_POSTED.
 */
export const updateInvoice = async (
  id: string,
  data: Omit<InvoiceWritePayload, 'customerId' | 'status'>,
): Promise<Invoice> => {
  try {
    const response = await api.patch(`/invoices/${id}`, data);
    return mapInvoice(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Post the invoice to the books: writes the journal entry and moves draft →
 * sent. Takes no body — the app sends `{channel, toPhone}` and the server's
 * whitelist drops them.
 *
 * Can fail late with 422 INSUFFICIENT_STOCK when a line carries an `itemId`
 * whose quantity on hand will not cover it.
 */
export const sendInvoice = async (id: string): Promise<Invoice> => {
  try {
    const response = await api.post(`/invoices/${id}/send`);
    return mapInvoice(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** Void an invoice. `reason` is required. Becomes an approval request for staff. */
export const voidInvoice = async (
  id: string,
  reason: string,
): Promise<InvoiceWriteResult> => {
  try {
    const response = await api.post(`/invoices/${id}/void`, { reason });
    const payload = unwrapEnvelope(response.data);
    if (isPendingApproval(payload)) {
      return { pending: true, approval: payload };
    }
    return { pending: false, invoice: mapInvoice(payload) };
  } catch (e) {
    throw toApiError(e);
  }
};

/** Admin only. Blocked by INVOICE_HAS_PAYMENTS once anything has been paid. */
export const deleteInvoice = async (id: string): Promise<void> => {
  try {
    await api.delete(`/invoices/${id}`);
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * The PDF, as an object URL.
 *
 * This route streams `application/pdf` straight to the response, bypassing the
 * envelope — and it is not public, so a plain `<a href>` would 401 rather than
 * download. The caller owns the returned URL and must revoke it.
 */
export const getInvoicePdfUrl = (id: string): Promise<string> =>
  authedBlobUrl(`/invoices/${id}/pdf`);
