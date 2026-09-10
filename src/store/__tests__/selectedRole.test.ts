// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import authReducer, {
  setAnonymous,
  setIdentity,
  setSelectedRole,
  signOut,
  selectSelectedRole,
  type Identity,
} from '@/store/authSlice';
import { isPathAllowedForRole } from '@/config/routeAccess';
import {
  getStoredPortalRole,
  setStoredPortalRole,
} from '@/utils/storage';

/**
 * selectedRole is a UI PREFERENCE, not a permission. These assertions keep the
 * two from being confused, and pin the one bug this was easy to ship with.
 */

const state = (overrides?: Partial<ReturnType<typeof authReducer>>) => ({
  auth: { ...authReducer(undefined, { type: '@@init' }), ...overrides },
});

const identity = (role: 'admin' | 'staff'): Identity => ({
  user: {
    id: 'u1',
    email: role === 'admin' ? 'o@e.com' : null,
    username: role === 'staff' ? 'warehouse_user' : null,
    displayName: 'Test',
    role,
    phone: null,
    companyId: 'c1',
    defaultCompanyId: 'c1',
    isEmailVerified: true,
  },
  companyId: 'c1',
  company: { id: 'c1', name: 'Test Co', status: 'approved' },
  companyStatus: 'active',
  companyType: 'warehouse',
  features: null,
});

describe('storage round-trip', () => {
  beforeEach(() => window.localStorage.clear());

  it('persists and reads back', () => {
    setStoredPortalRole('staff');
    expect(getStoredPortalRole()).toBe('staff');
  });

  it('returns null for a value nobody should have written', () => {
    // localStorage is writable by anyone at the keyboard. An unrecognised value
    // reaching the UI would render neither form.
    window.localStorage.setItem('@finmatrix/selectedRole', 'super_admin');
    expect(getStoredPortalRole()).toBeNull();

    window.localStorage.setItem('@finmatrix/selectedRole', '{"role":"admin"}');
    expect(getStoredPortalRole()).toBeNull();
  });

  it('returns null when nothing was ever stored', () => {
    expect(getStoredPortalRole()).toBeNull();
  });
});

describe('setSelectedRole', () => {
  beforeEach(() => window.localStorage.clear());

  it('records the choice in state and in storage', () => {
    const next = authReducer(undefined, setSelectedRole('staff'));
    expect(next.selectedRole).toBe('staff');
    expect(getStoredPortalRole()).toBe('staff');
  });
});

describe('sign-out preserves the chosen portal', () => {
  beforeEach(() => window.localStorage.clear());

  // THE BUG THIS CATCHES: setAnonymous and signOut reset via
  // Object.assign(state, initialState), and `initialState` captured its value at
  // module load. A plain reset therefore reverts selectedRole to whatever it was
  // when the module was first imported — so a staff member who signs out is handed
  // the owner's email form on the way back in.
  it.each([
    ['signOut', signOut()],
    ['setAnonymous', setAnonymous()],
  ])('%s keeps it', (_label, action) => {
    const chosen = authReducer(undefined, setSelectedRole('staff'));
    const after = authReducer(chosen, action);

    expect(after.selectedRole).toBe('staff');
    // And the rest really was cleared.
    expect(after.user).toBeNull();
    expect(after.isAuthenticated).toBe(false);
    expect(after.status).toBe('anonymous');
  });
});

describe('the preference grants nothing', () => {
  it('does not widen what a staff account may reach', () => {
    // Choosing the owner door gets you the owner's FORM. Authority comes from
    // user.role, which only the server sets.
    const chosen = authReducer(undefined, setSelectedRole('admin'));
    const signedIn = authReducer(chosen, setIdentity(identity('staff')));

    expect(selectSelectedRole(state(signedIn))).toBe('admin');
    expect(signedIn.user?.role).toBe('staff');

    // Route access reads the server's word, not the preference.
    expect(isPathAllowedForRole('/accounts', signedIn.user?.role)).toBe(false);
    expect(isPathAllowedForRole('/settings/users', signedIn.user?.role)).toBe(false);
  });
});
