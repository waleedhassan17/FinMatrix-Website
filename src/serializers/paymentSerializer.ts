// ═══════════════════════════════════════════════════════
// FinMatrix Web — Payment Serializer
// ═══════════════════════════════════════════════════════

import {
  totalAllocated,
  unappliedOf,
  type AllocationRow,
  type ApiPaymentMethod,
  type CustomerAdvance,
  type Payment,
  type PaymentApplication,
  type PaymentFormData,
} from '@/models/payment';
import { asRaw, str } from '@/serializers/documentLines';
import { toNumber } from '@/utils/money';
import Decimal from 'decimal.js';

const mapApplication = (raw: unknown): PaymentApplication => {
  const r = asRaw(raw);
  return {
    invoiceId: str(r.invoiceId),
    invoiceNumber: str(r.invoiceNumber),
    // The wire calls it amountApplied on the way out and `amount` on the way
    // in. Both are read so a replayed approval payload maps too.
    amountApplied: toNumber((r.amountApplied ?? r.amount) as never),
    appliedOn: str(r.appliedOn),
    invoiceTotal: r.invoiceTotal == null ? null : toNumber(r.invoiceTotal as never),
    invoiceBalance: r.invoiceBalance == null ? null : toNumber(r.invoiceBalance as never),
  };
};

