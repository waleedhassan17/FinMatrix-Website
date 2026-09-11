// ═══════════════════════════════════════════════════════
// FinMatrix Web — Tax serializer
// ═══════════════════════════════════════════════════════
// Reads the fields the backend actually sends. The app's version reads `taxType`
// and `description` (the backend fields are `type` and `authority`) and accepts
// only JavaScript numbers for `rate`, which arrives as the decimal string
// "17.0000" — so every rate it shows is "0% · GST", and editing one would save
// that back over the real figure.

import type { TaxLiability, TaxLiabilityRow, TaxPayment, TaxRate } from '@/models/tax';
import { asRaw, str } from '@/serializers/documentLines';
import { toNumber } from '@/utils/money';

export const mapTaxRate = (raw: unknown): TaxRate => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    name: str(r.name),
    rate: toNumber(r.rate as never),
    type: str(r.type),
    authority: str(r.authority),
    isActive: r.isActive === undefined ? true : Boolean(r.isActive),
    isDefault: Boolean(r.isDefault),
    createdAt: str(r.createdAt),
  };
};

const mapLiabilityRow = (raw: unknown): TaxLiabilityRow => {
  const r = asRaw(raw);
  return {
    taxRateId: str(r.taxRateId),
    taxName: str(r.taxName),
    taxType: str(r.taxType),
    rate: toNumber(r.rate as never),
    collected: toNumber(r.collected as never),
    paid: toNumber(r.paid as never),
    net: toNumber(r.net as never),
  };
};

export const taxLiabilitySerializer = (payload: unknown): TaxLiability => {
  const r = asRaw(payload);
  return {
    fromDate: str(r.fromDate),
    toDate: str(r.toDate),
    rows: Array.isArray(r.rows) ? r.rows.map(mapLiabilityRow) : [],
    totalCollected: toNumber(r.totalCollected as never),
    totalPaid: toNumber(r.totalPaid as never),
    totalNet: toNumber(r.totalNet as never),
    // The breakdown fields are the clear ones; fall back to the legacy scalars
    // an older deployment sends.
    outputTax: toNumber((r.outputTax ?? r.totalCollected) as never),
    inputTaxRecoverable: toNumber(r.inputTaxRecoverable as never),
    taxRemitted: toNumber((r.taxRemitted ?? r.totalPaid) as never),
  };
};

export const mapTaxPayment = (raw: unknown): TaxPayment => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    taxRateId: str(r.taxRateId),
    period: str(r.period),
    amount: toNumber(r.amount as never),
    paymentDate: str(r.paymentDate).slice(0, 10),
    reference: str(r.reference),
    journalEntryId: r.journalEntryId ? str(r.journalEntryId) : null,
    createdAt: str(r.createdAt),
  };
};

export interface Paged<T> {
  rows: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * The tax list endpoints return `{data, total, page, limit}` — but the
 * backend's ResponseEnvelopeInterceptor keeps only `data` (and `message`) from a
 * payload with a `data` key, so what actually arrives is `{success, data: [...]}`
 * and `total` is gone. When it is missing, `total` falls back to the rows
 * received; that is why the tax lists are fetched as one large page and paged on
 * the client (see taxNetwork).
 *
 * Tolerant of every shape a body could take — the paged object bare, wrapped in
 * `{success, data}`, the stripped envelope, or a bare array — so it stays
 * correct if the interceptor ever starts passing the paging fields through.
 */
export const pagedSerializer = <T>(
  body: unknown,
  map: (raw: unknown) => T,
  requested: { page: number; limit: number },
): Paged<T> => {
  const outer = asRaw(body);
  // `{success, data: {data, total, …}}` — the paged object is one level down.
  const inner = asRaw(outer.data);
  const container = Array.isArray(inner.data) ? inner : outer;
  const rows: unknown[] = Array.isArray(body)
    ? body
    : Array.isArray(container.data)
      ? (container.data as unknown[])
      : [];

  const limit = toNumber(container.limit as never) || requested.limit;
  const total =
    container.total !== undefined ? toNumber(container.total as never) : rows.length;
  return {
    rows: rows.map(map),
    page: toNumber(container.page as never) || requested.page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};
