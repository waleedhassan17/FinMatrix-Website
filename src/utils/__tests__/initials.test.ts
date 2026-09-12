import { describe, expect, it } from 'vitest';

import { initialsOf } from '@/utils/initials';

describe('initialsOf', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsOf('Warehouse Admin')).toBe('WA');
    expect(initialsOf('ali raza khan')).toBe('AR');
  });

  it('handles one word and stray whitespace', () => {
    expect(initialsOf('  verify.staff ')).toBe('V');
    expect(initialsOf('Sara   Ahmed')).toBe('SA');
  });

  it('falls back to a question mark when there is no name', () => {
    expect(initialsOf('')).toBe('?');
    expect(initialsOf('   ')).toBe('?');
    expect(initialsOf(null)).toBe('?');
    expect(initialsOf(undefined)).toBe('?');
  });
});
