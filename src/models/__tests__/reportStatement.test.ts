import { describe, expect, it } from 'vitest';

import {
  ASSET_GROUPS,
  bucketStatementLines,
  classifyAccount,
  LIABILITY_GROUPS,
  reconcile,
  variance,
  type StatementLine,
} from '@/models/reportStatement';

const line = (accountCode: string, amount = 100, accountName = 'Account'): StatementLine => ({
  accountCode,
  accountName,
  amount,
});

describe('classifyAccount', () => {
  it('maps each band to its statement group', () => {
    expect(classifyAccount('1000')).toBe('bank');
    expect(classifyAccount('1100')).toBe('ar');
    expect(classifyAccount('1200')).toBe('otherCurrentAsset');
    expect(classifyAccount('1500')).toBe('fixedAsset');
    expect(classifyAccount('2000')).toBe('currentLiability');
    expect(classifyAccount('2700')).toBe('longTermLiability');
    expect(classifyAccount('3000')).toBe('equity');
    expect(classifyAccount('4000')).toBe('income');
    expect(classifyAccount('5000')).toBe('cogs');
    expect(classifyAccount('6000')).toBe('expense');
  });

  it('is exact at every band boundary', () => {
    expect(classifyAccount('1099')).toBe('bank');
    expect(classifyAccount('1100')).toBe('ar');
    expect(classifyAccount('1199')).toBe('ar');
    expect(classifyAccount('1200')).toBe('otherCurrentAsset');
    expect(classifyAccount('1499')).toBe('otherCurrentAsset');
    expect(classifyAccount('1500')).toBe('fixedAsset');
    expect(classifyAccount('1999')).toBe('fixedAsset');
    expect(classifyAccount('2699')).toBe('currentLiability');
    expect(classifyAccount('2700')).toBe('longTermLiability');
    expect(classifyAccount('5999')).toBe('cogs');
    expect(classifyAccount('6000')).toBe('expense');
    expect(classifyAccount('7999')).toBe('expense');
  });

  it('keeps the seeded chart’s awkward accounts in the right place', () => {
    // Goods in Transit and GRNI sit inside wider bands than their names suggest.
    expect(classifyAccount('1250')).toBe('otherCurrentAsset');
    expect(classifyAccount('1300')).toBe('otherCurrentAsset');
    expect(classifyAccount('2050')).toBe('currentLiability');
    expect(classifyAccount('2300')).toBe('currentLiability');
    expect(classifyAccount('3900')).toBe('equity');
  });

  it('keeps Customer Advances (2400) a CURRENT liability', () => {
    // Unearned revenue is a contract liability the server settles when the goods
    // are delivered — inside the operating cycle. The app's map cuts current at
    // 2399 and files this as long-term, which on a real company put 145,000 in
    // the wrong half of the balance sheet.
    expect(classifyAccount('2400')).toBe('currentLiability');
  });

  it('is other for a code outside every band', () => {
    expect(classifyAccount('9000')).toBe('other');
    expect(classifyAccount('999')).toBe('other');
  });

  it('is other for a non-numeric code', () => {
    expect(classifyAccount('ABC')).toBe('other');
    expect(classifyAccount('12A0')).toBe('other');
    expect(classifyAccount('')).toBe('other');
  });
});

describe('bucketStatementLines', () => {
  it('groups assets in presentation order', () => {
    const result = bucketStatementLines(
      [line('1500'), line('1000'), line('1100')],
      ASSET_GROUPS,
    );
    expect(result.sections.map((s) => s.group)).toEqual(['bank', 'ar', 'fixedAsset']);
  });

  it('omits a group with no lines rather than printing an empty heading', () => {
    const result = bucketStatementLines([line('1000')], ASSET_GROUPS);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].group).toBe('bank');
  });

  it('sorts lines within a group by code, numerically', () => {
    const result = bucketStatementLines(
      [line('1250'), line('1200'), line('1300')],
      ASSET_GROUPS,
    );
    expect(result.sections[0].lines.map((l) => l.accountCode)).toEqual([
      '1200',
      '1250',
      '1300',
    ]);
  });

  it('subtotals each group from its own lines', () => {
    const result = bucketStatementLines(
      [line('1000', 500), line('1010', 250)],
      ASSET_GROUPS,
    );
    expect(result.sections[0].subtotal).toBe(750);
  });

  it('surfaces an unclassifiable account as leftover rather than dropping it', () => {
    // An account missing from the statement is far worse than one under a vague
    // heading — and the section totals come from the server regardless.
    const result = bucketStatementLines(
      [line('1000', 500), line('9000', 75)],
      ASSET_GROUPS,
    );
    expect(result.leftover.map((l) => l.accountCode)).toEqual(['9000']);
    expect(result.leftoverSubtotal).toBe(75);
  });

  it('treats an account from another statement section as leftover', () => {
    // An equity account handed to the asset bucketer must still appear.
    const result = bucketStatementLines([line('3000', 900)], ASSET_GROUPS);
    expect(result.sections).toHaveLength(0);
    expect(result.leftover).toHaveLength(1);
  });

  it('buckets liabilities separately from assets', () => {
    const result = bucketStatementLines(
      [line('2000'), line('2700')],
      LIABILITY_GROUPS,
    );
    expect(result.sections.map((s) => s.group)).toEqual([
      'currentLiability',
      'longTermLiability',
    ]);
  });

  it('sums without float drift', () => {
    const result = bucketStatementLines(
      [line('1000', 0.1), line('1010', 0.2)],
      ASSET_GROUPS,
    );
    expect(result.sections[0].subtotal).toBe(0.3);
  });

  it('tolerates undefined and an empty list', () => {
    expect(bucketStatementLines(undefined, ASSET_GROUPS).sections).toEqual([]);
    expect(bucketStatementLines([], ASSET_GROUPS).leftover).toEqual([]);
  });
});

describe('reconcile', () => {
  it('returns the server total when the two agree', () => {
    expect(reconcile(1000, 1000, 'Assets')).toBe(1000);
  });

  it('returns the SERVER total when they disagree', () => {
    // The server foots from unrounded four-decimal figures and rounds once;
    // re-adding the rounded lines here is what would make a balanced ledger
    // report as unbalanced.
    expect(reconcile(999.98, 1000, 'Assets')).toBe(1000);
  });

  it('returns the server total even on a large discrepancy', () => {
    expect(reconcile(0, 5000, 'Assets')).toBe(5000);
  });
});

describe('variance', () => {
  it('reports the movement and the percentage', () => {
    expect(variance(1200, 1000)).toEqual({ delta: 200, percent: 20 });
  });

  it('reports a decrease as negative', () => {
    expect(variance(800, 1000)).toEqual({ delta: -200, percent: -20 });
  });

  it('gives a null percentage when the prior figure is zero', () => {
    // A percentage of nothing is a statement about dividing by zero.
    expect(variance(500, 0)).toEqual({ delta: 500, percent: null });
  });

  it('measures against the absolute prior, so a shrinking loss improves', () => {
    // From −1000 to −400 is a 600 improvement on a base of 1000.
    expect(variance(-400, -1000)).toEqual({ delta: 600, percent: 60 });
  });

  it('rounds the percentage to one decimal', () => {
    expect(variance(1000, 333).percent).toBe(200.3);
  });

  it('is zero movement for identical figures', () => {
    expect(variance(1000, 1000)).toEqual({ delta: 0, percent: 0 });
  });

  it('does not drift on decimal amounts', () => {
    expect(variance(0.3, 0.1).delta).toBe(0.2);
  });
});
