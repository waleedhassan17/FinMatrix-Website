import { describe, expect, it } from 'vitest';

import { computeTotals, lineAmountOf } from '@/models/document';

/**
 * The totals engine, checked against hand-worked figures.
 *
 * Shared by invoices, estimates and sales orders — all three servers run the
 * same arithmetic, so this is the one place it is pinned.
 *
 * This is the most expensive thing in the module to get quietly wrong: a
 * rounding or ordering mistake produces a plausible number that disagrees with
 * the invoice the server actually posts, and nobody notices until a customer
 * queries their bill.
 */

describe('lineAmountOf', () => {
  it('is qty × price, with tax excluded', () => {
    expect(lineAmountOf({ quantity: '3', unitPrice: '250' })).toBe(750);
  });

  it('treats blank and unparseable input as zero rather than NaN', () => {
    expect(lineAmountOf({ quantity: '', unitPrice: '100' })).toBe(0);
    expect(lineAmountOf({ quantity: 'abc', unitPrice: '100' })).toBe(0);
    expect(lineAmountOf({ quantity: '2', unitPrice: undefined })).toBe(0);
  });

  it('accepts the 4-dp decimal strings the API returns', () => {
    expect(lineAmountOf({ quantity: '2.0000', unitPrice: '1500.5000' })).toBe(3001);
  });
});

describe('computeTotals', () => {
  const line = (quantity: string, unitPrice: string, taxRate = '0') => ({
    quantity,
    unitPrice,
    taxRate,
  });

  it('sums lines with no tax and no discount', () => {
    expect(computeTotals([line('2', '100'), line('1', '50')], 'none', '0')).toEqual({
      subtotal: 250,
      taxAmount: 0,
      discountAmount: 0,
      total: 250,
    });
  });

  it('taxes each line at its own rate', () => {
    // 1000 @ 17% = 170; 500 @ 5% = 25 → tax 195
    expect(
      computeTotals([line('1', '1000', '17'), line('1', '500', '5')], 'none', '0'),
    ).toEqual({
      subtotal: 1500,
      taxAmount: 195,
      discountAmount: 0,
      total: 1695,
    });
  });

  it('does NOT reduce tax when a discount applies', () => {
    // The server charges tax on the pre-discount base. Subtotal 1000, tax on
    // the full 1000 @ 17% = 170, discount 10% = 100 → 1000 − 100 + 170.
    const t = computeTotals([line('1', '1000', '17')], 'percent', '10');
    expect(t.subtotal).toBe(1000);
    expect(t.discountAmount).toBe(100);
    expect(t.taxAmount).toBe(170); // NOT 153, which taxing post-discount gives
    expect(t.total).toBe(1070);
  });

  it('applies a fixed discount literally', () => {
    expect(computeTotals([line('1', '1000')], 'amount', '250')).toEqual({
      subtotal: 1000,
      taxAmount: 0,
      discountAmount: 250,
      total: 750,
    });
  });

  it('clamps a discount larger than the subtotal', () => {
    // The app does not clamp and previews a negative total; the server clamps
    // to the subtotal. We match the server, because the server books the sale.
    const t = computeTotals([line('1', '500')], 'amount', '900');
    expect(t.discountAmount).toBe(500);
    expect(t.total).toBe(0);
  });

  it('clamps a percentage discount above 100%', () => {
    const t = computeTotals([line('1', '500')], 'percent', '150');
    expect(t.discountAmount).toBe(500);
    expect(t.total).toBe(0);
  });

  it('never lets a negative discount inflate the total', () => {
    const t = computeTotals([line('1', '500')], 'amount', '-100');
    expect(t.discountAmount).toBe(0);
    expect(t.total).toBe(500);
  });

  it('ignores discountValue when the type is none', () => {
    const t = computeTotals([line('1', '500')], 'none', '100');
    expect(t.discountAmount).toBe(0);
    expect(t.total).toBe(500);
  });

  it('rounds to 2dp without float drift', () => {
    // 0.1 + 0.2 territory: three lines of 33.33 plus 17% tax.
    const t = computeTotals(
      [line('1', '33.33', '17'), line('1', '33.33', '17'), line('1', '33.34', '17')],
      'none',
      '0',
    );
    expect(t.subtotal).toBe(100);
    expect(t.taxAmount).toBe(17);
    expect(t.total).toBe(117);
  });

  it('keeps the displayed components consistent with the displayed total', () => {
    // The app computes `total` from UNROUNDED components while showing rounded
    // ones, so its rows need not sum to its total. Ours must.
    const t = computeTotals(
      [line('3', '19.99', '17'), line('7', '4.55', '5')],
      'percent',
      '7.5',
    );
    expect(
      Number((t.subtotal - t.discountAmount + t.taxAmount).toFixed(2)),
    ).toBe(t.total);
  });

  it('returns zeroes for an empty invoice', () => {
    expect(computeTotals([], 'none', '0')).toEqual({
      subtotal: 0,
      taxAmount: 0,
      discountAmount: 0,
      total: 0,
    });
  });
});
