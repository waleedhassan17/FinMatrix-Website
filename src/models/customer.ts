// ═══════════════════════════════════════════════════════
// FinMatrix Web — Customer model
// ═══════════════════════════════════════════════════════
// Ported from the app's src/models/customerModel.ts and the Customer/
// CustomerAddress types in its src/types/index.ts.

export type PaymentTerms =
  | 'due_on_receipt'
  | 'net_15'
  | 'net_30'
  | 'net_45'
  | 'net_60'
  | '2_10_net30'
  | 'custom';

export interface CustomerAddress {
  street: string;
  city: string;
  state: string;
  /** The app's name for it. Goes out as `postalCode` — see the serializer. */
  zipCode: string;
  country: string;
}

export interface Customer {
  id: string;
  companyId: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  billingAddress: CustomerAddress;
  shippingAddress: CustomerAddress;
  /** Server-derived. Never sent in any payload. */
  balance: number;
  creditLimit: number;
  totalPurchases: number;
  paymentTerms: PaymentTerms;
  contactPerson: string;
  taxId: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The extras GET /customers/:id returns alongside the record. */
export interface CustomerCredit {
  limit: number;
  used: number;
  available: number;
}

export const PAYMENT_TERMS_OPTIONS: { label: string; value: PaymentTerms }[] = [
  { label: 'Due on Receipt', value: 'due_on_receipt' },
  { label: 'Net 15', value: 'net_15' },
  { label: 'Net 30', value: 'net_30' },
  { label: 'Net 45', value: 'net_45' },
  { label: 'Net 60', value: 'net_60' },
  { label: '2/10 Net 30', value: '2_10_net30' },
  { label: 'Custom', value: 'custom' },
];

export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  due_on_receipt: 'Due on Receipt',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_45: 'Net 45',
  net_60: 'Net 60',
  '2_10_net30': '2/10 Net 30',
  custom: 'Custom',
};

// ─── API ↔ app payment-terms dialects ───────────────────────────────────
// The API uses `net30`-style codes; both clients use `net_30`-style ones.
// Sending the app code raw fails the server's @IsIn enum validation with a 400,
// so every write goes through PAYMENT_TERMS_TO_API and every read through
// paymentTermsFromApi.

export const PAYMENT_TERMS_TO_API: Record<PaymentTerms, string> = {
  due_on_receipt: 'due_on_receipt',
  net_15: 'net15',
  net_30: 'net30',
  net_45: 'net45',
  net_60: 'net60',
  '2_10_net30': '2_10_net30',
  custom: 'custom',
};

export const paymentTermsFromApi = (raw: unknown): PaymentTerms => {
  const map: Record<string, PaymentTerms> = {
    due_on_receipt: 'due_on_receipt',
    net15: 'net_15',
    net30: 'net_30',
    net45: 'net_45',
    net60: 'net_60',
    '2_10_net30': '2_10_net30',
    custom: 'custom',
    // The app dialect is accepted on the way in too, so a value that has
    // round-tripped through another client still resolves.
    net_15: 'net_15',
    net_30: 'net_30',
    net_45: 'net_45',
    net_60: 'net_60',
  };
  return map[String(raw ?? '')] ?? 'net_30';
};

/** Days until due, per terms. Used to derive an invoice's due date. */
export const PAYMENT_TERMS_DAYS: Record<PaymentTerms, number> = {
  due_on_receipt: 0,
  net_15: 15,
  net_30: 30,
  net_45: 45,
  net_60: 60,
  '2_10_net30': 30,
  custom: 30,
};

// ─── Form shape ─────────────────────────────────────────────────────────
// Flat and all-strings, matching the app's CustomerFormData: an address is
// five sibling fields, not a nested object, because that is what a form
// library and a validation schema both want.

export interface CustomerFormData {
  name: string;
  company: string;
  email: string;
  phone: string;
  billingStreet: string;
  billingCity: string;
  billingState: string;
  billingZipCode: string;
  billingCountry: string;
  sameAsBilling: boolean;
  shippingStreet: string;
  shippingCity: string;
  shippingState: string;
  shippingZipCode: string;
  shippingCountry: string;
  creditLimit: string;
  paymentTerms: PaymentTerms | '';
  contactPerson: string;
  taxId: string;
  notes: string;
}

export const EMPTY_CUSTOMER_FORM: CustomerFormData = {
  name: '',
  company: '',
  email: '',
  phone: '',
  billingStreet: '',
  billingCity: '',
  billingState: '',
  billingZipCode: '',
  billingCountry: 'Pakistan',
  sameAsBilling: true,
  shippingStreet: '',
  shippingCity: '',
  shippingState: '',
  shippingZipCode: '',
  shippingCountry: 'Pakistan',
  creditLimit: '',
  paymentTerms: 'net_30',
  contactPerson: '',
  taxId: '',
  notes: '',
};

/**
 * Column limits from the Postgres schema.
 *
 * These are NOT validated server-side — no DTO carries @MaxLength — so an
 * overlong value reaches Postgres and comes back as a 500 INTERNAL_ERROR
 * rather than a message a form can show. Enforcing them client-side is the
 * only thing standing between a long company name and an unexplained crash.
 */
export const CUSTOMER_MAX_LENGTHS = {
  name: 200,
  company: 200,
  contactPerson: 200,
  email: 255,
  phone: 32,
  taxId: 64,
} as const;
