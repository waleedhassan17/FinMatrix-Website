import { describe, expect, it } from 'vitest';

import {
  canApply,
  canDelete,
  canVoid,
  computeVendorCreditTotals,
  itemLineAmount,
  maxApplicable,
  usableVendorCreditLines,
  validateVendorCreditLines,
  type VendorCreditFormLine,
} from '@/models/vendorCredit';

const line = (over: Partial<VendorCreditFormLine> = {}): VendorCreditFormLine => ({
  id: 'vcl_1',
  itemId: '',
  accountId: '',
  description: 'Overcharge on freight',
  quantity: '',
  amount: '100.00',
  taxRate: '0',
  ...over,
});

describe('computeVendorCreditTotals', () => {
  it('sums the net line amounts', () => {
    expect(
      computeVendorCreditTotals([
        line({ amount: '100.00' }),
        line({ id: 'vcl_2', amount: '250.50' }),
      ]),
    ).toEqual({ subtotal: 350.5, taxAmount: 0, total: 350.5 });
  });

  it('charges tax per line on that line’s own net amount', () => {
    // 1000 @ 17% = 170; 500 @ 0% = 0. Total 1500 + 170.
    expect(
      computeVendorCreditTotals([
        line({ amount: '1000', taxRate: '17' }),
        line({ id: 'vcl_2', amount: '500', taxRate: '0' }),
      ]),
    ).toEqual({ subtotal: 1500, taxAmount: 170, total: 1670 });
  });

  it('sums without float drift', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE-754; Decimal makes it exact.
    expect(
      computeVendorCreditTotals([
        line({ amount: '0.1' }),
        line({ id: 'vcl_2', amount: '0.2' }),
      ]).subtotal,
    ).toBe(0.3);
  });

  it('rounds tax to two decimals', () => {
    // 33.33 @ 17% = 5.6661 → 5.67
    expect(
      computeVendorCreditTotals([line({ amount: '33.33', taxRate: '17' })]),
    ).toEqual({ subtotal: 33.33, taxAmount: 5.67, total: 39 });
  });

  it('treats a blank or unparseable amount as zero', () => {
    expect(
      computeVendorCreditTotals([
        line({ amount: '' }),
        line({ id: 'vcl_2', amount: 'abc' }),
        line({ id: 'vcl_3', amount: '40' }),
      ]).total,
    ).toBe(40);
  });

  it('is zero for no lines', () => {
    expect(computeVendorCreditTotals([])).toEqual({
      subtotal: 0,
      taxAmount: 0,
      total: 0,
    });
  });
});

describe('itemLineAmount', () => {
  it('prices a return at quantity times carrying cost', () => {
    expect(itemLineAmount('3', 250)).toBe('750.00');
  });

  it('rounds to two decimals', () => {
    expect(itemLineAmount('3', 33.333)).toBe('100.00');
  });

  it('is zero when the quantity is blank', () => {
    expect(itemLineAmount('', 250)).toBe('0.00');
  });
});

describe('usableVendorCreditLines', () => {
  it('keeps only lines with a description and a positive amount', () => {
    const kept = usableVendorCreditLines([
      line({ description: 'Returned stock', amount: '10' }),
      line({ id: 'vcl_2', description: '', amount: '10' }),
      line({ id: 'vcl_3', description: 'No figure', amount: '0' }),
    ]);
    expect(kept.map((l) => l.id)).toEqual(['vcl_1']);
  });
});

describe('validateVendorCreditLines', () => {
  it('accepts one complete line', () => {
    expect(validateVendorCreditLines([line()])).toBe('');
  });

  it('refuses an empty editor', () => {
    expect(validateVendorCreditLines([line({ description: '', amount: '' })])).toBe(
      'Add at least one line with a description and an amount.',
    );
  });

  it('names an amount typed without a description rather than dropping it', () => {
    // The mobile app silently discards this line; a figure the user typed
    // vanishing without a word is worse than a refusal.
    expect(
      validateVendorCreditLines([
        line(),
        line({ id: 'vcl_2', description: '  ', amount: '75' }),
      ]),
    ).toBe('Every line with an amount needs a description.');
  });

  it('refuses a returned item with no quantity', () => {
    // The DTO allows it, but the server relieves stock BY the quantity — so a
    // blank one would take nothing off the shelf.
    expect(
      validateVendorCreditLines([line({ itemId: 'item-1', quantity: '' })]),
    ).toBe('A returned item needs a quantity.');
  });

  it('accepts a returned item that has a quantity', () => {
    expect(
      validateVendorCreditLines([
        line({ itemId: 'item-1', quantity: '2', amount: '500.00' }),
      ]),
    ).toBe('');
  });

  it('accepts a money-only line coded to an expense account', () => {
    expect(
      validateVendorCreditLines([line({ accountId: 'acct-6000', amount: '250' })]),
    ).toBe('');
  });
});

describe('canApply', () => {
  it('allows an open credit with a balance', () => {
    expect(canApply({ balance: 500, status: 'open' })).toBe(true);
  });

  it('allows a partly applied credit', () => {
    expect(canApply({ balance: 250, status: 'applied' })).toBe(true);
  });

  it('refuses a void credit', () => {
    expect(canApply({ balance: 500, status: 'void' })).toBe(false);
  });

  it('refuses a closed credit', () => {
    expect(canApply({ balance: 500, status: 'closed' })).toBe(false);
  });

  it('refuses rounding dust rather than offering a 0.001 credit', () => {
    expect(canApply({ balance: 0.001, status: 'open' })).toBe(false);
  });
});

describe('canVoid and canDelete', () => {
  it('allow an untouched open credit', () => {
    expect(canVoid({ status: 'open', amountApplied: 0 })).toBe(true);
    expect(canDelete({ status: 'open', amountApplied: 0 })).toBe(true);
  });

  it('refuse once any of the credit has been consumed', () => {
    // The server answers ALREADY_APPLIED, so the button must disappear.
    expect(canVoid({ status: 'open', amountApplied: 25 })).toBe(false);
  });

  it('tolerate rounding dust in what has been applied', () => {
    expect(canVoid({ status: 'open', amountApplied: 0.001 })).toBe(true);
  });

  it('refuse anything that is no longer open', () => {
    expect(canVoid({ status: 'applied', amountApplied: 0 })).toBe(false);
    expect(canVoid({ status: 'void', amountApplied: 0 })).toBe(false);
  });
});

describe('maxApplicable', () => {
  it('is capped by the bill when the credit is larger', () => {
    expect(maxApplicable(1000, 400)).toBe(400);
  });

  it('is capped by the credit when the bill is larger', () => {
    expect(maxApplicable(300, 400)).toBe(300);
  });

  it('never goes negative', () => {
    expect(maxApplicable(-5, 400)).toBe(0);
  });
});
