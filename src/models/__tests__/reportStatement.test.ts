import { describe, expect, it } from 'vitest';

import { formatRatio, reconcile, variance } from '@/models/reportStatement';

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

describe('formatRatio', () => {
  it('prints margins to one place, signs a loss, and has nothing to say over zero', () => {
    expect(formatRatio(412, 1000)).toBe('41.2%');
    expect(formatRatio(-31, 1000)).toBe('−3.1%');
    expect(formatRatio(5, 0)).toBe('—');
  });
});
