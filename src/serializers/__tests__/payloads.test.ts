import { describe, expect, it } from 'vitest';

import { isPendingApproval } from '@/networks/network/apiHelpers';
import { EMPTY_CUSTOMER_FORM } from '@/models/customer';
import type { InvoiceFormData } from '@/models/invoice';
import {
  customerListSerializer,
  formDataToCustomerPayload,
} from '@/serializers/customerSerializer';
import {
  invoiceFormToPayload,
  invoiceFormToUpdatePayload,
  invoiceListSerializer,
} from '@/serializers/invoiceSerializer';

/**
 * Contract tests. Each one pins a shape the server insists on and that no type
 * checker can catch — a silently stripped field or a rejected enum looks like
 * a working save right up until the data is wrong.
 */

describe('formDataToCustomerPayload', () => {
  const form = {
    ...EMPTY_CUSTOMER_FORM,
    name: '  Acme Traders  ',
    email: 'ops@acme.test',
    billingStreet: '12 Mall Road',
    billingCity: 'Lahore',
    billingZipCode: '54000',
    creditLimit: '5000',
    paymentTerms: 'net_30' as const,
  };

  it('renames zipCode to postalCode', () => {
    const p = formDataToCustomerPayload(form);
    expect(p.billingAddress.postalCode).toBe('54000');
    expect(p.billingAddress).not.toHaveProperty('zipCode');
  });

  it('sends creditLimit as a string — the DTO is @IsNumberString', () => {
    const p = formDataToCustomerPayload(form);
    expect(p.creditLimit).toBe('5000');
    expect(typeof p.creditLimit).toBe('string');
  });

  it('defaults a blank credit limit to "0" rather than omitting it', () => {
    const p = formDataToCustomerPayload({ ...form, creditLimit: '' });
    expect(p.creditLimit).toBe('0');
  });

  it('translates payment terms into the API dialect', () => {
    // Sending the app's own `net_30` fails the server's @IsIn with a 400.
    expect(formDataToCustomerPayload(form).paymentTerms).toBe('net30');
    expect(
      formDataToCustomerPayload({ ...form, paymentTerms: 'net_15' }).paymentTerms,
    ).toBe('net15');
    expect(
      formDataToCustomerPayload({ ...form, paymentTerms: 'due_on_receipt' })
        .paymentTerms,
    ).toBe('due_on_receipt');
  });

  it('trims text and omits blank optionals instead of sending ""', () => {
    const p = formDataToCustomerPayload(form);
    expect(p.name).toBe('Acme Traders');
    // A blank string on PATCH would overwrite a real value with nothing.
    expect(p.company).toBeUndefined();
    expect(p.phone).toBeUndefined();
    expect(p.taxId).toBeUndefined();
  });

  it('copies billing into shipping when sameAsBilling is on', () => {
    const p = formDataToCustomerPayload({
      ...form,
      sameAsBilling: true,
      shippingStreet: 'stale value',
    });
    expect(p.shippingAddress).toEqual(p.billingAddress);
  });

  it('keeps shipping separate when sameAsBilling is off', () => {
    const p = formDataToCustomerPayload({
      ...form,
      sameAsBilling: false,
      shippingStreet: '9 Warehouse Row',
      shippingCity: 'Karachi',
      shippingZipCode: '75000',
    });
    expect(p.shippingAddress.street).toBe('9 Warehouse Row');
    expect(p.shippingAddress.postalCode).toBe('75000');
  });

  it('defaults country rather than sending it blank', () => {
    expect(
      formDataToCustomerPayload({ ...form, billingCountry: '' }).billingAddress
        .country,
    ).toBe('Pakistan');
  });
});