export const mapPayment = (raw: unknown): Payment => {
  const r = asRaw(raw);
  const applications = (
    Array.isArray(r.applications) ? r.applications : []
  ).map(mapApplication);

  const amount = toNumber(r.amount as never);
  const allocated = applications
    .reduce((acc, a) => acc.plus(a.amountApplied), new Decimal(0))
    .toDecimalPlaces(2)
    .toNumber();

  return {
    id: str(r.id),
    companyId: str(r.companyId),
    customerId: str(r.customerId),
    customerName: str(r.customerName ?? asRaw(r.customer).name),
    paymentDate: str(r.paymentDate ?? r.date),
    paymentMethod: (str(r.paymentMethod) || 'other') as ApiPaymentMethod,
    paymentNumber: str(r.paymentNumber),
    reference: str(r.reference),
    amount,
    bankAccountId: r.bankAccountId ? str(r.bankAccountId) : null,
    // The wire field is `memo`; the app's UI calls it notes.
    memo: str(r.memo ?? r.notes),
    applications,
    allocated,
    // The remainder is held in 2400 Customer Advances until applied.
    unapplied: unappliedOf(amount, allocated),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
};

/**
 * `GET /payments` — a BARE ARRAY.
 *
 * `PaymentsService.list` returns a flat `{data, pagination}` and the response
 * envelope lifts `data`, discarding the rest. No total, no page count. Page off
 * `rows.length === limit`.
 */
export const paymentListSerializer = (payload: unknown): Payment[] => {
  if (Array.isArray(payload)) return payload.map(mapPayment);
  const d = asRaw(payload);
  const rows = Array.isArray(d.data) ? d.data : [];
  return rows.map(mapPayment);
};

export const paymentSingleSerializer = (payload: unknown): Payment | null => {
  if (!payload || Array.isArray(payload)) return null;
  const d = asRaw(payload);
  const raw = d.payment ?? (d.id ? d : null);
  return raw ? mapPayment(raw) : null;
};

/**
 * `GET /payments/customer/:id/outstanding` → allocation rows.
 *
 * The response is a bare array of full Invoice entities filtered to
 * `balance > 0` and already ordered by due date ascending, so the rows arrive
 * in exactly the order auto-distribution wants. The open figure is **`balance`**
 * — not `balanceDue`, not `amountDue`.
 */
export const outstandingSerializer = (payload: unknown): AllocationRow[] => {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(asRaw(payload).data)
      ? (asRaw(payload).data as unknown[])
      : [];

  return rows.map((raw) => {
    const r = asRaw(raw);
    return {
      documentId: str(r.id),
      documentNumber: str(r.invoiceNumber),
      dueDate: str(r.dueDate),
      total: toNumber(r.total as never),
      amountPaid: toNumber(r.amountPaid as never),
      balance: toNumber(r.balance as never),
      checked: false,
      applied: '0',
    };
  });
};

// ═══════════════════════════════════════════════════════
// Form → API
// ═══════════════════════════════════════════════════════

export interface PaymentApplicationPayload {
  invoiceId: string;
  amount: string;
}

export interface ReceivePaymentPayload {
  customerId: string;
  paymentDate: string;
  paymentMethod: ApiPaymentMethod;
  amount: string;
  reference?: string;
  memo?: string;
  bankAccountId?: string;
  applications?: PaymentApplicationPayload[];
  /**
   * Hold what is not applied as an advance. Needed whenever nothing is
   * applied: an empty or missing `applications` otherwise means "apply
   * automatically, oldest invoice first".
   */
  holdAsAdvance?: boolean;
}

/**
 * Build the payload.
 *
 * The one decision encoded here: in `manual` mode an explicit `applications`
 * array is ALWAYS sent, and in `auto` mode the key is omitted entirely.
 *
 * That distinction is not cosmetic. `payments.service.ts` reads:
 *
 *     if (dto.applications && dto.applications.length > 0) { …use them… }
 *     else { applications = await this.autoApply(...) }
 *
 * So an empty or absent array means "sweep every open invoice, oldest first" —
 * not "hold this as an advance". Sending the user's ticked rows verbatim is the
 * only way their choice survives, and when nothing is ticked the payload says
 * `holdAsAdvance: true` so the server keeps the whole receipt as an advance.
 *
 * Money goes out as `.toFixed(2)` strings: every amount field is
 * `@IsNumberString`.
 */
export const paymentFormToPayload = (
  form: PaymentFormData,
): ReceivePaymentPayload => {
  const base: ReceivePaymentPayload = {
    customerId: form.customerId,
    paymentDate: form.paymentDate,
    paymentMethod: form.paymentMethod,
    amount: (parseFloat(form.amount) || 0).toFixed(2),
    reference: form.reference.trim() || undefined,
    // The wire field is `memo`, not `notes`.
    memo: form.memo.trim() || undefined,
    // Omitted means the server picks 1000 Cash for a cash payment, else 1010
    // Business Checking. That is a supported path, not a fallback.
    ...(form.bankAccountId ? { bankAccountId: form.bankAccountId } : {}),
  };

  if (form.mode === 'auto') return base;

  const applications = form.rows
    .filter((r) => r.checked && (parseFloat(r.applied) || 0) > 0)
    .map((r) => ({
      invoiceId: r.documentId,
      amount: (parseFloat(r.applied) || 0).toFixed(2),
    }));
  // Nothing ticked in manual mode means "keep it all as an advance" — say so,
  // or the server's empty-array rule would apply it to the oldest invoices.
  if (applications.length === 0) return { ...base, holdAsAdvance: true };
  return { ...base, applications };
};

/** `GET /payments/customer/:id/advances` → the receipts still holding money. */
export const advancesSerializer = (
  payload: unknown,
): { total: number; advances: CustomerAdvance[] } => {
  const d = asRaw(payload);
  const rows = Array.isArray(d.advances) ? d.advances : [];
  return {
    total: toNumber(d.total as never),
    advances: rows.map((raw) => {
      const r = asRaw(raw);
      return {
        paymentId: str(r.paymentId),
        paymentNumber: str(r.paymentNumber),
        paymentDate: str(r.paymentDate),
        amount: toNumber(r.amount as never),
        unapplied: toNumber(r.unapplied as never),
      };
    }),
  };
};

/** Allocations sum, for the summary panel. */
export const allocatedOf = (form: PaymentFormData): number =>
  totalAllocated(form.rows);
