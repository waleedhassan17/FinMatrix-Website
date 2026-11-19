import { describe, expect, it } from 'vitest';

import { pageSlots } from '@/models/pagination';

describe('pageSlots', () => {
  it('lists every page when there are seven or fewer', () => {
    expect(pageSlots(1, 1)).toEqual([1]);
    expect(pageSlots(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps the first, the last and the neighbours, with gaps between', () => {
    expect(pageSlots(1, 12)).toEqual([1, 2, 3, 4, 5, null, 12]);
    expect(pageSlots(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
    expect(pageSlots(12, 12)).toEqual([1, null, 8, 9, 10, 11, 12]);
  });

  it('never hides a single page behind a gap', () => {
    expect(pageSlots(4, 12)).toEqual([1, 2, 3, 4, 5, null, 12]);
    expect(pageSlots(9, 12)).toEqual([1, null, 8, 9, 10, 11, 12]);
  });

  it('never draws more than seven slots', () => {
    for (let pages = 1; pages <= 40; pages++) {
      for (let page = 1; page <= pages; page++) {
        const slots = pageSlots(page, pages);
        expect(slots.length).toBeLessThanOrEqual(7);
        expect(slots).toContain(page);
        expect(slots[0]).toBe(1);
        expect(slots[slots.length - 1]).toBe(pages);
      }
    }
  });
});
