import { describe, expect, it } from 'vitest';

import { nextStepFor } from '@/features/auth/nextStep';
import { selectNeedsEmailVerification, type AuthState } from '@/store/authSlice';
import type { AuthUser } from '@/types';

const user = (over: Partial<AuthUser>): AuthUser => ({
  id: 'u1',
  email: 'owner@x.z',
  username: null,
  displayName: 'Owner',
  role: 'admin',
  phone: null,
  companyId: null,
  defaultCompanyId: null,
  isEmailVerified: true,
  ...over,
});

const state = (u: AuthUser | null) => ({ auth: { user: u } as AuthState });

describe('selectNeedsEmailVerification', () => {
  it('holds an owner whose address is unconfirmed', () => {
    expect(selectNeedsEmailVerification(state(user({ isEmailVerified: false })))).toBe(true);
  });

  it.each([
    ['a confirmed owner', user({})],
    ['an owner with no address to confirm', user({ email: null, isEmailVerified: false })],
    ['a staff member', user({ role: 'staff', isEmailVerified: false })],
  ])('lets %s through', (_label, u) => {
    expect(selectNeedsEmailVerification(state(u))).toBe(false);
  });

  it('is false with nobody signed in', () => {
    expect(selectNeedsEmailVerification(state(null))).toBe(false);
  });
});

describe('nextStepFor', () => {
  it('sends an owner with no company to onboarding', () => {
    expect(nextStepFor({ companyId: null, companyStatus: null })).toBe('/onboarding/company');
  });

  it('sends an active company to the dashboard', () => {
    expect(nextStepFor({ companyId: 'c1', companyStatus: 'active' })).toBe('/dashboard');
  });

  it.each(['pending', 'draft', 'inactive', 'rejected'] as const)(
    'sends a %s company to the status page',
    (companyStatus) => {
      expect(nextStepFor({ companyId: 'c1', companyStatus })).toBe('/account-status');
    },
  );
});
