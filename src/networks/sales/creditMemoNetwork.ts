// ═══════════════════════════════════════════════════════
// FinMatrix Web — Credit Memo Network
// ═══════════════════════════════════════════════════════
// Every write here is maker-checker for staff — create, apply, refund AND
// void. A staff member cannot touch a credit memo without the owner, so all
// four calls can come back `{pending: true, …}` and all four are narrowed the
// same way. Note create returns 201 while apply/refund/void return 200; the
// pending body is identical regardless.

import {
  api,
  isPendingApproval,
  toApiError,
  unwrapEnvelope,
  type PendingApproval,
} from '@/networks/network/apiHelpers';
import {
  creditMemoListSerializer,
  creditMemoSingleSerializer,
  mapCreditMemo,
  type CreditMemoWritePayload,
} from '@/serializers/creditMemoSerializer';
import type { CreditMemo, CreditMemoStatus } from '@/models/creditMemo';

export interface CreditMemoQueryParams {
  /** Matches `creditMemoNumber` only — not the reason, not the customer. */
  search?: string;
  status?: CreditMemoStatus;
  customerId?: string;
  page?: number;
  limit?: number;
}

export type CreditMemoWriteResult =
  | { pending: false; creditMemo: CreditMemo }
  | { pending: true; approval: PendingApproval };

const narrow = (payload: unknown): CreditMemoWriteResult =>
  isPendingApproval(payload)
    ? { pending: true, approval: payload }
    : { pending: false, creditMemo: mapCreditMemo(payload) };

export const getCreditMemos = async (
  params: CreditMemoQueryParams = {},
): Promise<CreditMemo[]> => {
  try {
    const response = await api.get('/credit-memos', { params });
    return creditMemoListSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const getCreditMemoById = async (
  id: string,
): Promise<CreditMemo | null> => {
  try {
    const response = await api.get(`/credit-memos/${id}`);
    return creditMemoSingleSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Issue a credit memo. Posts the credit to AR immediately, and restocks any
 * line carrying an `itemId`.
 *
 * Idempotency-keyed because it moves money: a retry replays the stored
 * response rather than crediting the customer twice.
 */
export const createCreditMemo = async (
  data: CreditMemoWritePayload,
  idempotencyKey?: string,
): Promise<CreditMemoWriteResult> => {
  try {
    const response = await api.post('/credit-memos', data, {
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    });
    return narrow(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Put part or all of the credit against an invoice.
 *
 * `amount` is a real parameter — partial application is supported, even though
 * the mobile app fixes it at `min(creditBalance, invoiceBalance)`.
 *
 * Posts no journal entry: the AR credit was booked when the memo was created,
 * so applying it only moves the balance between documents.
 */
export const applyCreditMemo = async (
  id: string,
  invoiceId: string,
  amount: string,
): Promise<CreditMemoWriteResult> => {
  try {
    const response = await api.post(`/credit-memos/${id}/apply`, {
      invoiceId,
      amount,
    });
    return narrow(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Pay the remaining balance back in cash.
 *
 * **All or nothing**: there is no body and no amount — it refunds the entire
 * remaining balance. It always credits account `1000` Cash (no picker), and it
 * posts dated **today**, not the memo's date.
 */
export const refundCreditMemo = async (
  id: string,
): Promise<CreditMemoWriteResult> => {
  try {
    const response = await api.post(`/credit-memos/${id}/refund`, {});
    return narrow(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Reverse the memo entirely.
 *
 * Takes **no reason** — unlike invoice void, which requires one. Refused with
 * ALREADY_APPLIED once any of the credit has been consumed, and can fail with
 * INSUFFICIENT_STOCK when restocked goods have since been sold on.
 */
export const voidCreditMemo = async (
  id: string,
): Promise<CreditMemoWriteResult> => {
  try {
    const response = await api.post(`/credit-memos/${id}/void`, {});
    return narrow(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** Admin only. Refused unless the memo is still `open` (CANNOT_DELETE). */
export const deleteCreditMemo = async (id: string): Promise<void> => {
  try {
    await api.delete(`/credit-memos/${id}`);
  } catch (e) {
    throw toApiError(e);
  }
};
