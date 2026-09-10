import { describe, expect, it } from 'vitest';

import { makeLoginSchema } from '@/features/auth/loginSchema';

/**
 * The rule these pin is FAIL OPEN ON VALIDATION, FAIL CLOSED ON PERMISSIONS.
 *
 * Client-side validation can only narrow what the server already accepts, so a
 * wrong guess here protects nobody and locks somebody out. The owner branch is
 * the only one allowed to narrow, and every other case — staff, absent, junk —
 * must accept anything non-empty and let /auth/signin decide.
 *
 * Also pins the zod v4 shape: `.trim().pipe(z.email())` rather than the
 * deprecated `.email()` method, and the trim running BEFORE the shape check so a
 * pasted address with a trailing space is not rejected for not being an email.
 */

const parse = (role: 'admin' | 'staff' | null, identifier: string) =>
  makeLoginSchema(role).safeParse({ identifier, password: 'whatever' });

describe('owner portal validation', () => {
  it('accepts an email', () => {
    expect(parse('admin', 'owner@example.com').success).toBe(true);
  });

  it('trims before checking the shape', () => {
    const result = parse('admin', '  owner@example.com  ');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.identifier).toBe('owner@example.com');
    }
  });

  it('rejects a username, which is what tells the owner they are on the wrong door', () => {
    expect(parse('admin', 'warehouse_user').success).toBe(false);
  });

  it('rejects an empty identifier', () => {
    expect(parse('admin', '').success).toBe(false);
  });
});

describe('staff portal validation', () => {
  it('accepts a username', () => {
    expect(parse('staff', 'warehouse_user').success).toBe(true);
  });

  it('accepts an email too — a staff account could have been seeded with one', () => {
    expect(parse('staff', 'someone@example.com').success).toBe(true);
  });

  it('rejects only an empty identifier', () => {
    expect(parse('staff', '').success).toBe(false);
    expect(parse('staff', '   ').success).toBe(false);
  });
});

describe('unknown portal', () => {
  it.each([null, undefined])('falls through to the permissive rule for %s', (role) => {
    const schema = makeLoginSchema(role as null);
    // A bare /login, or a tampered stored preference, must never be the reason
    // someone cannot sign in.
    expect(
      schema.safeParse({ identifier: 'warehouse_user', password: 'x' }).success,
    ).toBe(true);
  });
});

describe('password', () => {
  it('is required on both doors', () => {
    for (const role of ['admin', 'staff'] as const) {
      const identifier = role === 'admin' ? 'a@b.co' : 'user';
      expect(
        makeLoginSchema(role).safeParse({ identifier, password: '' }).success,
      ).toBe(false);
    }
  });

  it('has no length rule — the server owns that, and an old account may predate it', () => {
    expect(
      makeLoginSchema('staff').safeParse({ identifier: 'user', password: 'a' })
        .success,
    ).toBe(true);
  });
});
