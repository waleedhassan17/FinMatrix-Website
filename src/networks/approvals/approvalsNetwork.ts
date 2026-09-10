// ═══════════════════════════════════════════════════════
// FinMatrix Web — Approvals Network
// ═══════════════════════════════════════════════════════
// Module 2 needs only the count. The list, detail and decide calls arrive with
// Module 18; the types below are already shaped for them so the inbox does not
// have to redefine the domain.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';

/** The ten things that can be sent for approval. */
export type ApprovalType =
  | 'adjustment'
  | 'journal'
  | 'credit_memo'
  | 'vendor_credit'
  | 'void'
  | 'bill_payment'
  | 'po'
  | 'invoice'
  | 'invoice_payment'
  | 'delivery_undo';

/**
 * `approving` is a transient claim taken while the server replays the payload
 * against the real domain service. The list endpoint folds it under the
 * `pending` filter so a row never vanishes mid-dispatch.
 */
export type ApprovalStatus =
  | 'pending'
  | 'approving'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface ApprovalRequest {
  id: string;
  companyId: string;
  type: ApprovalType;
  status: ApprovalStatus;
  /** The original request body, replayed verbatim on approval. */
  payload: Record<string, unknown>;
  /** One-line inbox text, built when the request was filed. */
  summary: string;
  reason: string | null;
  requestedBy: string;
  reviewedBy: string | null;
  reviewerRole: string | null;
  reviewedAt: string | null;
  reviewerComment: string | null;
  journalEntryId: string | null;
  resultId: string | null;
  /** Why the last approve attempt failed, if one did. */
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * How many approvals need attention.
 *
 * Counts `pending` + `approving`. The server scopes by role with no flag from
 * us: an owner gets the company inbox, a staff member gets only their own
 * requests. That is why one endpoint drives two different badges.
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

export type ApprovalFilter = ApprovalStatus | 'all';

/** One line explaining what approving a request actually does to the books. */
export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  invoice: 'Invoice',
  invoice_payment: 'Customer payment',
  bill_payment: 'Bill payment',
  credit_memo: 'Credit memo',
  vendor_credit: 'Vendor credit',
  journal: 'Journal entry',
  adjustment: 'Inventory adjustment',
  po: 'Purchase order',
  void: 'Void',
  delivery_undo: 'Undo delivery',
};

export const APPROVAL_TYPE_EFFECTS: Record<ApprovalType, string> = {
  invoice: 'Creates the invoice and recognises the sale.',
  invoice_payment: 'Banks the receipt and clears the invoice balance.',
  bill_payment: 'Pays the vendor and reduces cash.',
  credit_memo: 'Issues a credit against the customer.',
  vendor_credit: 'Records a credit from the vendor.',
  journal: 'Posts the entry to the ledger.',
  adjustment: 'Changes stock on hand and its value.',
  po: 'Creates the purchase order.',
  void: 'Reverses the original transaction.',
  delivery_undo: 'Reverses recognised delivery revenue.',
};

const asRaw = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

const mapApproval = (raw: unknown): ApprovalRequest => {
  const r = asRaw(raw);
  return {
    id: String(r.id ?? ''),
    companyId: String(r.companyId ?? ''),
    type: (r.type ?? 'invoice') as ApprovalType,
    status: (r.status ?? 'pending') as ApprovalStatus,
    payload: asRaw(r.payload),
    summary: String(r.summary ?? ''),
    reason: (r.reason as string) ?? null,
    requestedBy: String(r.requestedBy ?? ''),
    reviewedBy: (r.reviewedBy as string) ?? null,
    reviewerRole: (r.reviewerRole as string) ?? null,
    reviewedAt: (r.reviewedAt as string) ?? null,
    reviewerComment: (r.reviewerComment as string) ?? null,
    journalEntryId: (r.journalEntryId as string) ?? null,
    resultId: (r.resultId as string) ?? null,
    lastError: (r.lastError as string) ?? null,
    createdAt: String(r.createdAt ?? ''),
    updatedAt: String(r.updatedAt ?? ''),
  };
};

/**
 * List approval requests.
 *
 * The server scopes by role and takes no flag from us — staff see only their
 * own rows, an owner sees the whole company inbox. So this one function backs
 * both My Requests and (later) the owner's inbox.
 *
 * The handler returns `{data, total}`; the envelope keeps only `data`, so
 * `total` never arrives. Use the array length or /approvals/pending-count.
 */
export const fetchApprovals = async (params?: {
  status?: ApprovalFilter;
  type?: ApprovalType;
}): Promise<ApprovalRequest[]> => {
  try {
    const response = await api.get('/approvals', { params });
    const data = unwrapEnvelope(response.data);
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(asRaw(data).data)
        ? (asRaw(data).data as unknown[])
        : [];
    return rows.map(mapApproval);
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Withdraw your own pending request.
 *
 * Only the requester may cancel — even an admin gets a 403 on someone else's
 * (`FORBIDDEN`), and an already-decided request returns 400 `NOT_PENDING`.
 * Cancelling posts nothing, ever.
 */
export const cancelApproval = async (id: string): Promise<ApprovalRequest> => {
  try {
    const response = await api.post(`/approvals/${id}/cancel`);
    return mapApproval(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
