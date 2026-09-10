import { describe, expect, it } from 'vitest';

import { ADMIN_NAV, STAFF_NAV } from '@/config/nav';
import { isPathAllowedForRole } from '@/config/routeAccess';

/**
 * The staff surface is an allow-list. These assertions are the runtime half of
 * the guarantee StaffNavPath makes at compile time.
 */

/** Every path the app's STAFF_FORBIDDEN_ROUTES keeps staff away from. */
const FORBIDDEN = [
  '/accounts',
  '/accounts/new',
  '/accounts/abc-123',
  '/settings/company',
  '/settings/users',
  '/approvals',
  '/approvals/abc-123',
  '/reconciliations',
  '/employees',
  '/payroll/runs',
  '/budgets',

  // Buying and renewing a subscription is the owner's alone.
  //
  // `/account/renew` is the one that needed an explicit deny rather than simply
  // being absent from the allow-list: `/account` IS a staff nav path, and this
  // function matches by PREFIX, so the renewal screen would have inherited
  // permission from "My Account" and opened to every staff member.
  '/account/renew',
  '/onboarding/company',
  '/onboarding/plan',
  '/onboarding/pay',
];

const ALLOWED = [
  '/dashboard',
  '/my-requests',
  '/customers',
  '/customers/abc-123',
  '/invoices',
  '/invoices/new',
  '/bills/pay',
  '/inventory',
  '/vendor-credits',
  '/vendor-credits/new',
  '/journal-entries',
  '/journal-entries/new',
  '/journal-entries/opening-balance',
  '/tax/liability',
  '/reports/profit-loss',
  '/account',
];

describe('isPathAllowedForRole', () => {
  it.each(FORBIDDEN)('refuses staff %s', (path) => {
    expect(isPathAllowedForRole(path, 'staff')).toBe(false);
  });

  it.each(ALLOWED)('permits staff %s', (path) => {
    expect(isPathAllowedForRole(path, 'staff')).toBe(true);
  });

  it('permits the owner everything', () => {
    for (const path of [...FORBIDDEN, ...ALLOWED]) {
      expect(isPathAllowedForRole(path, 'admin')).toBe(true);
    }
  });

  it('refuses roles outside the company model', () => {
    expect(isPathAllowedForRole('/dashboard', 'delivery')).toBe(false);
    expect(isPathAllowedForRole('/dashboard', null)).toBe(false);
  });

  it('does not let "/" act as a prefix for everything', () => {
    // The bug this guards against: matching '/' as a prefix would make every
    // path allowed and silently disable the whole allow-list.
    expect(isPathAllowedForRole('/accounts', 'staff')).toBe(false);
  });

  it('refuses a path that merely starts with an allowed one', () => {
    // '/accounts' must not be reachable via a lookalike of '/account'.
    expect(isPathAllowedForRole('/account', 'staff')).toBe(true);
    expect(isPathAllowedForRole('/accounts', 'staff')).toBe(false);
  });
});

describe('nav configs', () => {
  const pathsOf = (nav: typeof ADMIN_NAV) =>
    nav.flatMap((g) => [
      ...(g.path ? [g.path] : []),
      ...(g.items ?? []).map((i) => i.path),
    ]);

  it('never puts a staff-forbidden path in the staff nav', () => {
    for (const path of pathsOf(STAFF_NAV as typeof ADMIN_NAV)) {
      expect(isPathAllowedForRole(path, 'staff')).toBe(true);
    }
  });

  it('keeps the owner-only areas out of the staff nav entirely', () => {
    const staffPaths = pathsOf(STAFF_NAV as typeof ADMIN_NAV);
    for (const forbidden of FORBIDDEN) {
      expect(staffPaths).not.toContain(forbidden);
    }
  });

  it('gives the owner the areas staff do not get', () => {
    const adminPaths = pathsOf(ADMIN_NAV);
    for (const owned of [
      '/accounts',
      '/approvals',
      '/settings/users',
      '/reconciliations',
      '/budgets',
    ]) {
      expect(adminPaths).toContain(owned);
    }
  });

  it('excludes delivery from both roles', () => {
    // Out of scope for this console by decision — see the plan.
    const all = [...pathsOf(ADMIN_NAV), ...pathsOf(STAFF_NAV as typeof ADMIN_NAV)];
    expect(all.some((p) => p.startsWith('/deliver'))).toBe(false);
    expect(all.some((p) => p.includes('personnel'))).toBe(false);
  });
});
