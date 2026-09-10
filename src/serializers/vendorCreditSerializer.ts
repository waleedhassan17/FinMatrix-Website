// ═══════════════════════════════════════════════════════
// FinMatrix Web — Vendor Credit Serializer
// ═══════════════════════════════════════════════════════

import type {
  VendorCredit,
  VendorCreditFormData,
  VendorCreditLine,
  VendorCreditStatus,
} from '@/models/vendorCredit';
import { usableVendorCreditLines } from '@/models/vendorCredit';
import { asRaw, str } from '@/serializers/documentLines';
import { toDecimal, toNumber } from '@/utils/money';

/**
 * A credit line, which is NOT a `DocumentLine`.
 *
 * `mapDocumentLine` expects quantity/unitPrice/taxRate and reads the money from
 * `lineTotal`; a vendor credit line carries a NET `amount` and its own
 * `taxRate`, with no unit price at all.
 */
const mapVendorCreditLine = (raw: unknown): VendorCreditLine => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    accountId: str(r.accountId),
    itemId: str(r.itemId),
    itemName: str(r.itemName ?? asRaw(r.item).name),
    description: str(r.description),
    quantity: toNumber(r.quantity as never),
    amount: toNumber(r.amount as never),
    taxRate: toNumber(r.taxRate as never),
    lineOrder: toNumber(r.lineOrder as never),
  };
};

export const mapVendorCredit = (raw: unknown): VendorCredit => {
  const r = asRaw(raw);
  const rawLines = Array.isArray(r.lines) ? r.lines : [];

  return {
    id: str(r.id),
    companyId: str(r.companyId),
    vendorCreditNumber: str(r.vendorCreditNumber),
    vendorId: str(r.vendorId),
    // The LIST injects vendorName; the DETAIL does not, and does not load the
    // vendor relation either — so a detail screen must fall back to its own
    // vendor lookup rather than expect a name here.
    vendorName: str(
      r.vendorName ?? asRaw(r.vendor).companyName ?? asRaw(r.vendor).name,
    ),
    date: str(r.date),
    originalBillId: r.originalBillId ? str(r.originalBillId) : null,
    reason: str(r.reason),
    status: (str(r.status) || 'open') as VendorCreditStatus,
    lines: rawLines.map(mapVendorCreditLine),
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
 * `GET /vendor-credits` — `{data, pagination}`, not a bare array.
 *
 * The AP side paginates where the AR side does not, so the rows are under
 * `data`. Handled defensively either way.
 */
export const vendorCreditListSerializer = (payload: unknown): VendorCredit[] => {
  if (Array.isArray(payload)) return payload.map(mapVendorCredit);
  const d = asRaw(payload);
  const rows = Array.isArray(d.data) ? d.data : [];
  return rows.map(mapVendorCredit);
};

/** `GET /vendor-credits/:id` returns the entity itself, lines included. */
export const vendorCreditSingleSerializer = (
  payload: unknown,
): VendorCredit | null => {
  if (!payload || Array.isArray(payload)) return null;
  const d = asRaw(payload);
  const raw = d.vendorCredit ?? (d.id ? d : null);
  return raw ? mapVendorCredit(raw) : null;
};

// ═══════════════════════════════════════════════════════
// Form → API
// ═══════════════════════════════════════════════════════

export interface VendorCreditLineWritePayload {
  description: string;
  amount: string;
  taxRate?: string;
  itemId?: string;
  quantity?: string;
  accountId?: string;
}

export interface VendorCreditWritePayload {
  vendorId: string;
  date: string;
  reason?: string;
  lines: VendorCreditLineWritePayload[];
}

/**
 * Form → create payload.
 *
 * Three omission rules, all load-bearing:
 *   - `itemId` and `accountId` are left OFF rather than sent as `""`. Both are
 *     `@IsOptional() @IsUUID()`, and an empty string fails that outright.
 *   - `quantity` rides along only with an item. On a money-only line there is
 *     nothing to count and no stock to relieve.
 *   - `accountId` is dropped on an item line: that leg posts to Inventory, and
 *     the server explicitly refuses a non-stock line pointed at 1200.
 *
 * Absent entirely: any number (the server assigns it), the totals (it sums the
 * lines), and `status`. There is no PATCH route, so this has no update
 * counterpart — a vendor credit is immutable once created.
 */
export const vendorCreditFormToPayload = (
  form: VendorCreditFormData,
): VendorCreditWritePayload => ({
  vendorId: form.vendorId,
  date: form.date,
  reason: form.reason.trim() || undefined,
  lines: usableVendorCreditLines(form.lines).map((line) => {
    const payload: VendorCreditLineWritePayload = {
      description: line.description.trim(),
      amount: toDecimal(line.amount).toDecimalPlaces(2).toFixed(2),
    };

    const taxRate = toDecimal(line.taxRate);
    if (taxRate.greaterThan(0)) payload.taxRate = taxRate.toFixed();

    if (line.itemId) {
      payload.itemId = line.itemId;
      payload.quantity = toDecimal(line.quantity || '1').toFixed();
    } else if (line.accountId) {
      payload.accountId = line.accountId;
    }

    return payload;
  }),
});
