// ═══════════════════════════════════════════════════════
// FinMatrix Web — Invoice Serializer
// ═══════════════════════════════════════════════════════
// Ported from the app's src/serializers/invoiceSerializer.ts. The `??` chains
// are load-bearing — the wire and the UI disagree on several field names, and
// list and detail responses are shaped differently from each other.

import { linesToPayload } from '@/serializers/documentLines';
import {
  type DiscountType,
  type FormLineItem,
  type Invoice,
  type InvoiceFormData,
  type InvoiceLine,
  type InvoiceStatus,
} from '@/models/invoice';
import { toNumber } from '@/utils/money';

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const str = (v: unknown, fallback = ''): string =>
  v === null || v === undefined ? fallback : String(v);

let importedLineSeq = 0;

export const mapInvoiceLine = (raw: unknown): InvoiceLine => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    itemId: str(r.itemId ?? r.inventoryItemId),
    itemName: str(r.itemName ?? r.description),
    description: str(r.description),
    quantity: toNumber(r.quantity as never),
    unitPrice: toNumber(r.unitPrice as never),
    taxRate: toNumber(r.taxRate as never),
    // The wire calls it lineTotal; the app calls it amount.
    amount: toNumber((r.amount ?? r.lineTotal) as never),
  };
};

export const mapInvoice = (raw: unknown): Invoice => {
  const r = asRaw(raw);
  const rawLines = Array.isArray(r.lines)
    ? r.lines
    : Array.isArray(r.items)
      ? r.items
      : [];

  const total = toNumber(r.total as never);
  const amountPaid = toNumber(r.amountPaid as never);

  return {
    id: str(r.id),
    companyId: str(r.companyId),
    invoiceNumber: str(r.invoiceNumber),
    customerId: str(r.customerId),
    // List rows carry customerName; detail rows may not.
    customerName: str(r.customerName ?? asRaw(r.customer).name),
    // The wire calls it invoiceDate; both clients call it issueDate.
    issueDate: str(r.issueDate ?? r.invoiceDate),
    dueDate: str(r.dueDate),
    status: (str(r.status) || 'draft') as InvoiceStatus,
    lines: rawLines.map(mapInvoiceLine),
    subtotal: toNumber(r.subtotal as never),
    taxAmount: toNumber(r.taxAmount as never),
    discountType: (str(r.discountType) || 'none') as DiscountType,
    discountValue: toNumber(r.discountValue as never),
    discountAmount: toNumber(r.discountAmount as never),
    total,
    amountPaid,
    // The server sends `balance` and guarantees total − paid = balance via a
    // check constraint, but it is derived here when absent so a partial
    // payload still renders a correct figure.
    balance: r.balance != null ? toNumber(r.balance as never) : total - amountPaid,
    notes: str(r.notes),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
};

/**
 * `GET /invoices` — a BARE ARRAY, with no pagination and no summary.
 *
 * InvoicesService.list returns a flat `{data, summary, pagination}`; the
 * envelope interceptor lifts `data` and discards its siblings. Compare
 * CustomersService.list, which nests one level deeper on purpose and keeps
 * everything. That asymmetry is why the two list screens page differently:
 * here the only signal that more rows exist is `rows.length === limit`.
 *
 * List rows carry `customerName` but NO `lines` — never hydrate an edit form
 * from one.
 */
export const invoiceListSerializer = (payload: unknown): Invoice[] => {
  if (Array.isArray(payload)) return payload.map(mapInvoice);
  const d = asRaw(payload);
  const rows = Array.isArray(d.data)
    ? d.data
    : Array.isArray(d.invoices)
      ? (d.invoices as unknown[])
      : [];
  return rows.map(mapInvoice);
};

export const invoiceSingleSerializer = (payload: unknown): Invoice | null => {
  if (!payload || Array.isArray(payload)) return null;
  const d = asRaw(payload);
  const raw = d.invoice ?? (d.id ? d : null);
  return raw ? mapInvoice(raw) : null;
};

// ═══════════════════════════════════════════════════════
// Form ↔ API
// ═══════════════════════════════════════════════════════

export interface InvoiceLineWritePayload {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  itemId?: string;
}

export interface InvoiceWritePayload {
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  status?: 'draft' | 'sent';
  discountType: DiscountType;
  discountValue: string;
  notes?: string;
  lines: InvoiceLineWritePayload[];
  /** Owner only: post past the customer's credit limit, with a reason. */
  creditOverride?: { reason: string };
}

/**
 * Form data → the create payload.
 *
 * Three things the DTO insists on:
 *
 *  • Money fields are `@IsNumberString` — quantity, unitPrice, taxRate and
 *    discountValue all go out as STRINGS.
 *  • `itemId` is `@IsOptional() @IsUUID()`. An empty string is not a valid
 *    UUID, so the key is OMITTED entirely rather than sent blank.
 *  • `invoiceNumber` is never sent. The server assigns it, as
 *    `INV-<year>-<seq4>`. The app has an editable invoice-number field that it
 *    then throws away, so the number a user types is never the number they get.
 */
export const invoiceFormToPayload = (
  form: InvoiceFormData,
  status?: 'draft' | 'sent',
): InvoiceWritePayload => ({
  customerId: form.customerId,
  invoiceDate: form.issueDate,
  dueDate: form.dueDate,
  ...(status ? { status } : {}),
  discountType: form.discountType,
  discountValue: String(parseFloat(form.discountValue) || 0),
  notes: form.notes.trim() || undefined,
  // Same rules as every sales document (documentLines.linesToPayload): an
  // item line says 'item'; a line without one is a service only if marked so.
  lines: linesToPayload(form.lines),
});

/**
 * The update payload is a NARROWER whitelist than create.
 *
 * `UpdateInvoiceDto` is not a PartialType: `customerId`, `status` and
 * `paymentTerms` are absent from it and are silently stripped by the global
 * ValidationPipe's `whitelist: true` — no error, they simply do not apply.
 * Sending them would look like it worked. So they are not sent.
 */
export const invoiceFormToUpdatePayload = (
  form: InvoiceFormData,
): Omit<InvoiceWritePayload, 'customerId' | 'status'> => {
  const { customerId: _customerId, status: _status, ...rest } = invoiceFormToPayload(form);
  return rest;
};

/** An Invoice from the API → form-ready data. */
export const invoiceToFormData = (invoice: Invoice): InvoiceFormData => ({
  customerId: invoice.customerId,
  customerName: invoice.customerName,
  issueDate: invoice.issueDate.slice(0, 10),
  dueDate: invoice.dueDate.slice(0, 10),
  discountType: invoice.discountType,
  discountValue: String(invoice.discountValue ?? 0),
  notes: invoice.notes,
  lines: invoice.lines.map(
    (l): FormLineItem => ({
      id: l.id || `imported_${++importedLineSeq}`,
      itemId: l.itemId,
      lineKind: l.itemId ? 'item' : 'service',
      description: l.description,
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
      taxRate: String(l.taxRate),
    }),
  ),
});
