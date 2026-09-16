// ═══════════════════════════════════════════════════════
// FinMatrix Web — Approvals Network
// ═══════════════════════════════════════════════════════
// One data source, two views. The server scopes every read by role with no flag
// from us: an owner gets the whole company's requests, a staff member only their
// own. So the same `fetchApprovals` backs both the owner's inbox and My Requests.
//
// Deciding is the one route staff must never reach — `@Roles('admin')`, a 403 at
// the server rather than a hidden button.

import type { ApprovalFilter, ApprovalRequest, ApprovalType } from '@/models/approval';
import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import { approvalListSerializer, mapApproval } from '@/serializers/approvalSerializer';

// The domain types now live in the model; re-exported so the badge, dashboard
// and list-page imports that predate it keep working unchanged.
export type {
  ApprovalFilter,
  ApprovalRequest,
  ApprovalStatus,
  ApprovalType,
} from '@/models/approval';
export { APPROVAL_TYPE_EFFECTS, APPROVAL_TYPE_LABELS } from '@/models/approval';

/**
 * How many approvals need attention: `pending` + `approving`, scoped by role —
 * an owner's inbox, or a staff member's own open requests. That is why one
 * endpoint drives two different badges.
 */
export const fetchPendingApprovalCount = async (): Promise<number> => {
  try {
    const response = await api.get('/approvals/pending-count');
    const data = unwrapEnvelope<{ count?: number }>(response.data);
    return data?.count ?? 0;
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * List requests. `status` defaults to `pending` server-side, so history needs an
 * explicit filter; `pending` also returns rows stranded in `approving`, so a row
 * never vanishes mid-dispatch.
 */
export const fetchApprovals = async (params?: {
  status?: ApprovalFilter;
  type?: ApprovalType;
}): Promise<ApprovalRequest[]> => {
  try {
    const response = await api.get('/approvals', { params });
    return approvalListSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** One request. Staff get 403 for anyone else's. */
export const fetchApprovalById = async (id: string): Promise<ApprovalRequest> => {
  try {
    const response = await api.get(`/approvals/${id}`);
    return mapApproval(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Approve or reject. Owner only.
 *
 * The body field is `comment` — 3 to 1000 characters, REQUIRED on reject so the
 * requester learns why, optional on approve. An empty comment is omitted rather
 * than sent, since `''` would fail the minimum length.
 *
 * Approving is what actually posts the transaction. The server makes it
 * idempotent (an already-decided request comes back unchanged), answers 409
 * APPROVAL_INTERRUPTED for a row stranded mid-post, 403 MAKER_IS_CHECKER to the
 * requester, and on a failed dispatch returns the row to `pending` with
 * `lastError` set and rethrows.
 */
export const decideApproval = async (
  id: string,
  decision: 'approve' | 'reject',
  comment?: string,
  creditOverrideReason?: string,
): Promise<ApprovalRequest> => {
  try {
    const trimmed = comment?.trim();
    const response = await api.post(`/approvals/${id}/decide`, {
      decision,
      ...(trimmed ? { comment: trimmed } : {}),
      // Approving an invoice past the customer's credit limit.
      ...(creditOverrideReason ? { creditOverrideReason } : {}),
    });
    return mapApproval(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Withdraw your own pending request. Only the requester may cancel — even an
 * owner gets 403 on someone else's — and a decided request answers 400
 * NOT_PENDING. Cancelling posts nothing, ever.
 */
export const cancelApproval = async (id: string): Promise<ApprovalRequest> => {
  try {
    const response = await api.post(`/approvals/${id}/cancel`);
    return mapApproval(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
