import { describe, expect, it } from 'vitest';

import {
  emptyTaxRateForm,
  liabilityStatus,
  quarterLabel,
  taxPaymentPayload,
  taxRatePayload,
  validateTaxPayment,
  validateTaxRate,
  type TaxPaymentForm,
} from '@/models/tax';
import {
  mapTaxRate,
  pagedSerializer,
  mapTaxPayment,
  taxLiabilitySerializer,
} from '@/serializers/taxSerializer';

const payment = (over: Partial<TaxPaymentForm> = {}): TaxPaymentForm => ({
  taxRateId: 'rate-1',
  period: '2026-Q3',
  amount: '12500',
  paymentDate: '2026-09-11',
  reference: '',
  ...over,
});

describe('liabilityStatus', () => {
  it('distinguishes owed, settled and a credit due', () => {
    expect(liabilityStatus(1250)).toBe('owed');
    expect(liabilityStatus(0)).toBe('settled');
    // The app calls this "fully paid"; it is money coming back.
    expect(liabilityStatus(-340.5)).toBe('credit');
  });

  it('treats sub-paisa dust as settled', () => {
    expect(liabilityStatus(0.001)).toBe('settled');
    expect(liabilityStatus(-0.004)).toBe('settled');
  });
});

describe('quarterLabel', () => {
  it('labels the quarter a date falls in', () => {
    expect(quarterLabel('2026-01-01')).toBe('2026-Q1');
    expect(quarterLabel('2026-03-31')).toBe('2026-Q1');
    expect(quarterLabel('2026-09-11')).toBe('2026-Q3');
    expect(quarterLabel('2026-12-31')).toBe('2026-Q4');
  });

  it('is empty for something that is not a date', () => {
    expect(quarterLabel('')).toBe('');
  });
});

describe('validateTaxPayment', () => {
  it('accepts a complete payment', () => {
    expect(validateTaxPayment(payment())).toEqual({});
  });

  it('requires a rate, a period and a date', () => {
    const e = validateTaxPayment(payment({ taxRateId: '', period: ' ', paymentDate: '' }));
    expect(e.taxRateId).toBeTruthy();
    expect(e.period).toBeTruthy();
    expect(e.paymentDate).toBeTruthy();
  });

  it('keeps the period within the column’s 32 characters', () => {
    expect(validateTaxPayment(payment({ period: 'x'.repeat(33) })).period).toBeTruthy();
  });

  it('refuses a zero, negative or malformed amount', () => {
    expect(validateTaxPayment(payment({ amount: '0' })).amount).toBeTruthy();
    expect(validateTaxPayment(payment({ amount: '-5' })).amount).toBeTruthy();
    expect(validateTaxPayment(payment({ amount: '12.345' })).amount).toBeTruthy();
    expect(validateTaxPayment(payment({ amount: '12abc' })).amount).toBeTruthy();
  });

  it('accepts thousands separators', () => {
    expect(validateTaxPayment(payment({ amount: '12,500.00' }))).toEqual({});
  });
});

describe('taxPaymentPayload', () => {
  it('sends exactly the DTO’s fields — period and paymentDate included', () => {
    // The app sends `date` and `notes` and omits `period`; every one 400s.
    expect(taxPaymentPayload(payment({ reference: 'FBR-Q3-001' }))).toEqual({
      taxRateId: 'rate-1',
      period: '2026-Q3',
      amount: '12500.00',
      paymentDate: '2026-09-11',
      reference: 'FBR-Q3-001',
    });
  });

  it('omits a blank reference and strips separators from the amount', () => {
    const p = taxPaymentPayload(payment({ amount: '1,250.5', reference: '  ' }));
    expect(p.amount).toBe('1250.50');
    expect('reference' in p).toBe(false);
    expect('date' in p).toBe(false);
    expect('notes' in p).toBe(false);
  });
});

