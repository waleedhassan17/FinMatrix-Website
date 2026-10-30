import { describe, expect, it } from 'vitest';

import { canDonut, foldSlices, MAX_SLICES, OTHER_KEY, sliceShare } from '@/models/chartSlices';

const p = (key: string, value: number, count?: number) => ({ key, label: key, value, ...(count !== undefined ? { count } : {}) });

describe('canDonut', () => {
  it('draws parts of a positive whole only', () => {
    expect(canDonut([p('a', 10), p('b', 0)])).toBe(true);
    // A credit has no slice: the page shows bars.
    expect(canDonut([p('a', 10), p('b', -2)])).toBe(false);
    expect(canDonut([p('a', 0)])).toBe(false);
    expect(canDonut([])).toBe(false);
  });
});

describe('foldSlices', () => {
  it('leaves six or fewer alone, largest first', () => {
    expect(foldSlices([p('a', 1), p('b', 3), p('c', 2)]).map((s) => s.key)).toEqual(['b', 'c', 'a']);
  });

  it('keeps the six largest and folds the rest into one Other, its value and count theirs', () => {
    const points = Array.from({ length: 9 }, (_, i) => p(`k${i}`, (i + 1) * 10.25, 2));
    const out = foldSlices(points);
    expect(out).toHaveLength(MAX_SLICES + 1);
    expect(out.slice(0, 6).map((s) => s.key)).toEqual(['k8', 'k7', 'k6', 'k5', 'k4', 'k3']);
    expect(out[6]).toEqual({ key: OTHER_KEY, label: 'Other (3)', value: 61.5, count: 6 });
  });

  it('gives Other no count when the parts had none', () => {
    const out = foldSlices(Array.from({ length: 8 }, (_, i) => p(`k${i}`, i + 1)));
    expect(out[6]).not.toHaveProperty('count');
  });
});

describe('sliceShare', () => {
  it('takes the server’s share when there is one, else the part of what is shown', () => {
    expect(sliceShare({ ...p('a', 1), sharePct: 66.67 }, 3)).toBe(66.67);
    expect(sliceShare(p('a', 1), 4)).toBe(25);
    expect(sliceShare(p('a', 1), 0)).toBeNull();
  });
});
