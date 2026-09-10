import { z } from 'zod';

import { CUSTOMER_MAX_LENGTHS } from '@/models/customer';

const M = CUSTOMER_MAX_LENGTHS;

/**
 * Validation for the customer form.
 *
 * Two things here are stricter than the server, on purpose:
 *
 *  1. **Email is required.** `CreateCustomerDto` marks it optional, but the
 *     app's form requires it. If web created an email-less customer, opening
 *     that record in the phone's edit form would then refuse to save — the
 *     divergence would be worse for the user than the restriction.
 *
 *  2. **Max lengths.** No DTO carries `@MaxLength`; the Postgres columns do.
 *     An overlong value is therefore not a validation error but a 500
 *     INTERNAL_ERROR with nothing a form can show. These bounds are the only
 *     thing standing between a long company name and an unexplained crash.
 */
export const customerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Customer name is required')
      .max(M.name, `Name must be ${M.name} characters or fewer`),
    company: z
      .string()
      .trim()
      .max(M.company, `Company must be ${M.company} characters or fewer`),
    email: z
      .string()
      .trim()
      .min(1, 'Email is required')
      .email('Enter a valid email address')
      .max(M.email, `Email must be ${M.email} characters or fewer`),
    phone: z
      .string()
      .trim()
      .max(M.phone, `Phone must be ${M.phone} characters or fewer`)
      .refine((v) => v === '' || /^[+\d\s\-()]+$/.test(v), 'Invalid phone format'),

    billingStreet: z.string().trim().min(1, 'Billing street is required'),
    billingCity: z.string().trim().min(1, 'Billing city is required'),
    billingState: z.string().trim(),
    billingZipCode: z.string().trim(),
    billingCountry: z.string().trim(),

    sameAsBilling: z.boolean(),

    shippingStreet: z.string().trim(),
    shippingCity: z.string().trim(),
    shippingState: z.string().trim(),
    shippingZipCode: z.string().trim(),
    shippingCountry: z.string().trim(),

    creditLimit: z
      .string()
      .trim()
      .refine(
        (v) => v === '' || (Number.isFinite(parseFloat(v)) && parseFloat(v) >= 0),
        'Credit limit must be a positive number',
      ),
    paymentTerms: z
      .string()
      .min(1, 'Payment terms are required'),

    contactPerson: z
      .string()
      .trim()
      .max(
        M.contactPerson,
        `Contact person must be ${M.contactPerson} characters or fewer`,
      ),
    taxId: z
      .string()
      .trim()
      .max(M.taxId, `Tax ID must be ${M.taxId} characters or fewer`),
    notes: z.string().trim(),
  })
  // Shipping is only required when it is not a copy of billing — checked here
  // rather than per-field because it depends on another field's value.
  .refine((d) => d.sameAsBilling || d.shippingStreet.length > 0, {
    message: 'Shipping street is required',
    path: ['shippingStreet'],
  })
  .refine((d) => d.sameAsBilling || d.shippingCity.length > 0, {
    message: 'Shipping city is required',
    path: ['shippingCity'],
  });

export type CustomerSchema = z.infer<typeof customerSchema>;
