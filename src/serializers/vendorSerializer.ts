// ═══════════════════════════════════════════════════════
// FinMatrix Web — Vendor Serializer
// ═══════════════════════════════════════════════════════

import {
  paymentTermsFromApi,
  PAYMENT_TERMS_TO_API,
  type PaymentTerms,
} from '@/models/customer';
import type { Vendor, VendorAddress, VendorFormData } from '@/models/vendor';
import { paymentMethodLabel } from '@/models/payment';
import { asRaw, str } from '@/serializers/documentLines';
import type { Pagination } from '@/serializers/customerSerializer';
import { toNumber } from '@/utils/money';

const mapAddress = (raw: unknown): VendorAddress => {
  const a = asRaw(raw);
  return {
    street: str(a.street),
    city: str(a.city),
    state: str(a.state),
    zipCode: str(a.zipCode ?? a.postalCode),
    country: str(a.country) || 'Pakistan',
  };
};

export const mapVendor = (raw: unknown): Vendor => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    companyId: str(r.companyId),
    // The wire calls it companyName; there is no separate `name`.
    name: str(r.companyName ?? r.name),
    contactPerson: str(r.contactPerson),
    email: str(r.email),
    phone: str(r.phone),
    address: mapAddress(r.address),
    paymentTerms: paymentTermsFromApi(r.paymentTerms),
    taxId: str(r.taxId),
    defaultExpenseAccountId: str(r.defaultExpenseAccountId),
    balance: toNumber(r.balance as never),
    isActive: r.isActive === undefined ? true : Boolean(r.isActive),
    notes: str(r.notes),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
};

export interface SerializedVendorList {
  vendors: Vendor[];
  pagination: Pagination;
}

const pagination = (p: Record<string, unknown>, rowCount: number): Pagination => ({
  page: Number(p.page ?? 1),
  limit: Number(p.limit ?? rowCount),
  total: Number(p.total ?? rowCount),
  totalPages: Number(p.totalPages ?? 1),
});

/**
 * `GET /vendors` **keeps its pagination**.
 *
 * `VendorsService.list` nests one level deeper (`{ data: { data, pagination } }`),
 * so the envelope lifts the outer `data` and the metadata survives — the same
 * shape as customers, and the opposite of `GET /bills`, which is flat and
 * loses it. Two contracts in one feature area; do not share a pager.
 *
 * Unlike customers there is no `summary` block.
 */
export const vendorListSerializer = (payload: unknown): SerializedVendorList => {
  const d = asRaw(payload);
  const rows: unknown[] = Array.isArray(d.data)
    ? d.data
    : Array.isArray(d.vendors)
      ? (d.vendors as unknown[])
      : Array.isArray(payload)
        ? (payload as unknown[])
        : [];

  return {
    vendors: rows.map(mapVendor),
    pagination: pagination(asRaw(d.pagination), rows.length),
  };
};

export const vendorSingleSerializer = (payload: unknown): Vendor | null => {
  if (!payload || Array.isArray(payload)) return null;
  const d = asRaw(payload);
  const raw = d.vendor ?? (d.id ? d : null);
  return raw ? mapVendor(raw) : null;
};

// ─── Detail tabs ─────────────────────────────────────

export interface VendorBillRow {
  id: string;
  billNumber: string;
  date: string;
  dueDate: string;
  amount: number;
  balance: number;
  status: string;
}

export interface VendorPaymentRow {
  id: string;
  reference: string;
  date: string;
  amount: number;
  method: string;
}

export interface PagedRows<T> {
  rows: T[];
  pagination: Pagination;
}

const unwrapPaged = (
  payload: unknown,
): { rows: Record<string, unknown>[]; pagination: Record<string, unknown> } => {
  if (Array.isArray(payload))
    return { rows: payload as Record<string, unknown>[], pagination: {} };
  const d = asRaw(payload);
  if (Array.isArray(d.data))
    return {
      rows: d.data as Record<string, unknown>[],
      pagination: asRaw(d.pagination),
    };
  return { rows: [], pagination: {} };
};

/**
 * Bills for a vendor.
 *
 * Note these rows do NOT carry the derived `overdue` status — that derivation
 * is applied by `GET /bills` and `GET /bills/:id` only, so the same past-due
 * bill reads `open` here and `overdue` in the bills list. Rather than let the
 * two disagree, the status is re-derived below from the same rule.
 */
export const vendorBillsSerializer = (
  payload: unknown,
): PagedRows<VendorBillRow> => {
  const { rows, pagination: p } = unwrapPaged(payload);
  const today = new Date().toISOString().slice(0, 10);

  return {
    rows: rows.map((raw) => {
      const status = str(raw.status) || 'open';
      const balance = toNumber((raw.balanceDue ?? raw.balance) as never);
      const dueDate = str(raw.dueDate);
      const derivedOverdue =
        balance > 0 &&
        dueDate !== '' &&
        dueDate < today &&
        (status === 'open' || status === 'partial');

      return {
        id: str(raw.id),
        billNumber: str(raw.billNumber ?? raw.number) || '—',
        date: str(raw.billDate ?? raw.date),
        dueDate,
        amount: toNumber(raw.total as never),
        balance,
        status: derivedOverdue ? 'overdue' : status,
      };
    }),
    pagination: pagination(p, rows.length),
  };
};

