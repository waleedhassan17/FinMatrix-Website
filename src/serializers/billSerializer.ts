// ═══════════════════════════════════════════════════════
// FinMatrix Web — Bill Serializer
// ═══════════════════════════════════════════════════════

import {
  deriveBillStatus,
  isoToday,
  type Bill,
  type BillFormData,
  type BillFormLine,
  type BillLine,
  type BillStatus,
} from '@/models/bill';
import { asRaw, str } from '@/serializers/documentLines';
import { toNumber } from '@/utils/money';

const mapBillLine = (raw: unknown): BillLine => {
  const r = asRaw(raw);
  const account = asRaw(r.account);
  return {
    id: str(r.id),
    accountId: str(r.accountId),
    // The relation is loaded on a single bill but not in the list.
    accountName: str(account.name ?? r.accountName),
    description: str(r.description),
    taxRate: toNumber(r.taxRate as never),
    amount: toNumber((r.amount ?? r.lineTotal) as never),
  };
};

export const mapBill = (raw: unknown): Bill => {
  const r = asRaw(raw);
  const vendor = asRaw(r.vendor);
  const lines = Array.isArray(r.lines) ? r.lines : [];
  const status = (str(r.status) || 'draft') as BillStatus;
  const balance = toNumber((r.balanceDue ?? r.balance) as never);
  const dueDate = str(r.dueDate);

  return {
    id: str(r.id),
    companyId: str(r.companyId),
    billNumber: str(r.billNumber),
    vendorId: str(r.vendorId),
    // The vendor's name field is companyName, as everywhere on the AP side.
    vendorName: str(vendor.companyName ?? vendor.name ?? r.vendorName),
    // The wire calls it billDate; the form and the app call it issueDate.
    issueDate: str(r.billDate ?? r.issueDate),
    dueDate,
    // Re-derived rather than trusted: the column never holds `overdue`, and
    // whether the server bothered to derive it depends on which route answered.
    status: deriveBillStatus(status, balance, dueDate, isoToday()),
    purchaseOrderId: str(r.purchaseOrderId),
    lines: lines.map(mapBillLine),
    subtotal: toNumber(r.subtotal as never),
    taxAmount: toNumber((r.taxAmount ?? r.taxTotal) as never),
    total: toNumber(r.total as never),
    amountPaid: toNumber((r.amountPaid ?? r.paidAmount) as never),
    balance,
    // The wire calls it memo.
    notes: str(r.memo ?? r.notes),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
};

/**
 * `GET /bills` is **flat** — `{ data, pagination }` — so the response
 * interceptor keeps only `data` and the pagination is gone by the time it
 * reaches here. There is nothing to recover; the list is first-page-only,
 * exactly as invoices are, and the UI says so.
 *
 * Note this is the opposite of `GET /vendors`, which nests one level deeper
 * and keeps its metadata. Two contracts inside one feature area.
 */
export const billListSerializer = (payload: unknown): Bill[] => {
  if (Array.isArray(payload)) return payload.map(mapBill);
  const d = asRaw(payload);
  const rows = Array.isArray(d.data)
    ? d.data
    : Array.isArray(d.bills)
      ? (d.bills as unknown[])
      : [];
  return rows.map(mapBill);
};

export const billSingleSerializer = (payload: unknown): Bill | null => {
  if (!payload || Array.isArray(payload)) return null;
  const d = asRaw(payload);
  const raw = d.bill ?? (d.id ? d : null);
  return raw ? mapBill(raw) : null;
};

// ─── Payments against a bill ────────────────────────────

export interface BillPaymentAllocation {
  billId: string;
  billNumber: string;
  amount: number;
}

export interface BillPaymentRow {
  id: string;
  reference: string;
  date: string;
  method: string;
  /** This payment's share of THIS bill, not the payment's whole total. */
  appliedAmount: number;
  totalAmount: number;
  bankAccountName: string;
  proofId: string;
  proofFileName: string;
  proofMimeType: string;
  allocations: BillPaymentAllocation[];
}

/**
 * `GET /bills/:id/payments` returns `{ payments: [...] }` with **no `data`
 * key**, so the envelope wraps the whole object and `unwrapEnvelope` hands
 * back `{ payments }` rather than the array.
 *
 * Each row carries `applications` and a duplicate `allocations` alias holding
 * the same rows; either is read.
 */
export const billPaymentsSerializer = (
  payload: unknown,
  billId: string,
): BillPaymentRow[] => {
  const d = asRaw(payload);
  const rows: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(d.payments)
      ? (d.payments as unknown[])
      : Array.isArray(d.data)
        ? (d.data as unknown[])
        : [];

  return rows.map((raw) => {
    const r = asRaw(raw);
    const proof = asRaw(r.proof);
    const bank = asRaw(r.bankAccount);
    const applied = (
      Array.isArray(r.applications)
        ? r.applications
        : Array.isArray(r.allocations)
          ? r.allocations
          : []
    ) as unknown[];

    const allocations: BillPaymentAllocation[] = applied.map((a) => {
      const x = asRaw(a);
      return {
        billId: str(x.billId),
        billNumber: str(asRaw(x.bill).billNumber ?? x.billNumber),
        amount: toNumber((x.amountApplied ?? x.amount) as never),
      };
    });

    const mine = allocations.find((a) => a.billId === billId);

    return {
      id: str(r.id),
      reference:
        str(r.reference ?? r.paymentNumber) ||
        `PAY-${str(r.id).slice(0, 8).toUpperCase()}`,
      date: str(r.paymentDate ?? r.date),
      method: str(r.paymentMethod),
      // Falls back to the payment total only when there are no allocation rows
      // to read — with one, the bill's own share is the honest figure.
      appliedAmount: mine
        ? mine.amount
        : toNumber((r.totalAmount ?? r.amount) as never),
      totalAmount: toNumber((r.totalAmount ?? r.amount) as never),
      bankAccountName: str(bank.name ?? r.bankAccountName),
      proofId: str(r.proofId ?? proof.id),
      proofFileName: str(proof.fileName ?? proof.originalName ?? r.proofFileName),
      proofMimeType: str(proof.mimeType ?? r.proofMimeType),
      allocations,
    };
  });
};

// ═══════════════════════════════════════════════════════
// Form ↔ API
// ═══════════════════════════════════════════════════════

export interface BillLineWritePayload {
  accountId: string;
  description: string;
  amount: string;
  taxRate: string;
}

export interface BillWritePayload {
  vendorId: string;
  billDate: string;
  dueDate: string;
  lines: BillLineWritePayload[];
  status?: 'draft' | 'open';
  billNumber?: string;
  memo?: string;
  purchaseOrderId?: string;
}

let importedSeq = 0;

export const billToFormData = (bill: Bill): BillFormData => ({
  vendorId: bill.vendorId,
  vendorName: bill.vendorName,
  billNumber: bill.billNumber,
  issueDate: bill.issueDate.slice(0, 10),
  dueDate: bill.dueDate.slice(0, 10),
  lines: bill.lines.map(
    (l): BillFormLine => ({
      id: l.id || `imported_${++importedSeq}`,
      accountId: l.accountId,
      description: l.description,
      amount: String(l.amount),
      taxRate: String(l.taxRate),
    }),
  ),
  notes: bill.notes,
});

/**
 * Form → the create/update payload. Four things the DTO insists on:
 *
 *   • the date field is **`billDate`**, not `issueDate`
 *   • the note field is **`memo`**, not `notes`
 *   • a line sends **`amount`** — `quantity` + `unitPrice` are accepted as an
 *     alternative but **neither is persisted**, so a bill saved that way reads
 *     back with the amount only. `amount` is the sole shape that round-trips.
 *   • `amount` and `taxRate` are `@IsNumberString` — strings, not numbers
 *
 * And there is no discount field of any kind. Sending one is ignored.
 */
export const billFormToPayload = (
  form: BillFormData,
  status: 'draft' | 'open',
): BillWritePayload => ({
  vendorId: form.vendorId,
  billDate: form.issueDate,
  dueDate: form.dueDate,
  status,
  lines: form.lines.map((l) => ({
    accountId: l.accountId,
    description: l.description.trim(),
    amount: String(parseFloat(l.amount) || 0),
    taxRate: String(parseFloat(l.taxRate) || 0),
  })),
  // Optional strings still have to be omitted rather than sent blank: the
  // vendor's own number is genuinely absent on many bills.
  ...(form.billNumber.trim() ? { billNumber: form.billNumber.trim() } : {}),
  ...(form.notes.trim() ? { memo: form.notes.trim() } : {}),
});
