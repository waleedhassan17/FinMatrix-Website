// ═══════════════════════════════════════════════════════
// FinMatrix Web — Credit Memo Serializer
// ═══════════════════════════════════════════════════════

import type {
  CreditMemo,
  CreditMemoFormData,
  CreditMemoStatus,
} from '@/models/creditMemo';
import {
  asRaw,
  linesToPayload,
  mapDocumentLine,
  str,
  type DocumentLineWritePayload,
} from '@/serializers/documentLines';
import { toNumber } from '@/utils/money';

export const mapCreditMemo = (raw: unknown): CreditMemo => {
  const r = asRaw(raw);
  const rawLines = Array.isArray(r.lines) ? r.lines : [];

  return {
    id: str(r.id),
    companyId: str(r.companyId),
    creditMemoNumber: str(r.creditMemoNumber),
    customerId: str(r.customerId),
    // The LIST carries customerName; the DETAIL does not. Callers that have
    // both should prefer whichever they already hold.
    customerName: str(r.customerName ?? asRaw(r.customer).name),
    date: str(r.date),
    originalInvoiceId: r.originalInvoiceId ? str(r.originalInvoiceId) : null,
    reason: str(r.reason),
    status: (str(r.status) || 'open') as CreditMemoStatus,
    lines: rawLines.map(mapDocumentLine),
    subtotal: toNumber(r.subtotal as never),
    taxAmount: toNumber(r.taxAmount as never),
    total: toNumber(r.total as never),
    amountApplied: toNumber(r.amountApplied as never),
    balance: toNumber(r.balance as never),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
};

/**
 * `GET /credit-memos` — a BARE ARRAY, like every other transactional list.
 * Rows carry `customerName` but NOT `lines`.
 */
export const creditMemoListSerializer = (payload: unknown): CreditMemo[] => {
  if (Array.isArray(payload)) return payload.map(mapCreditMemo);
  const d = asRaw(payload);
  const rows = Array.isArray(d.data) ? d.data : [];
  return rows.map(mapCreditMemo);
};

export const creditMemoSingleSerializer = (payload: unknown): CreditMemo | null => {
  if (!payload || Array.isArray(payload)) return null;
  const d = asRaw(payload);
  const raw = d.creditMemo ?? (d.id ? d : null);
  return raw ? mapCreditMemo(raw) : null;
};

// ═══════════════════════════════════════════════════════
// Form → API
// ═══════════════════════════════════════════════════════

export interface CreditMemoWritePayload {
  customerId: string;
  date: string;
  reason?: string;
  lines: DocumentLineWritePayload[];
}

/**
 * Form → create payload.
 *
 * Note what is absent: **no discount** (credit memos have no such concept) and
 * **no number** (the server assigns `CM-<year>-NNNN`). There is also no PATCH
 * route at all — a memo is immutable once created, so there is no update
 * counterpart to this function.
 */
export const creditMemoFormToPayload = (
  form: CreditMemoFormData,
): CreditMemoWritePayload => ({
  customerId: form.customerId,
  date: form.date,
  reason: form.reason.trim() || undefined,
  lines: linesToPayload(form.lines),
});