describe('validateTaxRate and taxRatePayload', () => {
  const form = { ...emptyTaxRateForm(), name: 'GST 17%', rate: '17' };

  it('accepts a normal rate', () => {
    expect(validateTaxRate(form)).toEqual({});
  });

  it('bounds the rate to 0–100 with up to four decimals, like the column', () => {
    expect(validateTaxRate({ ...form, rate: '100.0001' }).rate).toBeTruthy();
    expect(validateTaxRate({ ...form, rate: '5.12345' }).rate).toBeTruthy();
    expect(validateTaxRate({ ...form, rate: '-1' }).rate).toBeTruthy();
    expect(validateTaxRate({ ...form, rate: '0' })).toEqual({});
  });

  it('holds the name to the column’s 120 characters, not the DTO’s 200', () => {
    expect(validateTaxRate({ ...form, name: 'x'.repeat(121) }).name).toBeTruthy();
  });

  it('normalises the rate and sends a blank authority so it can be cleared', () => {
    expect(taxRatePayload({ ...form, rate: '17.50' })).toEqual({
      name: 'GST 17%',
      rate: '17.5',
      type: 'sales',
      authority: '',
      isActive: true,
      isDefault: false,
    });
  });
});

describe('tax serializers', () => {
  it('reads the decimal-string rate and the real field names', () => {
    const rate = mapTaxRate({
      id: 'r1',
      name: 'GST (17%)',
      rate: '17.0000',
      type: 'sales',
      authority: 'FBR',
      isActive: true,
      isDefault: true,
    });
    // The app reads 0, 'GST' and '' here.
    expect(rate.rate).toBe(17);
    expect(rate.type).toBe('sales');
    expect(rate.authority).toBe('FBR');
    expect(rate.isDefault).toBe(true);
  });

  it('reads the liability breakdown', () => {
    const l = taxLiabilitySerializer({
      fromDate: '2026-01-01',
      toDate: '2026-09-11',
      rows: [{ taxRateId: 'output-tax', taxName: 'Output Tax (Sales)', collected: 1700, paid: 500, net: 1200 }],
      totalCollected: 1700,
      totalPaid: 500,
      totalNet: 1149.65,
      outputTax: 1700,
      inputTaxRecoverable: 50.35,
      taxRemitted: 500,
    });
    expect(l.totalNet).toBe(1149.65);
    expect(l.inputTaxRecoverable).toBe(50.35);
    expect(l.rows[0].net).toBe(1200);
  });

  it('keeps the paging fields whichever shape the body takes', () => {
    const map = mapTaxPayment;
    const flat = pagedSerializer(
      { data: [{ id: 'p1', amount: '100.0000' }], total: 45, page: 2, limit: 20 },
      map,
      { page: 2, limit: 20 },
    );
    expect(flat.total).toBe(45);
    expect(flat.totalPages).toBe(3);
    expect(flat.rows[0].amount).toBe(100);

    const wrapped = pagedSerializer(
      { success: true, data: { data: [{ id: 'p1' }], total: 45, page: 1, limit: 20 } },
      map,
      { page: 1, limit: 20 },
    );
    expect(wrapped.total).toBe(45);

    const bare = pagedSerializer([{ id: 'p1' }, { id: 'p2' }], map, { page: 1, limit: 20 });
    expect(bare.total).toBe(2);
    expect(bare.totalPages).toBe(1);
  });

  it('reads the envelope the client actually receives, total stripped', () => {
    // ResponseEnvelopeInterceptor keeps only `data` from {data, total, page,
    // limit}; the rows must still come through, and total falls back to them.
    const real = pagedSerializer(
      { success: true, data: [{ id: 'p1', amount: '10.0000' }, { id: 'p2', amount: '20.0000' }] },
      mapTaxPayment,
      { page: 1, limit: 500 },
    );
    expect(real.rows.map((r) => r.amount)).toEqual([10, 20]);
    expect(real.total).toBe(2);
  });
});
