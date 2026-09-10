// ═══════════════════════════════════════════════════════
// FinMatrix Web — Vendor Credit Network
// ═══════════════════════════════════════════════════════
// Every write here is maker-checker for staff — create, apply AND void — so all
// three can come back `{pending: true, …}` and all three are narrowed the same
// way. Create returns 201 while apply/void return 200; the pending body is
// identical regardless.
//
// The mobile app's equivalent module checks none of this: it discards the
// response, so a staff member is told their credit was recorded when the server
// only filed an approval request. That is the bug this file exists not to repeat.

import type { VendorCredit, VendorCreditStatus } from '@/models/vendorCredit';
import {
  api,
  isPendingApproval,
  toApiError,
  unwrapEnvelope,
  type PendingApproval,
} from '@/networks/network/apiHelpers';
import {
  mapVendorCredit,
  vendorCreditListSerializer,
  vendorCreditSingleSerializer,
  type VendorCreditWritePayload,
} from '@/serializers/vendorCreditSerializer';

export interface VendorCreditQueryParams {
  /** Matches `vendorCreditNumber` only — not the reason, not the vendor. */
  search?: string;
  status?: VendorCreditStatus;
  vendorId?: string;
  page?: number;
  limit?: number;
}

export type VendorCreditWriteResult =
  | { pending: false; vendorCredit: VendorCredit }
  | { pending: true; approval: PendingApproval };

const narrow = (payload: unknown): VendorCreditWriteResult =>
  isPendingApproval(payload)
    ? { pending: true, approval: payload }
    : { pending: false, vendorCredit: mapVendorCredit(payload) };

export const getVendorCredits = async (
  params: VendorCreditQueryParams = {},
): Promise<VendorCredit[]> => {
  try {
    const response = await api.get('/vendor-credits', { params });
    return vendorCreditListSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const getVendorCreditById = async (
  id: string,
): Promise<VendorCredit | null> => {
  try {
    const response = await api.get(`/vendor-credits/${id}`);
    return vendorCreditSingleSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Record a credit from a supplier.
 *
 * Posts Dr Accounts Payable / Cr the source account immediately, and where a
 * line names an item it also relieves stock at carrying cost.
 *
 * Idempotency-keyed because it moves money: a retry replays the stored response
 * rather than crediting the supplier twice.
 */
export const createVendorCredit = async (
  data: VendorCreditWritePayload,
  idempotencyKey?: string,
): Promise<VendorCreditWriteResult> => {
  try {
    const response = await api.post('/vendor-credits', data, {
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    });
    return narrow(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Put part or all of the credit against one bill.
 *
 * ONE BILL PER CALL — there is no allocations array on the AP side. Settling
 * several bills from one credit means several sequential calls, which is exactly
 * what the app's Pay Bills screen does, draining credits oldest-first.
 *
 * Posts no journal entry: the payable was reduced when the credit was created,
 * so applying it only moves the balance between documents.
 */
export const applyVendorCredit = async (
  id: string,
  billId: string,
  amount: string,
): Promise<VendorCreditWriteResult> => {
  try {
    const response = await api.post(`/vendor-credits/${id}/apply`, {
      billId,
      amount,
    });
    return narrow(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Reverse the credit entirely.
 *
 * Takes **no reason** — unlike invoice void, which requires one. Refused with
 * ALREADY_APPLIED once any of the credit has been consumed, and can fail with
 * INSUFFICIENT_STOCK when returned goods have since been sold on.
 */
export const voidVendorCredit = async (
  id: string,
): Promise<VendorCreditWriteResult> => {
  try {
    const response = await api.post(`/vendor-credits/${id}/void`, {});
    return narrow(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** Admin only. Refused unless the credit is still untouched. */
export const deleteVendorCredit = async (id: string): Promise<void> => {
  try {
    await api.delete(`/vendor-credits/${id}`);
  } catch (e) {
    throw toApiError(e);
  }
};
