// ═══════════════════════════════════════════════════════
// FinMatrix Web — Customer / vendor History
// ═══════════════════════════════════════════════════════
// Peachtree's History tab: when the relationship began, the last invoice (or
// bill) and the last payment, how long payment takes, the fiscal year month by
// month, and — for the owner — every change to the record and who made it.
// One shape for both sides; the words differ (sales/receipts vs
// purchases/payments), the arithmetic does not.

import { paymentTermsFromApi, PAYMENT_TERMS_LABELS } from '@/models/customer';
import { formatMoney } from '@/utils/money';

export type PartyType = 'customer' | 'vendor';

export interface HistoryDocument {
  id: string;
  /** INV-2026-0012, RCT-2026-0007, a bill number — or empty (a bill payment's reference). */
  number: string;
  date: string;
  amount: number;
}

export interface HistoryMonth {
  /** `YYYY-MM`. */
  month: string;
  /** Sales (customer) or purchases (vendor), less credits and voids. */
  charged: number;
  /** Receipts (customer) or payments (vendor). */
  settled: number;
  /** At the month's end: what the customer owes, or what is owed to the vendor. */
  balance: number;
}

export type HistoryAction = 'created' | 'updated' | 'deactivated' | 'reactivated' | 'deleted';

export interface HistoryChange {
  id: string;
  at: string;
  action: HistoryAction;
  /** Who made it; null for a record older than the log, or a system change. */
  user: string | null;
  fields: { field: string; from: string | boolean | null; to: string | boolean | null }[];
}

export interface PartyHistory {
  partyType: PartyType;
  party: { id: string; code: string; name: string };
  since: string | null;
  /** The last invoice (customer) or bill (vendor). */
  lastDocument: HistoryDocument | null;
  lastPayment: HistoryDocument | null;
  averageDaysToPay: { days: number; count: number } | null;
  fiscalYear: { year: number; startDate: string; endDate: string };
  openingBalance: number;
  months: HistoryMonth[];
  totals: { charged: number; settled: number };
  closingBalance: number;
  /** Null when not shown — not the owner, or the plan has no audit log. */
  changes: HistoryChange[] | null;
}

/** The words each side uses. */
export const HISTORY_COPY: Record<
  PartyType,
  { since: string; lastDocument: string; charged: string; settled: string; balance: string; pays: string }
> = {
  customer: {
    since: 'Customer since',
    lastDocument: 'Last invoice',
    charged: 'Sales',
    settled: 'Receipts',
    balance: 'Balance',
    pays: 'Pays in',
  },
  vendor: {
    since: 'Vendor since',
    lastDocument: 'Last bill',
    charged: 'Purchases',
    settled: 'Payments',
    balance: 'You owe',
    pays: 'You pay in',
  },
};

const FIELD_LABELS: Record<string, string> = {
  code: 'ID',
  name: 'Name',
  companyName: 'Name',
  company: 'Company',
  contactPerson: 'Contact person',
  email: 'Email',
  phone: 'Phone',
  taxId: 'Tax ID (NTN)',
  creditLimit: 'Credit limit',
  paymentTerms: 'Payment terms',
  billingAddress: 'Billing address',
  shippingAddress: 'Shipping address',
  address: 'Address',
  defaultExpenseAccountId: 'Default expense account',
  notes: 'Notes',
  isActive: 'Active',
};

/** A field as the log names it: "Credit limit", "Customer ID". */
export const historyFieldLabel = (field: string, type: PartyType): string =>
  field === 'code' ? (type === 'customer' ? 'Customer ID' : 'Vendor ID') : (FIELD_LABELS[field] ?? field);

/** A logged value as a person reads it. */
export const historyValue = (field: string, value: string | boolean | null): string => {
  if (value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (field === 'creditLimit') {
    const n = Number(value);
    return Number.isFinite(n) ? (n === 0 ? 'No limit' : formatMoney(n)) : value;
  }
  if (field === 'paymentTerms') return PAYMENT_TERMS_LABELS[paymentTermsFromApi(value)] ?? value;
  return value;
};

/** "Waleed changed the credit limit" — the line's verb. */
export const HISTORY_ACTION_LABELS: Record<HistoryAction, string> = {
  created: 'Created',
  updated: 'Changed',
  deactivated: 'Deactivated',
  reactivated: 'Reactivated',
  deleted: 'Deleted',
};

/** "Jul 2026" for `2026-07`. */
export const monthLabel = (month: string): string => {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};
