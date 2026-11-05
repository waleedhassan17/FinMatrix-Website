import { describe, expect, it } from 'vitest';

import {
  formatPkPhoneForDisplay,
  isValidPkMobile,
  isValidPkPhone,
  normalizePkPhone,
} from '@/utils/phone';

describe('normalizePkPhone', () => {
  it.each([
    ['03124890176', '+923124890176'],
    ['0312-4890176', '+923124890176'],
    ['+92 312 4890176', '+923124890176'],
    ['923124890176', '+923124890176'],
    ['(0312) 489.0176', '+923124890176'],
  ])('%s → %s', (raw, canonical) => {
    expect(normalizePkPhone(raw)).toBe(canonical);
  });

  it('treats blank input as no phone', () => {
    expect(normalizePkPhone('   ')).toBeUndefined();
    expect(normalizePkPhone(null)).toBeUndefined();
  });
});

describe('isValidPkMobile', () => {
  it('accepts a mobile in any typed form', () => {
    expect(isValidPkMobile('0300 7770001')).toBe(true);
    expect(isValidPkMobile('+923007770001')).toBe(true);
  });

  it('refuses landlines, short numbers and other countries', () => {
    expect(isValidPkMobile('042 35761234')).toBe(false);
    expect(isValidPkMobile('12345')).toBe(false);
    expect(isValidPkMobile('+14155552671')).toBe(false);
  });

  it('accepts a landline only where landlines are allowed', () => {
    expect(isValidPkPhone('042 35761234')).toBe(true);
  });
});

describe('formatPkPhoneForDisplay', () => {
  it('shows the stored form the way people write it', () => {
    expect(formatPkPhoneForDisplay('+923007770001')).toBe('0300 7770001');
    expect(formatPkPhoneForDisplay('+924235761234')).toBe('042 35761234');
  });

  it('leaves anything unrecognised alone', () => {
    expect(formatPkPhoneForDisplay('+14155552671')).toBe('+14155552671');
    expect(formatPkPhoneForDisplay(null)).toBe('');
  });
});
