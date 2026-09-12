import { describe, expect, it } from 'vitest';

import {
  isRoleAllowedOnWebPortal,
  portalMismatch,
  switchLabel,
} from '@/features/auth/portalAccess';

describe('isRoleAllowedOnWebPortal', () => {
  it('admits only owners on the owner door', () => {
    expect(isRoleAllowedOnWebPortal('admin', 'admin')).toBe(true);
    expect(isRoleAllowedOnWebPortal('admin', 'staff')).toBe(false);
    expect(isRoleAllowedOnWebPortal('admin', 'delivery')).toBe(false);
    expect(isRoleAllowedOnWebPortal('admin', 'super_admin')).toBe(false);
  });

  it('admits only team members on the team member door', () => {
    expect(isRoleAllowedOnWebPortal('staff', 'staff')).toBe(true);
    expect(isRoleAllowedOnWebPortal('staff', 'admin')).toBe(false);
    expect(isRoleAllowedOnWebPortal('staff', 'delivery')).toBe(false);
    expect(isRoleAllowedOnWebPortal('staff', 'super_admin')).toBe(false);
  });

  it('admits nobody whose role is unknown', () => {
    expect(isRoleAllowedOnWebPortal('admin', null)).toBe(false);
    expect(isRoleAllowedOnWebPortal('staff', undefined)).toBe(false);
  });
});

describe('portalMismatch', () => {
  it('sends an owner to the owner door and a team member to theirs', () => {
    expect(portalMismatch('admin')).toMatchObject({ switchTo: 'admin' });
    expect(portalMismatch('admin').message).toMatch(/business owner account/i);
    expect(portalMismatch('staff')).toMatchObject({ switchTo: 'staff' });
    expect(portalMismatch('staff').message).toMatch(/team member account/i);
  });

  it('offers no web door to riders or platform administrators', () => {
    expect(portalMismatch('delivery')).toMatchObject({ switchTo: null });
    expect(portalMismatch('delivery').message).toMatch(/android app/i);
    expect(portalMismatch('super_admin')).toMatchObject({ switchTo: null });
  });

  it('labels the switch by destination', () => {
    expect(switchLabel('admin')).toBe('Sign in as business owner');
    expect(switchLabel('staff')).toBe('Sign in as team member');
  });
});
