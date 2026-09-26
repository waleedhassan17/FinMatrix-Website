import { describe, expect, it } from 'vitest';

import { niceAxis } from '@/models/chartAxis';

describe('niceAxis', () => {
  it('steps in round numbers from zero', () => {
    expect(niceAxis([0, 96370, 59000]).ticks).toEqual([0, 25000, 50000, 75000, 100000]);
  });

  it('gives a shallow dip a sliver and no negative tick', () => {
    const axis = niceAxis([100, -10]);
    expect(axis.ticks[0]).toBe(0);
    expect(axis.domain[0]).toBeLessThan(-10);
  });

  it('gives a deep dip the steps it needs', () => {
    expect(niceAxis([100, -80]).ticks[0]).toBeLessThan(0);
  });

  it('keeps a count of units on whole numbers', () => {
    expect(niceAxis([0, 1, 2], { integer: true }).ticks).toEqual([0, 1, 2]);
    expect(niceAxis([0, 1, 2]).ticks).toContain(0.5);
  });

  it('ignores months with no reading', () => {
    expect(niceAxis([null, 40, undefined]).ticks).toEqual([0, 10, 20, 30, 40]);
    expect(niceAxis([null, null])).toEqual({ domain: [0, 1], ticks: [0] });
  });
});
