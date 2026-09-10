// ═══════════════════════════════════════════════════════
// FinMatrix Web — Vendor model
// ═══════════════════════════════════════════════════════
// A vendor is NOT a customer with a different label. Five differences matter:
//
//   1. `companyName` is the single name field — there is no name + company pair
//   2. one flat `address`, not billing + shipping
//   3. no credit limit
//   4. a `defaultExpenseAccountId` — which GL account their bills default to
//   5. `balance` is what WE OWE THEM. On a customer a positive balance is an
//      asset; here it is a liability, so it reads as danger, not as good news.

import type { PaymentTerms } from '@/models/customer';

export interface VendorAddress {
  street: string;
  city: string;
  state: string;
  /** The app's name for it. Goes out as `postalCode`, as on the customer side. */
  zipCode: string;
  country: string;
}

export interface Vendor {
  id: string;
  companyId: string;
  /** The wire field is `companyName`. */
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: VendorAddress;
  paymentTerms: PaymentTerms;
  taxId: string;
  /** Preselects the account on a new bill's lines. */
  defaultExpenseAccountId: string;
  /** Accounts payable — what this company owes the vendor. */
  balance: number;
  isActive: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface VendorFormData {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  paymentTerms: PaymentTerms | '';
  taxId: string;
  defaultExpenseAccountId: string;
  notes: string;
}

export const EMPTY_VENDOR_FORM: VendorFormData = {
  name: '',
  contactPerson: '',
  email: '',
  phone: '',
  street: '',
  city: '',
  state: '',
  zipCode: '',
  country: 'Pakistan',
  paymentTerms: 'net_30',
  taxId: '',
  defaultExpenseAccountId: '',
  notes: '',
};

/**
 * Postgres column limits. As on the customer side these are **not** validated
 * server-side — no DTO carries `@MaxLength` — so an overlong value reaches the
 * database and returns a 500 rather than a message a form can show.
 */
export const VENDOR_MAX_LENGTHS = {
  name: 200,
  contactPerson: 200,
  email: 255,
  phone: 32,
  taxId: 64,
} as const;

/**
 * The colour a vendor balance reads in.
 *
 * Deliberately the inverse of the customer rule: money owed to a vendor is a
 * liability, so anything above zero is `danger` and a cleared account is
 * `success`. Copying the customer logic here would colour a large payable as
 * though it were a healthy receivable.
 */
export const vendorBalanceTone = (balance: number): 'danger' | 'success' =>
  balance > 0 ? 'danger' : 'success';
