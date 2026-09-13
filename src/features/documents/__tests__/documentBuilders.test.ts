import { describe, expect, it } from 'vitest';

import {
  billDocument,
  invoiceDocument,
  purchaseOrderDocument,
} from '@/features/documents/documentBuilders';
import {
  addressLines,
  companyForDocument,
  docDate,
  partyForDocument,
  stampFor,
} from '@/features/documents/documentModel';
import type { Bill } from '@/models/bill';
import type { Customer } from '@/models/customer';
import type { Invoice } from '@/models/invoice';
import type { PurchaseOrder } from '@/models/purchaseOrder';
import { formatShortDate } from '@/models/reportPeriod';
import type { CompanyProfile } from '@/models/settings';

const profile: CompanyProfile = {
  id: 'c1',
  name: 'Warehouse Co',
  industry: '',
  taxId: '1234567-8',
  phone: '+92 42 111 222 333',
  email: 'accounts@warehouse.pk',
  website: 'warehouse.pk',
  address: { street: '12 Mall Road', city: 'Lahore', state: 'Punjab', postalCode: '54000', country: 'Pakistan' },
  fiscalYearStartMonth: 7,
  homeCurrency: 'PKR',
  logo: '',
};

const company = companyForDocument(profile, 'Session name');

const customer = {
  id: 'cu1',
  name: 'Faisal Traders',
  company: 'Faisal Traders (Pvt) Ltd',
  email: 'faisal@example.com',
  phone: '0300-1234567',
  billingAddress: { street: '4 Circular Road', city: 'Faisalabad', state: '', zipCode: '38000', country: 'Pakistan' },
  contactPerson: 'Faisal Khan',
  taxId: '',
  paymentTerms: 'net_30',
} as unknown as Customer;

const invoice = {
  id: 'i1',
  invoiceNumber: 'INV-2026-0047',
  customerId: 'cu1',
  customerName: 'Faisal Traders',
  issueDate: '2026-09-10',
  dueDate: '2026-10-10',
  status: 'sent',
  lines: [
    { id: 'l1', itemId: '', itemName: '20 L Cooking Oil', description: '20 L Cooking Oil', quantity: 1, unitPrice: 12000, taxRate: 0, amount: 12000 },
  ],
  subtotal: 12000,
  taxAmount: 0,
  discountType: 'percent',
  discountValue: 5,
  discountAmount: 600,
  total: 11400,
  amountPaid: 0,
  balance: 11400,
  notes: 'Deliver to the back gate.',
} as unknown as Invoice;

describe('document model helpers', () => {
  it('formats dates and addresses for print', () => {
    expect(docDate('2026-09-10')).toBe(formatShortDate('2026-09-10'));
    expect(docDate('2026-12-11T00:44:17.227Z')).toBe(formatShortDate('2026-12-11'));
    expect(docDate(null)).toBe('');
    expect(addressLines(profile.address)).toEqual(['12 Mall Road', 'Lahore, Punjab, 54000', 'Pakistan']);
  });

  it('builds the letterhead, falling back to the session name', () => {
    expect(company.name).toBe('Warehouse Co');
    expect(company.contactLines).toEqual(['+92 42 111 222 333 · accounts@warehouse.pk', 'warehouse.pk · NTN 1234567-8']);
    expect(companyForDocument(null, 'Session name')).toMatchObject({ name: 'Session name', addressLines: [] });
  });

  it('names the party even before its record loads', () => {
    expect(partyForDocument('Bill to', 'Faisal Traders', null)).toEqual({
      label: 'Bill to',
      name: 'Faisal Traders',
      lines: [],
      email: undefined,
      phone: undefined,
    });
  });

  it('stamps drafts, voids and paid documents only', () => {
    expect(stampFor('draft')?.label).toBe('Draft');
    expect(stampFor('void')?.tone).toBe('danger');
    expect(stampFor('paid')?.tone).toBe('success');
    expect(stampFor('sent')).toBeNull();
  });
});

describe('invoiceDocument', () => {
  const doc = invoiceDocument(invoice, company, customer);

  it('addresses the customer with their details and terms', () => {
    expect(doc.party).toMatchObject({ label: 'Bill to', name: 'Faisal Traders', email: 'faisal@example.com' });
    expect(doc.party?.lines).toContain('Faisal Traders (Pvt) Ltd');
    expect(doc.party?.lines).toContain('Attn: Faisal Khan');
    expect(doc.party?.lines).toContain('Faisalabad, 38000');
    expect(doc.meta.map((m) => m.label)).toEqual(['Invoice #', 'Issue date', 'Due date', 'Terms']);
  });

  it('totals with discount, payments and a highlighted balance due', () => {
    expect(doc.totals.map((t) => t.label)).toEqual([
      'Subtotal',
      'Discount (5%)',
      'Tax',
      'Total',
      'Amount paid',
      'Balance due',
    ]);
    expect(doc.totals.at(-1)).toMatchObject({ value: 11400, grand: true, tone: 'danger' });
  });

  it('shares the amount due with the customer', () => {
    expect(doc.share).toMatchObject({
      kind: 'Invoice',
      number: 'INV-2026-0047',
      partyName: 'Faisal Traders',
      partyPhone: '0300-1234567',
      amount: 11400,
      amountLabel: 'Amount due',
      companyName: 'Warehouse Co',
    });
  });

  it('shares the total once the invoice is paid, and stamps it', () => {
    const paid = invoiceDocument({ ...invoice, status: 'paid', amountPaid: 11400, balance: 0 } as Invoice, company, customer);
    expect(paid.share).toMatchObject({ amount: 11400, amountLabel: 'Total', dueDate: undefined });
    expect(paid.stamp?.label).toBe('Paid');
  });
});

describe('purchase side', () => {
  it('drops quantity columns on a bill and keeps the account as a sub-line', () => {
    const bill = {
      billNumber: 'B-9',
      vendorName: 'Habib Oil Mills',
      issueDate: '2026-09-01',
      dueDate: '2026-09-30',
      status: 'open',
      lines: [{ id: 'x', accountId: 'a', accountName: 'Purchases', description: 'Oil drums', taxRate: 17, amount: 5000 }],
      subtotal: 5000,
      taxAmount: 850,
      total: 5850,
      amountPaid: 850,
      balance: 5000,
      notes: '',
    } as unknown as Bill;
    const doc = billDocument(bill, company, null);
    expect(doc.showQuantity).toBe(false);
    expect(doc.lines[0]).toMatchObject({ description: 'Oil drums', secondary: 'Purchases', quantity: null });
    expect(doc.share.amountLabel).toBe('Balance due');
  });

  it('gives a purchase order signature lines and unit cost', () => {
    const po = {
      poNumber: 'PO-2026-0003',
      vendorName: 'Pak Dairy',
      orderDate: '2026-09-02',
      expectedDate: '2026-09-09',
      status: 'draft',
      lines: [],
      subtotal: 0,
      taxAmount: 0,
      total: 0,
      notes: '',
    } as unknown as PurchaseOrder;
    const doc = purchaseOrderDocument(po, company, null);
    expect(doc.priceHeader).toBe('Unit cost');
    expect(doc.signatures).toEqual(['Prepared by', 'Authorised signature']);
    expect(doc.stamp?.label).toBe('Draft');
  });
});
