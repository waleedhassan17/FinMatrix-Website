import { describe, expect, it } from 'vitest';

import { lakhCroreWords } from '@/utils/money';

describe('lakhCroreWords', () => {
  it('says a large amount the way it is counted here', () => {
    expect(lakhCroreWords(6_000_000)).toBe('60 lakh');
    expect(lakhCroreWords('10000000')).toBe('1 crore');
    expect(lakhCroreWords(12_500_000)).toBe('1 crore 25 lakh');
    expect(lakhCroreWords(250_000)).toBe('2 lakh 50 thousand');
    expect(lakhCroreWords(1_234_567.5)).toBe('12 lakh 34 thousand 567.5');
  });

  it('stays quiet below a thousand and on nothing', () => {
    expect(lakhCroreWords(999)).toBeNull();
    expect(lakhCroreWords('')).toBeNull();
    expect(lakhCroreWords(undefined)).toBeNull();
  });
});
