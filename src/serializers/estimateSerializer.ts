// ═══════════════════════════════════════════════════════
// FinMatrix Web — Estimate Serializer
// ═══════════════════════════════════════════════════════

import type { DiscountType } from '@/models/document';
import type { Estimate, EstimateFormData, EstimateStatus } from '@/models/estimate';
import {
  asRaw,
  linesToForm,
  linesToPayload,
  mapDocumentLine,
  str,
  type DocumentLineWritePayload,
} from '@/serializers/documentLines';
import { toNumber } from '@/utils/money';

export const mapEstimate = (raw: unknown): Estimate => {
  const r = asRaw(raw);
  const rawLines = Array.isArray(r.lines) ? r.lines : [];

  return {
    id: str(r.id),
    companyId: str(r.companyId),
    estimateNumber: str(r.estimateNumber),
    customerId: str(r.customerId),
    // List rows carry customerName; a detail row may only have the relation.
    customerName: str(r.customerName ?? asRaw(r.customer).name),
    estimateDate: str(r.estimateDate),
    // Nullable, not '' — the absence of an expiry is meaningful.
    expiryDate: r.expiryDate ? str(r.expiryDate) : null,
    status: (str(r.status) || 'draft') as EstimateStatus,
    lines: rawLines.map(mapDocumentLine),
    subtotal: toNumber(r.subtotal as never),
    taxAmount: toNumber(r.taxAmount as never),
    discountType: (str(r.discountType) || 'none') as DiscountType,
    discountValue: toNumber(r.discountValue as never),
    discountAmount: toNumber(r.discountAmount as never),
    total: toNumber(r.total as never),
    notes: str(r.notes),
    convertedToType:
      (r.convertedToType as Estimate['convertedToType']) ?? null,
    convertedToId: r.convertedToId ? str(r.convertedToId) : null,
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
};

/**
 * `GET /estimates` — a BARE ARRAY.
 *
 * `EstimatesService.list` returns a flat `{data, summary, pagination}` and the
 * response envelope lifts `data`, discarding the siblings — the same loss as
 * invoices. There is no total and no page count, so the caller pages off
 * `rows.length === limit` and computes tab counts client-side.
 */
export const estimateListSerializer = (payload: unknown): Estimate[] => {
  if (Array.isArray(payload)) return payload.map(mapEstimate);
  const d = asRaw(payload);
  const rows = Array.isArray(d.data) ? d.data : [];
  return rows.map(mapEstimate);
};

export const estimateSingleSerializer = (payload: unknown): Estimate | null => {
  if (!payload || Array.isArray(payload)) return null;
  const d = asRaw(payload);
  const raw = d.estimate ?? (d.id ? d : null);
  return raw ? mapEstimate(raw) : null;
};

/**
 * The convert routes return BOTH documents: `{estimate, invoice}` or
 * `{estimate, salesOrder}`. The new document's id is what the caller needs, to
 * navigate straight to it.
 */
export const convertResultSerializer = (
  payload: unknown,
): { estimate: Estimate | null; createdId: string | null } => {
  const d = asRaw(payload);
  const created = asRaw(d.invoice ?? d.salesOrder);
  return {
    estimate: d.estimate ? mapEstimate(d.estimate) : null,
    createdId: created.id ? str(created.id) : null,
  };
};

// ═══════════════════════════════════════════════════════
// Form ↔ API
// ═══════════════════════════════════════════════════════

export interface EstimateWritePayload {
  customerId: string;
  estimateDate: string;
  expiryDate?: string;
  status?: 'draft' | 'sent';
  discountType: DiscountType;
  discountValue: string;
  notes?: string;
  lines: DocumentLineWritePayload[];
}

/**
 * Form → create payload.
 *
 * `estimateNumber` is never sent — the server assigns `EST-<year>-NNNN`, the
 * same way it assigns invoice numbers.
 */
export const estimateFormToPayload = (
  form: EstimateFormData,
  status?: 'draft' | 'sent',
): EstimateWritePayload => ({
  customerId: form.customerId,
  estimateDate: form.estimateDate,
  // Optional on the DTO; omitted rather than sent as '' so it stays null.
  ...(form.expiryDate ? { expiryDate: form.expiryDate } : {}),
  ...(status ? { status } : {}),
  discountType: form.discountType,
  discountValue: String(parseFloat(form.discountValue) || 0),
  notes: form.notes.trim() || undefined,
  lines: linesToPayload(form.lines),
});

/**
 * Form → update payload.
 *
 * `UpdateEstimateDto` has **no `customerId`** (the customer is immutable) and
 * **no `status`** (that is the status route's job). Both would be silently
 * stripped by the global `whitelist: true`, so sending them would look like it
 * worked while changing nothing.
 */
export const estimateFormToUpdatePayload = (
  form: EstimateFormData,
): Omit<EstimateWritePayload, 'customerId' | 'status'> => {
  const { customerId: _c, status: _s, ...rest } = estimateFormToPayload(form);
  return rest;
};

export const estimateToFormData = (estimate: Estimate): EstimateFormData => ({
  customerId: estimate.customerId,
  customerName: estimate.customerName,
  estimateDate: estimate.estimateDate.slice(0, 10),
  expiryDate: estimate.expiryDate ? estimate.expiryDate.slice(0, 10) : '',
  discountType: estimate.discountType,
  discountValue: String(estimate.discountValue ?? 0),
  notes: estimate.notes,
  lines: linesToForm(estimate.lines),
});
