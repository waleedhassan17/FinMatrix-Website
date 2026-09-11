// ═══════════════════════════════════════════════════════
// FinMatrix Web — Approvals serializer
// ═══════════════════════════════════════════════════════

import type { ApprovalRequest, ApprovalStatus, ApprovalType } from '@/models/approval';
import { asRaw, str } from '@/serializers/documentLines';

const nullable = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);

export const mapApproval = (raw: unknown): ApprovalRequest => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    companyId: str(r.companyId),
    type: (str(r.type) || 'invoice') as ApprovalType,
    status: (str(r.status) || 'pending') as ApprovalStatus,
    // Kept as the raw object: it is replayed verbatim on approval, and the
    // preview reads it per type.
    payload: asRaw(r.payload),
    summary: str(r.summary),
    reason: nullable(r.reason),
    requestedBy: str(r.requestedBy),
    reviewedBy: nullable(r.reviewedBy),
    reviewerRole: nullable(r.reviewerRole),
    reviewedAt: nullable(r.reviewedAt),
    reviewerComment: nullable(r.reviewerComment),
    journalEntryId: nullable(r.journalEntryId),
    resultId: nullable(r.resultId),
    lastError: nullable(r.lastError),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
};

/**
 * `GET /approvals` returns `{data, total}`; the response envelope keeps only
 * `data`, so `total` never arrives. Accepts the array bare or wrapped.
 */
export const approvalListSerializer = (payload: unknown): ApprovalRequest[] => {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(asRaw(payload).data)
      ? (asRaw(payload).data as unknown[])
      : [];
  return rows.map(mapApproval);
};
