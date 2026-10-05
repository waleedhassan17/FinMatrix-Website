// ═══════════════════════════════════════════════════════
// FinMatrix Web — Customer Serializer
// ═══════════════════════════════════════════════════════
// Ported from the app's src/serializers/customerSerializer.ts.
//
// The API stores decimals as 4-dp strings ("1500.0000") and addresses with
// `postalCode`; both clients use numbers and `zipCode`. Every coercion and
// rename lives here so no screen has to know.

import {
  paymentTermsFromApi,
  type Customer,
  type CustomerAddress,
  type CustomerCredit,
  type CustomerFormData,
  type PaymentTerms,
} from '@/models/customer';
import { PAYMENT_TERMS_TO_API } from '@/models/customer';
import { normalizePartyCode } from '@/models/partyCode';
import { paymentMethodLabel } from '@/models/payment';
import { toNumber } from '@/utils/money';

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const str = (v: unknown, fallback = ''): string =>
  v === null || v === undefined ? fallback : String(v);

const mapAddress = (raw: unknown): CustomerAddress => {
  const a = asRaw(raw);
  return {
    street: str(a.street),
    city: str(a.city),
    state: str(a.state),
    // The wire calls it postalCode; the app calls it zipCode. The server also
    // accepts zipCode as an alias, so both are read.
    zipCode: str(a.zipCode ?? a.postalCode),
    country: str(a.country) || 'Pakistan',
  };
};

// ─── Raw entity → UI Customer ────────────────────────

