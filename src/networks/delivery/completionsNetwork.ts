// ═══════════════════════════════════════════════════════
// FinMatrix Web — Delivery completions network
// ═══════════════════════════════════════════════════════
// A rider finishing a delivery files an "inventory update request": what was
// delivered, what came back, and the signed bill. Signing it off is the sale.
//
// Two doors lead into the same service code. This uses the dedicated one,
// `/inventory-update-requests/:id/{approve,reject,undo}`, whose roles say the
// rule out loud:
//   approve   @Roles('admin')          — recognises revenue; the owner's alone
//   reject    @Roles('admin','staff')  — stock back on the shelf, no sale
//   undo      owner direct; staff file a `delivery_undo` request with a reason

import {
  api,
  authedBlobUrl,
  isPendingApproval,
  toApiError,
  unwrapEnvelope,
  type PendingApproval,
} from '@/networks/network/apiHelpers';
import type {
  Completion,
  CompletionStatus,
  DeliveryCreditMemoDraft,
} from '@/models/delivery';
import { listRows } from '@/serializers/inventorySerializer';
import { mapCompletion } from '@/serializers/deliverySerializer';
import { toDecimal, toNumber } from '@/utils/money';

const BASE = '/inventory-update-requests';

export const getCompletions = async (
  status: CompletionStatus | 'all' = 'pending',
): Promise<Completion[]> => {
  try {
    const response = await api.get(BASE, { params: { status, page: 1, pageSize: 200 } });
    return listRows(unwrapEnvelope(response.data)).map(mapCompletion);
  } catch (e) {
    throw toApiError(e);
  }
};

export const getCompletion = async (id: string): Promise<Completion> => {
  try {
    const response = await api.get(`${BASE}/${id}`);
    return mapCompletion(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Owner only. Posts the sale and COGS; the delivery becomes `delivered`.
 *
 * `amountCollected` is the owner's count of the cash the rider handed in. Sent
 * only when it differs from the rider's figure; the server records both on the
 * audit trail.
 */
export const approveCompletion = async (
  id: string,
  opts: { comment?: string; amountCollected?: string } = {},
): Promise<void> => {
  try {
    await api.post(`${BASE}/${id}/approve`, {
      ...(opts.comment ? { reviewerComment: opts.comment } : {}),
      ...(opts.amountCollected !== undefined ? { amountCollected: opts.amountCollected } : {}),
    });
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Either role. Restocks and reverses Goods in Transit; recognises nothing.
 * The comment is required (5–1000 characters) — it goes to the rider and is
 * the audit note on the reversal.
 */
export const rejectCompletion = async (id: string, comment: string): Promise<void> => {
  try {
    await api.post(`${BASE}/${id}/reject`, { reviewerComment: comment });
  } catch (e) {
    throw toApiError(e);
  }
};

export type UndoResult = { pending: false } | { pending: true; approval: PendingApproval };

/**
 * Undo an approved completion — reverses the recognised revenue. The owner's
 * happens at once; a staff member's becomes a request carrying their reason.
 */
export const undoCompletion = async (id: string, reason?: string): Promise<UndoResult> => {
  try {
    const response = await api.post(`${BASE}/${id}/undo`, reason ? { reason } : {});
    const payload = unwrapEnvelope(response.data);
    return isPendingApproval(payload) ? { pending: true, approval: payload } : { pending: false };
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * The credit memo that would reverse an approved delivery, filled in from the
 * delivery's own figures. Reading it posts nothing, so both roles may ask;
 * what differs is what submitting it does (creditMemo.manage). Refused (409)
 * for a delivery that never posted a sale.
 */
export const getCreditMemoDraft = async (id: string): Promise<DeliveryCreditMemoDraft> => {
  try {
    const response = await api.get(`${BASE}/${id}/credit-memo-draft`);
    const r = unwrapEnvelope<Record<string, unknown>>(response.data) ?? {};
    const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
    const n = (v: unknown) => toNumber(v as never);
    // Decimal strings arrive as "3.0000"; the form wants what a person types.
    const plain = (v: unknown) => toDecimal(s(v) || '0').toString();
    return {
      deliveryRequestId: s(r.deliveryRequestId),
      deliveryId: s(r.deliveryId),
      deliveryReference: s(r.deliveryReference),
      customerId: s(r.customerId),
      customerName: s(r.customerName),
      originalInvoiceId: r.originalInvoiceId ? String(r.originalInvoiceId) : null,
      invoiceNumber: s(r.invoiceNumber),
      invoiceBalance: n(r.invoiceBalance),
      settlement:
        r.settlement === 'refund_cash' || r.settlement === 'apply_then_refund'
          ? r.settlement
          : 'apply_to_invoice',
      settlementAmount: n(r.settlementAmount),
      refundAmount: n(r.refundAmount),
      date: s(r.date).slice(0, 10),
      reason: s(r.reason),
      lines: (Array.isArray(r.lines) ? r.lines : []).map((raw) => {
        const l = (raw ?? {}) as Record<string, unknown>;
        return {
          itemId: s(l.itemId),
          description: s(l.description),
          quantity: plain(l.quantity),
          unitPrice: plain(l.unitPrice),
          taxRate: plain(l.taxRate),
        };
      }),
    };
  } catch (e) {
    throw toApiError(e);
  }
};

/** The signed bill photo, as an object URL the caller must revoke. */
export const getBillPhotoUrl = (id: string): Promise<string> =>
  authedBlobUrl(`${BASE}/${id}/bill-photo`);
