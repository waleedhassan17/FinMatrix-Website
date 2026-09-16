import { describe, expect, it } from 'vitest';

import { computeBillTotals, validateBillLines, type BillFormLine } from '@/models/bill';
import { emptyDeliveryForm, validateDelivery } from '@/models/delivery';
import { computeTotals, freshLine, validateLines, type FormLineItem } from '@/models/document';
import { lineTaxError, taxPercentError } from '@/models/taxRate';
import { validateVendorCreditLines, type VendorCreditFormLine } from '@/models/vendorCredit';

// Tax is typed on every document, so these checks are the client's only guard
// against a rate the server's @IsTaxRate would refuse.

describe('taxPercentError', () => {
  it.each(['', '0', '5', '12.5', '17', '17.25', '100', '0.0001'])('accepts "%s"', (rate) => {
    expect(taxPercentError(rate)).toBeUndefined();
  });

  it.each(['-1', '100.01', '150', '1.23456', '17%', 'abc', '.5', '1000'])('refuses "%s"', (rate) => {
    expect(taxPercentError(rate)).toBeTruthy();
  });
});

describe('lineTaxError', () => {
  it('names the first bad line', () => {
    expect(lineTaxError([{ taxRate: '17' }, { taxRate: '150' }, { taxRate: '-1' }])).toBe(
      'Line 2: Tax must be between 0% and 100%.',
    );
  });

  it('passes when every line is valid', () => {
    expect(lineTaxError([{ taxRate: '12.5' }, { taxRate: '' }])).toBeNull();
  });
});

describe('validateLines (invoice, estimate, sales order, credit memo, PO)', () => {
  const line = (taxRate: string): FormLineItem => ({
    ...freshLine(),
    description: 'Widget',
    quantity: '2',
    unitPrice: '100',
    taxRate,
  });
  const check = (lines: FormLineItem[]) => validateLines(lines, computeTotals(lines, 'none', '0'));

  it('accepts a rate that was never on the old 0/5/10/17 list', () => {
    expect(check([line('12.5')])).toBeNull();
  });

  it('refuses a rate above 100 or with more than four decimals', () => {
    expect(check([line('17'), line('150')])).toMatch(/^Line 2: /);
    expect(check([line('1.23456')])).toMatch(/^Line 1: /);
  });
});

describe('validateBillLines', () => {
  const line = (taxRate: string): BillFormLine => ({
    id: `b_${taxRate}`,
    accountId: 'acct-1',
    description: 'Consumables',
    amount: '100',
    taxRate,
  });

  it('accepts a typed rate and refuses an impossible one', () => {
    expect(validateBillLines([line('12.5')], computeBillTotals([line('12.5')]))).toBeNull();
    expect(validateBillLines([line('150')], computeBillTotals([line('150')]))).toMatch(/Line 1: /);
  });
});

describe('validateVendorCreditLines', () => {
  const line = (taxRate: string): VendorCreditFormLine => ({
    id: `vc_${taxRate}`,
    itemId: '',
    accountId: '',
    description: 'Overcharge on freight',
    quantity: '',
    amount: '100.00',
    taxRate,
  });

  it('accepts a typed rate and refuses an impossible one', () => {
    expect(validateVendorCreditLines([line('12.5')])).toBe('');
    expect(validateVendorCreditLines([line('150')])).toMatch(/Line 1: /);
  });
});

describe('validateDelivery tax', () => {
  const stock = new Map([['rice', { name: 'Basmati 5kg', quantityOnHand: 10 }]]);
  const errorFor = (taxRate: string) =>
    validateDelivery(
      {
        ...emptyDeliveryForm(),
        customerId: 'cust-1',
        lines: [{ key: 'a', itemId: 'rice', quantity: '1', unitPrice: '100', taxRate }],
      },
      stock,
    ).line.a?.taxRate;

  it('uses the same rule as every other document', () => {
    expect(errorFor('12.5')).toBeUndefined();
    expect(errorFor('150')).toBe('Tax must be between 0% and 100%');
    expect(errorFor('1.23456')).toBeTruthy();
  });
});