describe('invoiceFormToPayload', () => {
  const form: InvoiceFormData = {
    customerId: 'cus-1',
    customerName: 'Acme',
    issueDate: '2026-09-10',
    dueDate: '2026-10-10',
    discountType: 'percent',
    discountValue: '10',
    notes: '  ',
    lines: [
      {
        id: 'line_1',
        itemId: 'item-1',
        description: ' Widget ',
        quantity: '2',
        unitPrice: '150.5',
        taxRate: '17',
      },
      {
        id: 'line_2',
        itemId: '',
        description: 'Delivery',
        quantity: '1',
        unitPrice: '500',
        taxRate: '0',
      },
    ],
  };

  it('never sends invoiceNumber — the server assigns it', () => {
    expect(invoiceFormToPayload(form)).not.toHaveProperty('invoiceNumber');
  });

  it('renames issueDate to invoiceDate', () => {
    const p = invoiceFormToPayload(form);
    expect(p.invoiceDate).toBe('2026-09-10');
    expect(p).not.toHaveProperty('issueDate');
  });

  it('sends every money field as a string', () => {
    const p = invoiceFormToPayload(form);
    expect(typeof p.discountValue).toBe('string');
    for (const line of p.lines) {
      expect(typeof line.quantity).toBe('string');
      expect(typeof line.unitPrice).toBe('string');
      expect(typeof line.taxRate).toBe('string');
    }
  });

  it('omits itemId entirely when there is no item, never sends ""', () => {
    const p = invoiceFormToPayload(form);
    // "" is not a UUID and fails @IsUUID; the key must be absent.
    expect(p.lines[0].itemId).toBe('item-1');
    expect(p.lines[1]).not.toHaveProperty('itemId');
  });

  it('does not leak the client-only line id', () => {
    for (const line of invoiceFormToPayload(form).lines) {
      expect(line).not.toHaveProperty('id');
    }
  });

  it('includes status only when one is given', () => {
    expect(invoiceFormToPayload(form, 'sent').status).toBe('sent');
    expect(invoiceFormToPayload(form)).not.toHaveProperty('status');
  });

  it('drops a whitespace-only note', () => {
    expect(invoiceFormToPayload(form).notes).toBeUndefined();
  });

  it('coerces unparseable numbers to "0" rather than "NaN"', () => {
    const p = invoiceFormToPayload({
      ...form,
      discountValue: '',
      lines: [{ ...form.lines[0], quantity: 'abc', unitPrice: '' }],
    });
    expect(p.discountValue).toBe('0');
    expect(p.lines[0].quantity).toBe('0');
    expect(p.lines[0].unitPrice).toBe('0');
  });
});

describe('invoiceFormToUpdatePayload', () => {
  it('omits the fields UpdateInvoiceDto does not accept', () => {
    // customerId and status are absent from the DTO and would be silently
    // stripped by whitelist:true — sending them would look like it worked.
    const p = invoiceFormToUpdatePayload({
      customerId: 'cus-1',
      customerName: 'Acme',
      issueDate: '2026-09-10',
      dueDate: '2026-10-10',
      discountType: 'none',
      discountValue: '0',
      notes: '',
      lines: [],
    });
    expect(p).not.toHaveProperty('customerId');
    expect(p).not.toHaveProperty('status');
    expect(p.invoiceDate).toBe('2026-09-10');
  });
});

describe('the two list endpoints are shaped differently', () => {
  it('customers keeps its pagination, because the service nests it', () => {
    const result = customerListSerializer({
      data: [{ id: 'c1', name: 'Acme', balance: '1500.0000' }],
      summary: { total: 42, outstandingBalance: '9000.0000' },
      pagination: { page: 2, limit: 50, total: 42, totalPages: 1 },
    });
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0].balance).toBe(1500);
    expect(result.pagination.page).toBe(2);
    expect(result.summary.total).toBe(42);
    expect(result.summary.outstandingBalance).toBe(9000);
  });

  it('invoices arrives as a bare array — the envelope ate the metadata', () => {
    const rows = invoiceListSerializer([
      { id: 'i1', invoiceNumber: 'INV-2026-0001', total: '1170.0000', amountPaid: '0.0000' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(1170);
  });

  it('derives an invoice balance when the server omits it', () => {
    const [row] = invoiceListSerializer([
      { id: 'i1', total: '1000.0000', amountPaid: '250.0000' },
    ]);
    expect(row.balance).toBe(750);
  });

  it('maps the wire names the two clients disagree on', () => {
    const [row] = invoiceListSerializer([
      {
        id: 'i1',
        invoiceDate: '2026-09-10',
        customer: { name: 'Acme' },
        lines: [{ id: 'l1', lineTotal: '300.0000', inventoryItemId: 'item-9' }],
      },
    ]);
    expect(row.issueDate).toBe('2026-09-10'); // from invoiceDate
    expect(row.customerName).toBe('Acme'); // from customer.name
    expect(row.lines[0].amount).toBe(300); // from lineTotal
    expect(row.lines[0].itemId).toBe('item-9'); // from inventoryItemId
  });
});

describe('isPendingApproval', () => {
  it('recognises the body a staff write actually returns', () => {
    // Verbatim from PendingApprovalResponse.
    expect(
      isPendingApproval({
        pending: true,
        requestId: '8f3c1b2a-0000-4000-8000-000000000000',
        type: 'invoice',
        summary: 'Invoice: 3 line(s), due 2026-10-01',
        message: 'Sent to the owner for approval.',
      }),
    ).toBe(true);
  });

  it('does not mistake a real invoice for a pending request', () => {
    expect(isPendingApproval({ id: 'i1', invoiceNumber: 'INV-2026-0001' })).toBe(false);
    expect(isPendingApproval({ pending: false })).toBe(false);
    expect(isPendingApproval(null)).toBe(false);
    expect(isPendingApproval(undefined)).toBe(false);
    // Only the boolean counts — a truthy string is not the contract.
    expect(isPendingApproval({ pending: 'true' })).toBe(false);
  });
});