export const mapCustomer = (raw: unknown): Customer => {
  const r = asRaw(raw);
  const billing = mapAddress(r.billingAddress);
  const shipping = mapAddress(r.shippingAddress);
  return {
    id: str(r.id),
    companyId: str(r.companyId),
    code: str(r.code),
    name: str(r.name),
    company: str(r.company),
    email: str(r.email),
    phone: str(r.phone),
    address:
      str(r.address) || [billing.street, billing.city].filter(Boolean).join(', '),
    billingAddress: billing,
    shippingAddress: shipping,
    balance: toNumber(r.balance as never),
    creditLimit: toNumber(r.creditLimit as never),
    totalPurchases: toNumber(r.totalPurchases as never),
    paymentTerms: paymentTermsFromApi(r.paymentTerms),
    contactPerson: str(r.contactPerson),
    taxId: str(r.taxId),
    notes: str(r.notes),
    isActive: r.isActive === undefined ? true : Boolean(r.isActive),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
};

// ─── List ────────────────────────────────────────────

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SerializedCustomerList {
  customers: Customer[];
  pagination: Pagination;
  /** Company-wide, NOT scoped to the current filter. */
  summary: { total: number; outstandingBalance: number };
}

/**
 * `GET /customers` keeps its pagination.
 *
 * CustomersService.list nests one level deeper than its siblings do
 * (`{ data: { data, summary, pagination } }`), which is the only reason the
 * envelope interceptor does not eat the metadata — it lifts the outer `data`
 * and the inner object survives intact. The invoices list is NOT written this
 * way and loses everything but the rows; see invoiceSerializer.
 *
 * Input here is the already-unwrapped payload from unwrapEnvelope().
 */
export const customerListSerializer = (payload: unknown): SerializedCustomerList => {
  const d = asRaw(payload);
  const rows: unknown[] = Array.isArray(d.data)
    ? d.data
    : Array.isArray(d.customers)
      ? (d.customers as unknown[])
      : Array.isArray(payload)
        ? (payload as unknown[])
        : [];
  const p = asRaw(d.pagination);
  const s = asRaw(d.summary);

  return {
    customers: rows.map(mapCustomer),
    pagination: {
      page: Number(p.page ?? 1),
      limit: Number(p.limit ?? rows.length),
      total: Number(p.total ?? rows.length),
      totalPages: Number(p.totalPages ?? 1),
    },
    summary: {
      total: toNumber(s.total as never),
      outstandingBalance: toNumber(s.outstandingBalance as never),
    },
  };
};

// ─── Detail ──────────────────────────────────────────

export interface SerializedCustomerDetail {
  customer: Customer;
  credit: CustomerCredit;
}

/**
 * `GET /customers/:id` returns `{ customer, totalPurchases, recentInvoices,
 * recentPayments, credit }` — note that `totalPurchases` is a SIBLING of the
 * customer, not a field on it, so it has to be folded in by hand.
 */
export const customerDetailSerializer = (
  payload: unknown,
): SerializedCustomerDetail | null => {
  const d = asRaw(payload);
  const rawCustomer = d.customer ?? (d.id ? d : null);
  if (!rawCustomer) return null;

  const customer = mapCustomer(rawCustomer);
  if (d.totalPurchases != null) {
    customer.totalPurchases = toNumber(d.totalPurchases as never);
  }

  const c = asRaw(d.credit);
  return {
    customer,
    credit: {
      limit: c.limit != null ? toNumber(c.limit as never) : customer.creditLimit,
      used: c.used != null ? toNumber(c.used as never) : customer.balance,
      available:
        c.available != null
          ? toNumber(c.available as never)
          : Math.max(customer.creditLimit - customer.balance, 0),
      advances: toNumber((c.advances ?? 0) as never),
    },
  };
};

// ─── Detail tabs ─────────────────────────────────────

export interface CustomerInvoiceRow {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  amount: number;
  balance: number;
  status: string;
}

export interface CustomerPaymentRow {
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

const unwrapPaged = (payload: unknown): { rows: Raw[]; pagination: Raw } => {
  if (Array.isArray(payload)) return { rows: payload as Raw[], pagination: {} };
  const d = asRaw(payload);
  if (Array.isArray(d.data))
    return { rows: d.data as Raw[], pagination: asRaw(d.pagination) };
  return { rows: [], pagination: {} };
};

const pagination = (p: Raw, rowCount: number): Pagination => ({
  page: Number(p.page ?? 1),
  limit: Number(p.limit ?? rowCount),
  total: Number(p.total ?? rowCount),
  totalPages: Number(p.totalPages ?? 1),
});

export const customerInvoicesSerializer = (
  payload: unknown,
): PagedRows<CustomerInvoiceRow> => {
  const { rows, pagination: p } = unwrapPaged(payload);
  return {
    rows: rows.map((raw) => ({
      id: str(raw.id),
      invoiceNumber: str(raw.invoiceNumber ?? raw.number) || '—',
      date: str(raw.invoiceDate ?? raw.date),
      dueDate: str(raw.dueDate),
      amount: toNumber(raw.total as never),
      balance: toNumber((raw.balanceDue ?? raw.balance) as never),
      status: str(raw.status) || 'sent',
    })),
    pagination: pagination(p, rows.length),
  };
};

export const customerPaymentsSerializer = (
  payload: unknown,
): PagedRows<CustomerPaymentRow> => {
  const { rows, pagination: p } = unwrapPaged(payload);
  return {
    rows: rows.map((raw) => ({
      id: str(raw.id),
      reference:
        str(raw.reference) ||
        `PAY-${str(raw.id).slice(0, 8).toUpperCase()}`,
      date: str(raw.paymentDate ?? raw.date),
      amount: toNumber(raw.amount as never),
      method: paymentMethodLabel(str(raw.paymentMethod)),
    })),
    pagination: pagination(p, rows.length),
  };
};

// ─── Statement ───────────────────────────────────────

/**
 * What a statement line is. Read from the books, so a void is a line of its own
 * on the day it was voided, and an advance paid with a delivery (before
 * receipts existed for it) counts as money received.
 */
export type StatementLineKind =
  | 'invoice'
  | 'invoice_void'
  | 'payment'
  | 'payment_void'
  | 'credit_memo'
  | 'credit_memo_void'
  | 'refund'
  | 'advance'
  | 'other';

/** What each line is, as the statement names it. */
export const STATEMENT_KIND_LABELS: Record<StatementLineKind, string> = {
  invoice: 'Invoice',
  invoice_void: 'Invoice voided',
  payment: 'Payment',
  payment_void: 'Payment reversed',
  credit_memo: 'Credit memo',
  credit_memo_void: 'Credit memo voided',
  refund: 'Refund',
  advance: 'Advance received',
  other: 'Adjustment',
};

const STATEMENT_KINDS = new Set<string>(Object.keys(STATEMENT_KIND_LABELS));

export interface StatementLine {
  id: string;
  date: string;
  kind: StatementLineKind;
  reference: string;
  /** Positive increases what they owe, negative reduces it. */
  amount: number;
  runningBalance: number;
  /** The document behind the line, when it still exists — `invoice`, `payment`, … */
  documentType: string | null;
  documentId: string | null;
}

export interface CustomerStatement {
  customer: { id: string; code: string; name: string; email: string };
  period: { startDate: string; endDate: string };
  openingBalance: number;
  lines: StatementLine[];
  totals: { invoiced: number; received: number; credited: number; refunded: number };
  closingBalance: number;
}

/**
 * `GET /customers/:id/ledger-statement` — the statement read from the books.
 *
 * The server builds it from the same postings as the customer's view in the
 * General Ledger and sends it ready to print: one line per transaction, in
 * date order, each with its running balance. (The old `/statement` sent four
 * document arrays to merge here, and missed what was posted without a
 * document — a legacy prepaid delivery's advance — so it overstated some
 * balances.)
 */
export const customerStatementSerializer = (payload: unknown): CustomerStatement => {
  const d = asRaw(payload);
  const c = asRaw(d.party ?? d.customer);
  const period = asRaw(d.period);
  const totals = asRaw(d.totals);
  const lines = (Array.isArray(d.lines) ? d.lines : []).map((item): StatementLine => {
    const raw = asRaw(item);
    const kind = str(raw.kind);
    return {
      id: str(raw.id),
      date: str(raw.date),
      kind: (STATEMENT_KINDS.has(kind) ? kind : 'other') as StatementLineKind,
      reference: str(raw.reference) || '—',
      amount: toNumber(raw.amount as never),
      runningBalance: toNumber(raw.balance as never),
      documentType: str(raw.documentType) || null,
      documentId: str(raw.documentId) || null,
    };
  });

  return {
    customer: { id: str(c.id), code: str(c.code), name: str(c.name), email: str(c.email) },
    period: { startDate: str(period.startDate), endDate: str(period.endDate) },
    openingBalance: toNumber(d.openingBalance as never),
    lines,
    totals: {
      invoiced: toNumber(totals.invoiced as never),
      received: toNumber(totals.received as never),
      credited: toNumber(totals.credited as never),
      refunded: toNumber(totals.refunded as never),
    },
    closingBalance: toNumber(d.closingBalance as never),
  };
};

// ═══════════════════════════════════════════════════════
// Form ↔ API
// ═══════════════════════════════════════════════════════

/** A Customer from the API → form-ready data for editing. */
export const customerToFormData = (customer: Customer): CustomerFormData => {
  const b = customer.billingAddress;
  const s = customer.shippingAddress;
  // Derived, not stored: the server has no sameAsBilling flag on the record,
  // only on the write DTO.
  const sameAsBilling =
    b.street === s.street &&
    b.city === s.city &&
    b.state === s.state &&
    b.zipCode === s.zipCode &&
    b.country === s.country;

  return {
    code: customer.code,
    name: customer.name,
    company: customer.company,
    email: customer.email,
    phone: customer.phone,
    billingStreet: b.street,
    billingCity: b.city,
    billingState: b.state,
    billingZipCode: b.zipCode,
    billingCountry: b.country,
    sameAsBilling,
    shippingStreet: s.street,
    shippingCity: s.city,
    shippingState: s.state,
    shippingZipCode: s.zipCode,
    shippingCountry: s.country,
    creditLimit: String(customer.creditLimit),
    paymentTerms: customer.paymentTerms,
    contactPerson: customer.contactPerson,
    taxId: customer.taxId,
    notes: customer.notes,
  };
};

export interface CustomerWritePayload {
  /** Omitted: the server assigns the next ID on create, and keeps the current one on an edit. */
  code?: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  billingAddress: Record<string, string>;
  shippingAddress: Record<string, string>;
  creditLimit: string;
  paymentTerms: string;
  contactPerson?: string;
  taxId?: string;
  notes?: string;
}

/**
 * Form data → the create/update payload.
 *
 * Three shapes here are not negotiable, and each has bitten the app:
 *   • `zipCode` goes out as `postalCode`
 *   • `creditLimit` is a STRING — the DTO is @IsNumberString, a JSON number
 *     is not guaranteed to pass
 *   • payment terms go out in the API dialect (`net30`), not the app's
 *     (`net_30`), or the server rejects the enum with a 400
 *
 * Blank optionals become `undefined` so axios omits them rather than sending
 * `""`, which would overwrite a real value with an empty string on PATCH.
 */
export const formDataToCustomerPayload = (
  form: CustomerFormData,
): CustomerWritePayload => {
  const billingAddress = {
    street: form.billingStreet.trim(),
    city: form.billingCity.trim(),
    state: form.billingState.trim(),
    postalCode: form.billingZipCode.trim(),
    country: form.billingCountry.trim() || 'Pakistan',
  };

  const shippingAddress = form.sameAsBilling
    ? { ...billingAddress }
    : {
        street: form.shippingStreet.trim(),
        city: form.shippingCity.trim(),
        state: form.shippingState.trim(),
        postalCode: form.shippingZipCode.trim(),
        country: form.shippingCountry.trim() || 'Pakistan',
      };

  return {
    code: normalizePartyCode(form.code) || undefined,
    name: form.name.trim(),
    company: form.company.trim() || undefined,
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    billingAddress,
    shippingAddress,
    creditLimit: String(parseFloat(form.creditLimit) || 0),
    paymentTerms:
      PAYMENT_TERMS_TO_API[(form.paymentTerms || 'net_30') as PaymentTerms],
    contactPerson: form.contactPerson.trim() || undefined,
    taxId: form.taxId.trim() || undefined,
    notes: form.notes.trim() || undefined,
  };
};
