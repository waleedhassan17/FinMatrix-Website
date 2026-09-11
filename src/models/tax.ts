// ═══════════════════════════════════════════════════════
// FinMatrix Web — Tax model
// ═══════════════════════════════════════════════════════
// Sales-tax liability, remittances and rate configuration.
//
// Written against the backend DTOs, NOT the mobile app, whose tax module is
// broken at the contract level: its payment POST sends `date` and `notes` and
// omits `period`, so every Record Payment is a 400; and its rate serializer
// only accepts real numbers, so the API's decimal-string `rate` ("17.0000")
// reads as 0 and every rate shows as "0% · GST".

import { toDecimal } from '@/utils/money';

/** The backend's `TaxType` union — the only values the column is meant to hold. */
export type TaxRateType = 'sales' | 'purchase';

export const TAX_TYPE_OPTIONS: { value: TaxRateType; label: string }[] = [
  { value: 'sales', label: 'Sales tax — charged on sales' },
  { value: 'purchase', label: 'Purchase tax — paid on purchases' },
];

export const taxTypeLabel = (type: string): string =>
  type === 'sales' ? 'Sales' : type === 'purchase' ? 'Purchase' : type || '—';

export interface TaxRate {
  id: string;
  name: string;
  /** Percent, e.g. 17. Arrives as a decimal string. */
  rate: number;
  type: string;
  /** Free text — the collecting authority, or a note. */
  authority: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
}

export interface TaxLiabilityRow {
  taxRateId: string;
  taxName: string;
  taxType: string;
  rate: number;
  collected: number;
  paid: number;
  net: number;
}

/**
 * `GET /taxes/liability`, ledger-derived:
 *
 *   output tax       = credits to Sales Tax Payable (2300) in the period
 *   remitted         = debits to 2300 in the period
 *   input recoverable = net debit on Sales Tax Recoverable (1300) in the period
 *   net owed         = output − remitted − input recoverable
 *
 * Every figure is a movement WITHIN the range, so a payment counts in the
 * period it was made, not the period it settles.
 */
export interface TaxLiability {
  fromDate: string;
  toDate: string;
  rows: TaxLiabilityRow[];
  totalCollected: number;
  totalPaid: number;
  totalNet: number;
  outputTax: number;
  inputTaxRecoverable: number;
  taxRemitted: number;
}

export interface TaxPayment {
  id: string;
  taxRateId: string;
  period: string;
  amount: number;
  paymentDate: string;
  reference: string;
  journalEntryId: string | null;
  createdAt: string;
}

export type LiabilityStatus = 'owed' | 'settled' | 'credit';

/**
 * What the net figure means.
 *
 * Three states, not two: the app shows "All tax liabilities are fully paid"
 * whenever net is not positive, which tells a business with a CREDIT due —
 * more input tax recoverable than output charged, or an overpayment — that it
 * owes nothing and is owed nothing.
 */
export const liabilityStatus = (totalNet: number): LiabilityStatus => {
  const net = toDecimal(totalNet).toDecimalPlaces(2);
  if (net.greaterThan(0)) return 'owed';
  if (net.lessThan(0)) return 'credit';
  return 'settled';
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d+(\.\d{1,2})?$/;

/** A tax period label for a date: `2026-Q3`. Matches how remittances are filed. */
export const quarterLabel = (iso: string): string => {
  const [y, m] = iso.split('-').map(Number);
  if (!y || !m) return '';
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
};

// ─── Payment ────────────────────────────────────────────────────────────────

export interface TaxPaymentForm {
  taxRateId: string;
  period: string;
  amount: string;
  paymentDate: string;
  reference: string;
}

/** Field errors, keyed by field. Empty means valid. Mirrors `CreateTaxPaymentDto`. */
export const validateTaxPayment = (form: TaxPaymentForm): Record<string, string> => {
  const errors: Record<string, string> = {};
  if (!form.taxRateId) errors.taxRateId = 'Choose the tax this payment is for';

  const period = form.period.trim();
  if (!period) errors.period = 'Say which period this settles, e.g. 2026-Q3';
  else if (period.length > 32) errors.period = 'Keep the period to 32 characters';

  const amount = form.amount.replace(/,/g, '').trim();
  if (!MONEY.test(amount)) errors.amount = 'Enter an amount, up to two decimals';
  else if (!toDecimal(amount).greaterThan(0)) errors.amount = 'The amount must be above zero';

  if (!ISO_DATE.test(form.paymentDate)) errors.paymentDate = 'Choose the payment date';

  if (form.reference.trim().length > 64) errors.reference = 'Keep the reference to 64 characters';
  return errors;
};

export interface TaxPaymentPayload {
  taxRateId: string;
  period: string;
  amount: string;
  paymentDate: string;
  reference?: string;
}

/**
 * Form → `POST /taxes/payments`, with exactly the DTO's field names.
 *
 * `period` and `paymentDate` are both required by the DTO — the two the app
 * leaves out. Anything else (the app's `date`, `notes`, `taxRateName`) would be
 * stripped by the whitelist anyway, so none of it is sent.
 */
export const taxPaymentPayload = (form: TaxPaymentForm): TaxPaymentPayload => {
  const payload: TaxPaymentPayload = {
    taxRateId: form.taxRateId,
    period: form.period.trim(),
    amount: toDecimal(form.amount.replace(/,/g, '')).toFixed(2),
    paymentDate: form.paymentDate,
  };
  const reference = form.reference.trim();
  if (reference) payload.reference = reference;
  return payload;
};

// ─── Rates ──────────────────────────────────────────────────────────────────

export interface TaxRateForm {
  name: string;
  rate: string;
  type: TaxRateType;
  authority: string;
  isActive: boolean;
  isDefault: boolean;
}

export const emptyTaxRateForm = (): TaxRateForm => ({
  name: '',
  rate: '',
  type: 'sales',
  authority: '',
  isActive: true,
  isDefault: false,
});

export const taxRateToForm = (rate: TaxRate): TaxRateForm => ({
  name: rate.name,
  rate: String(rate.rate),
  type: rate.type === 'purchase' ? 'purchase' : 'sales',
  authority: rate.authority,
  isActive: rate.isActive,
  isDefault: rate.isDefault,
});

/**
 * Mirrors the columns rather than only the DTO: the DTO allows a 200-character
 * name, but the column is `varchar(120)`, so 121–200 would pass validation and
 * fail in the database. The rate column is `decimal(8,4)`.
 */
export const validateTaxRate = (form: TaxRateForm): Record<string, string> => {
  const errors: Record<string, string> = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Name the rate, e.g. GST 17%';
  else if (name.length > 120) errors.name = 'Keep the name to 120 characters';

  const rate = form.rate.trim();
  if (!/^\d+(\.\d{1,4})?$/.test(rate)) errors.rate = 'Enter a percentage, up to four decimals';
  else if (toDecimal(rate).greaterThan(100)) errors.rate = 'A rate cannot exceed 100%';

  if (form.authority.trim().length > 120) errors.authority = 'Keep this to 120 characters';
  return errors;
};

export interface TaxRatePayload {
  name: string;
  rate: string;
  type: TaxRateType;
  authority: string;
  isActive: boolean;
  isDefault: boolean;
}

export const taxRatePayload = (form: TaxRateForm): TaxRatePayload => ({
  name: form.name.trim(),
  rate: toDecimal(form.rate.trim()).toFixed(),
  type: form.type,
  // Sent even when blank, so clearing it on an edit actually clears it.
  authority: form.authority.trim(),
  isActive: form.isActive,
  isDefault: form.isDefault,
});