export const vendorPaymentsSerializer = (
  payload: unknown,
): PagedRows<VendorPaymentRow> => {
  const { rows, pagination: p } = unwrapPaged(payload);
  return {
    rows: rows.map((raw) => ({
      id: str(raw.id),
      reference:
        str(raw.reference) || `PAY-${str(raw.id).slice(0, 8).toUpperCase()}`,
      date: str(raw.paymentDate ?? raw.date),
      // Vendor payments carry `totalAmount`, not `amount`.
      amount: toNumber((raw.totalAmount ?? raw.amount) as never),
      method: paymentMethodLabel(str(raw.paymentMethod)),
    })),
    pagination: pagination(p, rows.length),
  };
};

// ─── Statement ───────────────────────────────────────

export interface VendorStatementLine {
  id: string;
  date: string;
  kind: 'bill' | 'payment';
  reference: string;
  /** Positive increases what we owe; negative reduces it. */
  amount: number;
  runningBalance: number;
}

export interface VendorStatement {
  vendor: { id: string; name: string; email: string };
  period: { startDate: string; endDate: string };
  openingBalance: number;
  lines: VendorStatementLine[];
  totals: { billed: number; paid: number };
  closingBalance: number;
}

/**
 * The statement returns bills and payments as two arrays. A statement reads as
 * one chronological ledger, so they are merged here and a running balance
 * accumulated — the server sends opening and closing figures but nothing
 * per row. Same treatment as the customer statement.
 */
export const vendorStatementSerializer = (payload: unknown): VendorStatement => {
  const d = asRaw(payload);
  const v = asRaw(d.vendor);
  const period = asRaw(d.period);
  const totals = asRaw(d.totals);
  const openingBalance = toNumber(d.openingBalance as never);

  const bills = (Array.isArray(d.bills) ? d.bills : []) as Record<string, unknown>[];
  const payments = (Array.isArray(d.payments) ? d.payments : []) as Record<
    string,
    unknown
  >[];

  const merged: Omit<VendorStatementLine, 'runningBalance'>[] = [
    ...bills.map((raw) => ({
      id: str(raw.id),
      date: str(raw.billDate ?? raw.date),
      kind: 'bill' as const,
      reference: str(raw.billNumber) || '—',
      amount: toNumber(raw.total as never),
    })),
    ...payments.map((raw) => ({
      id: str(raw.id),
      date: str(raw.paymentDate ?? raw.date),
      kind: 'payment' as const,
      reference: str(raw.reference) || '—',
      amount: -toNumber((raw.totalAmount ?? raw.amount) as never),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  let running = openingBalance;
  const lines: VendorStatementLine[] = merged.map((line) => {
    running += line.amount;
    return { ...line, runningBalance: running };
  });

  return {
    // The server labels it `name`, sourced from companyName.
    vendor: { id: str(v.id), name: str(v.name), email: str(v.email) },
    period: { startDate: str(period.startDate), endDate: str(period.endDate) },
    openingBalance,
    lines,
    totals: {
      billed: toNumber(totals.billed as never),
      paid: toNumber(totals.paid as never),
    },
    closingBalance: toNumber(d.closingBalance as never),
  };
};

// ═══════════════════════════════════════════════════════
// Form ↔ API
// ═══════════════════════════════════════════════════════

export const vendorToFormData = (vendor: Vendor): VendorFormData => ({
  name: vendor.name,
  contactPerson: vendor.contactPerson,
  email: vendor.email,
  phone: vendor.phone,
  street: vendor.address.street,
  city: vendor.address.city,
  state: vendor.address.state,
  zipCode: vendor.address.zipCode,
  country: vendor.address.country,
  paymentTerms: vendor.paymentTerms,
  taxId: vendor.taxId,
  defaultExpenseAccountId: vendor.defaultExpenseAccountId,
  notes: vendor.notes,
});

export interface VendorWritePayload {
  companyName: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address: Record<string, string>;
  paymentTerms: string;
  taxId?: string;
  defaultExpenseAccountId?: string;
  notes?: string;
}

/**
 * Form → the create/update payload.
 *
 * Three shapes that differ from the customer equivalent:
 *   • the name field is **`companyName`**, not `name`
 *   • there is **one** address, and `zipCode` still goes out as `postalCode`
 *   • `defaultExpenseAccountId` is `@IsUUID()`, so a blank must be OMITTED —
 *     `''` would fail validation rather than clear the field
 */
export const vendorFormToPayload = (form: VendorFormData): VendorWritePayload => ({
  companyName: form.name.trim(),
  contactPerson: form.contactPerson.trim() || undefined,
  email: form.email.trim() || undefined,
  phone: form.phone.trim() || undefined,
  address: {
    street: form.street.trim(),
    city: form.city.trim(),
    state: form.state.trim(),
    postalCode: form.zipCode.trim(),
    country: form.country.trim() || 'Pakistan',
  },
  paymentTerms:
    PAYMENT_TERMS_TO_API[(form.paymentTerms || 'net_30') as PaymentTerms],
  taxId: form.taxId.trim() || undefined,
  defaultExpenseAccountId: form.defaultExpenseAccountId || undefined,
  notes: form.notes.trim() || undefined,
});
