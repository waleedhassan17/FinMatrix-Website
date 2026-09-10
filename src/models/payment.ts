// ═══════════════════════════════════════════════════════
// FinMatrix Web — Payment model
// ═══════════════════════════════════════════════════════

import type { AllocationRow } from '@/models/allocation';

/**
 * The API's method vocabulary. Note the UI's differs — the app shows "Cheque"
 * and "Online", which map to `check` and `other` on the wire.
 */
export type ApiPaymentMethod =
  | 'cash'
  | 'check'
  | 'bank_transfer'
  | 'credit_card'
  | 'other';

/** What the pickers offer. Ported from the app's METHOD_OPTIONS. */
export const PAYMENT_METHOD_OPTIONS: { label: string; value: ApiPaymentMethod }[] = [
  { label: 'Bank transfer', value: 'bank_transfer' },
  { label: 'Cash', value: 'cash' },
  { label: 'Cheque', value: 'check' },
  { label: 'Credit card', value: 'credit_card' },
  { label: 'Other', value: 'other' },
];

/**
 * Read labels. This map used to live inside customerSerializer.ts, where the
 * customer's Payments tab was its only consumer; it belongs here now that the
 * payments module needs the same words.
 */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  check: 'Cheque',
  bank_transfer: 'Bank transfer',
  credit_card: 'Credit card',
  other: 'Other',
};

export const paymentMethodLabel = (method: string): string =>
  PAYMENT_METHOD_LABELS[method] ?? 'Other';

/**
 * How a payment was split across invoices.
 *
 * Note the read/write asymmetry: the server accepts `{invoiceId, amount}` and
 * returns `{invoiceId, amountApplied}`. One type cannot serve both, so the
 * write shape lives in the serializer as `PaymentApplicationPayload`.
 */
export interface PaymentApplication {
  invoiceId: string;
  invoiceNumber: string;
  amountApplied: number;
}

export interface Payment {
  id: string;
  companyId: string;
  customerId: string;
  customerName: string;
  paymentDate: string;
  paymentMethod: ApiPaymentMethod;
  /**
   * Free text. There is NO payment number: the entity has no sequence column,
   * unlike credit memos which get CM-<year>-NNNN. This and the id are the only
   * handles a user has on a payment.
   */
  reference: string;
  amount: number;
  bankAccountId: string | null;
  memo: string;
  applications: PaymentApplication[];
  /** Σ applications. Derived — the server sends no such field. */
  allocated: number;
  /** amount − allocated, floored at zero. Retained as customer credit. */
  unapplied: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Allocation ─────────────────────────────────────────────────────────
// The allocation arithmetic is shared with Pay Bills and lives in
// models/allocation.ts. Re-exported so existing imports keep working.

export {
  autoDistribute,
  clampToBalance,
  fillToBalance,
  isOverAllocated,
  overAppliedRows,
  payInFull,
  totalAllocated,
  totalOutstanding,
  unappliedOf,
  type AllocationRow,
} from '@/models/allocation';

// ─── Form ───────────────────────────────────────────────────────────────

/**
 * How the payment is split.
 *
 * `manual` sends an explicit `applications` array — what the user ticked is
 * exactly what happens, and any remainder is genuinely held as credit.
 *
 * `auto` OMITS the array, which is the only way to reach the server's FIFO
 * sweep. This has to be a deliberate, named choice: the app omits the array
 * whenever nothing is ticked, so its "save as customer credit" toggle quietly
 * applies the money to invoices instead of holding it.
 */
export type AllocationMode = 'manual' | 'auto';

export interface PaymentFormData {
  customerId: string;
  customerName: string;
  paymentDate: string;
  paymentMethod: ApiPaymentMethod;
  amount: string;
  reference: string;
  memo: string;
  /** Empty means "let the server choose" — 1000 Cash or 1010 Business Checking. */
  bankAccountId: string;
  mode: AllocationMode;
  rows: AllocationRow[];
}
