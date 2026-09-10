// ═══════════════════════════════════════════════════════
// FinMatrix Web — Payment Network
// ═══════════════════════════════════════════════════════

import {
  api,
  isPendingApproval,
  toApiError,
  unwrapEnvelope,
  type PendingApproval,
} from '@/networks/network/apiHelpers';
import {
  mapPayment,
  outstandingSerializer,
  paymentListSerializer,
  paymentSingleSerializer,
  type ReceivePaymentPayload,
} from '@/serializers/paymentSerializer';
import type { AllocationRow, ApiPaymentMethod, Payment } from '@/models/payment';

export interface PaymentQueryParams {
  customerId?: string;
  invoiceId?: string;
  paymentMethod?: ApiPaymentMethod;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export type PaymentWriteResult =
  | { pending: false; payment: Payment }
  | { pending: true; approval: PendingApproval };

export const getPayments = async (
  params: PaymentQueryParams = {},
): Promise<Payment[]> => {
  const { fromDate, toDate, ...rest } = params;
  const query: Record<string, unknown> = { ...rest };
  // A lone startDate is silently ignored by the server — it only filters when
  // both bounds are present.
  if (fromDate && toDate) {
    query.startDate = fromDate;
    query.endDate = toDate;
  }

  try {
    const response = await api.get('/payments', { params: query });
    return paymentListSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const getPaymentById = async (id: string): Promise<Payment | null> => {
  try {
    const response = await api.get(`/payments/${id}`);
    return paymentSingleSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Open invoices for a customer, oldest due first.
 *
 * This is the endpoint the mobile app declares and never calls — it sweeps
 * `getInvoices({limit: 200})` and filters client-side instead, which silently
 * misses anything past row 200. Here we ask the server, which filters on
 * `balance > 0` and excludes draft and void.
 */
export const getOutstandingInvoices = async (
  customerId: string,
): Promise<AllocationRow[]> => {
  try {
    const response = await api.get(`/payments/customer/${customerId}/outstanding`);
    return outstandingSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Bank a customer payment.
 *
 * Staff get a pending approval instead of a payment — the invoices stay unpaid
 * until an owner approves. Narrow on the result before reading payment fields.
 *
 * An `Idempotency-Key` is sent because this moves money: a retried request
 * replays the stored response rather than banking the receipt twice.
 */
export const receivePayment = async (
  data: ReceivePaymentPayload,
  idempotencyKey?: string,
): Promise<PaymentWriteResult> => {
  try {
    const response = await api.post('/payments', data, {
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    });
    const payload = unwrapEnvelope(response.data);
    if (isPendingApproval(payload)) {
      return { pending: true, approval: payload };
    }
    return { pending: false, payment: mapPayment(payload) };
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Reverse a payment entirely — un-applies every allocation, restores the
 * customer balance and posts a reversing journal entry.
 *
 * `@Roles('admin')` with **no** approval path, so staff cannot delete a payment
 * or even request it. Blocked by TRANSACTION_RECONCILED once the payment sits
 * inside a completed bank reconciliation.
 */
export const deletePayment = async (id: string): Promise<void> => {
  try {
    await api.delete(`/payments/${id}`);
  } catch (e) {
    throw toApiError(e);
  }
};
