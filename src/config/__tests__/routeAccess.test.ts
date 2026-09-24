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
  // Settings and user management are the owner's (Module 24).
  '/settings',
  '/settings/company',
  '/settings/users',
  '/approvals',
  '/approvals/abc-123',
  '/reconciliations',
  '/reconciliations/reconcile/abc-123',
  '/reconciliations/abc-123',
  // Staff read the liability only; recording a payment and managing rates are
  // @Roles('admin') on the server.
  '/tax',
  '/tax/payments',
  '/tax/payments/new',
  '/tax/rates',
  // Payroll and budgets are the owner's (Module 21).
  '/employees',
  '/employees/new',
  '/employees/abc-123/edit',
  '/payroll',
  '/payroll/runs',
  '/payroll/runs/new',
  '/payroll/runs/abc-123',
  '/budgets',
  '/budgets/new',
  '/budgets/abc-123',

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
  // Staff read their own request's detail here — they cannot reach /approvals/*.
  '/my-requests/abc-123',
  '/customers',
  '/customers/abc-123',
  '/invoices',
  '/invoices/new',
  '/bills/pay',
  '/inventory',
  '/inventory/new',
  '/inventory/abc-123',
  '/inventory/abc-123/adjust',
  // Delivery operations are the staff working set too (Module 20).
  '/deliveries',
  '/deliveries/new',
  '/deliveries/assign',
  '/deliveries/completions',
  '/deliveries/abc-123',
  '/delivery-personnel',
  '/delivery-personnel/new',
  '/delivery-personnel/abc-123',
  '/vendor-credits',
  '/vendor-credits/new',
  '/journal-entries',
  '/journal-entries/new',
  '/journal-entries/opening-balance',
  '/tax/liability',
  // Redirects to Profit & Loss. Not a nav item — the Reports group has no path
  // of its own — so it relies on STAFF_EXTRA_PREFIXES, not the nav-derived list.
  '/reports',
  '/reports/profit-loss',
  '/reports/balance-sheet',
  '/reports/trial-balance',
  '/reports/cash-flow',
  '/reports/general-ledger',
  '/reports/ar-aging',
  '/reports/ap-aging',
  '/reports/inventory-valuation',
  '/reports/analytics',
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

  it('gives both roles the same delivery working set, gated on the feature', () => {
    const group = (nav: typeof ADMIN_NAV) => nav.find((g) => g.title === 'Deliveries');
    const admin = group(ADMIN_NAV);
    const staff = group(STAFF_NAV as typeof ADMIN_NAV);
    expect(admin?.feature).toBe('delivery');
    expect(staff?.feature).toBe('delivery');
    expect(staff?.items?.map((i) => i.path)).toEqual(admin?.items?.map((i) => i.path));
    // Every item carries the gate too, so no row survives a tier without it.
    for (const item of [...(admin?.items ?? []), ...(staff?.items ?? [])]) {
      expect(item.feature).toBe('delivery');
    }
  });
});
