// ═══════════════════════════════════════════════════════
// FinMatrix Web — Estimate model
// ═══════════════════════════════════════════════════════

import type { DiscountType, FormLineItem } from '@/models/document';
import type { DocumentLine } from '@/serializers/documentLines';

/**
 * `expired` is in the union because the entity declares it and the list
 * endpoint accepts it as a filter — but **no server code path ever writes it.**
 * There is no cron and no expiry sweep, and `expiryDate` is stored and never
 * read. Treat it as unreachable and use `isExpired()` below for display.
 */
export type EstimateStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'converted'
  | 'expired';

/** The only three values PATCH /estimates/:id/status accepts. */
export type EstimateSettableStatus = 'sent' | 'accepted' | 'declined';

export interface Estimate {
  id: string;
  companyId: string;
  estimateNumber: string;
  customerId: string;
  customerName: string;
  estimateDate: string;
  /** Optional, and purely informational — nothing on the server reads it. */
  expiryDate: string | null;
  status: EstimateStatus;
  lines: DocumentLine[];
  subtotal: number;
  taxAmount: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  total: number;
  notes: string;
  /** What this became, once converted — use it to deep-link. */
  convertedToType: 'invoice' | 'sales_order' | null;
  convertedToId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateFormData {
  customerId: string;
  customerName: string;
  estimateDate: string;
  expiryDate: string;
  lines: FormLineItem[];
  discountType: DiscountType;
  discountValue: string;
  notes: string;
}

export const ESTIMATE_STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  converted: 'Converted',
  expired: 'Expired',
};

/**
 * Has this quote passed its expiry date?
 *
 * Derived client-side because the server never sets the `expired` status —
 * it stores `expiryDate` and forgets about it. This drives a hint on the row,
 * not a status change, and deliberately does not block conversion: the server
 * will happily convert an expired estimate, so pretending otherwise in the UI
 * would be a lie of a different kind.
 */
export const isExpired = (estimate: Pick<Estimate, 'expiryDate' | 'status'>): boolean => {
  if (!estimate.expiryDate) return false;
  // A settled quote is not "expiring" — it already went somewhere.
  if (estimate.status === 'converted' || estimate.status === 'declined') return false;
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return estimate.expiryDate.slice(0, 10) < todayIso;
};

/**
 * Only a converted estimate is locked server-side (400 CANNOT_EDIT_CONVERTED).
 * Editing an accepted or declined one is allowed.
 */
export const isEstimateEditable = (status: EstimateStatus): boolean =>
  status !== 'converted';

/**
 * `assertConvertible` rejects only `converted` and `declined`. Notably it does
 * NOT require `accepted` — a draft converts fine — so the UI offers the action
 * from `sent` and `accepted` (where it makes sense) rather than wherever the
 * server would tolerate it.
 */
export const isConvertible = (status: EstimateStatus): boolean =>
  status !== 'converted' && status !== 'declined';
