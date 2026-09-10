// ═══════════════════════════════════════════════════════
// FinMatrix Web — Identity
// ═══════════════════════════════════════════════════════
// The only thing Redux holds. Everything else is server state and belongs to
// TanStack Query.
//
// Why Redux at all: the axios interceptor and the route guards need to answer
// "who is this and what may they do?" SYNCHRONOUSLY, during render, before any
// query has settled. A Query cache cannot promise that.
//
// This is flatter than the app's authSlice, which hangs companyType and
// features off `user`. Here they are siblings, because they describe the
// COMPANY, not the person — and the distinction stops matering the moment you
// try to read `user.features` for a user who has no company yet.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type {
  AccountStatus,
  AuthUser,
  CompanyRef,
  CompanyType,
  Features,
  UserRole,
} from '@/types';
import {
  getStoredPortalRole,
  setStoredPortalRole,
  type PortalRole,
} from '@/utils/storage';

/** Everything signin and /auth/me agree on. */
export interface Identity {
  user: AuthUser;
  companyId: string | null;
  company: CompanyRef | null;
  /** Normalised, expiry-aware. NOT company.status. */
  companyStatus: AccountStatus | null;
  companyType: CompanyType | null;
  features: Features | null;
}

export interface AuthState {
  user: AuthUser | null;
  companyId: string | null;
  company: CompanyRef | null;
  companyStatus: AccountStatus | null;
  companyType: CompanyType | null;
  features: Features | null;
  isAuthenticated: boolean;
  /**
   * 'unknown' until the boot /auth/me settles. Route guards must not redirect
   * on 'unknown' — doing so bounces a signed-in user to /login on every reload
   * while their identity is still in flight.
   */
  status: 'unknown' | 'authenticated' | 'anonymous';
  error: string;
  /**
   * Which sign-in door the visitor chose at /get-started — owner (email) or
   * staff (username).
   *
   * A UI preference, NOT a permission. It selects a form and an accent colour.
   * Everything that decides what the user may actually do reads `user.role`,
   * which only the server sets; /auth/signin ignores any role hint from the
   * client. The two must never be conflated: a staff member who sets this to
   * 'admin' gets the email field and exactly no extra access.
   *
   * Unlike the rest of this slice it IS persisted (localStorage, not redux-
   * persist) — a stale copy of a preference is harmless, where a stale copy of
   * an identity role would outlive a demotion.
   */
  selectedRole: PortalRole | null;
}

const initialState: AuthState = {
  user: null,
  companyId: null,
  company: null,
  companyStatus: null,
  companyType: null,
  features: null,
  isAuthenticated: false,
  status: 'unknown',
  error: '',
  selectedRole: null,
};

/**
 * Reset that keeps the chosen portal.
 *
 * `Object.assign(state, initialState)` captures `initialState` as it was at
 * module load, so a plain reset would silently revert selectedRole to null and a
 * staff member would be handed the owner's form after every sign-out.
 */
const resetPreservingPortal = (state: AuthState): void => {
  const portal = state.selectedRole;
  Object.assign(state, initialState, {
    status: 'anonymous' as const,
    selectedRole: portal,
  });
};

export const authSlice = createSlice({
  name: 'auth',
  // Hydrated, so the portal chosen before a reload is still the portal shown
  // after it. Reading storage here rather than in an effect means the right form
  // renders on the first paint instead of swapping under the user.
  initialState: { ...initialState, selectedRole: getStoredPortalRole() },
  reducers: {
    setIdentity(state, action: PayloadAction<Identity>) {
      const { user, companyId, company, companyStatus, companyType, features } =
        action.payload;
      state.user = user;
      state.companyId = companyId;
      state.company = company;
      state.companyStatus = companyStatus;
      state.companyType = companyType;
      state.features = features;
      state.isAuthenticated = true;
      state.status = 'authenticated';
      state.error = '';
    },
    /** Boot finished and there was no usable session. */
    setAnonymous(state) {
      resetPreservingPortal(state);
    },
    signOut(state) {
      resetPreservingPortal(state);
    },
    /**
     * Record which portal the visitor picked.
     *
     * Writes through to localStorage from the reducer. That is a side effect in a
     * reducer, which is normally wrong — it is done here because the alternative
     * is every caller remembering to persist, and the one that forgets produces a
     * bug nobody can reproduce. The write is idempotent and cannot fail loudly
     * (storage.ts swallows a blocked localStorage).
     */
    setSelectedRole(state, action: PayloadAction<PortalRole>) {
      state.selectedRole = action.payload;
      setStoredPortalRole(action.payload);
    },
    setAuthError(state, action: PayloadAction<string>) {
      state.error = action.payload;
    },
    clearAuthError(state) {
      state.error = '';
    },
  },
});

export const {
  setIdentity,
  setAnonymous,
  signOut,
  setAuthError,
  clearAuthError,
  setSelectedRole,
} = authSlice.actions;

// ─── Selectors ──────────────────────────────────────
// Typed against the slice's own state so they compose into the root store
// without a circular import back to store.ts.
type WithAuth = { auth: AuthState };

export const selectUser = (s: WithAuth): AuthUser | null => s.auth.user;
export const selectRole = (s: WithAuth): UserRole | null => s.auth.user?.role ?? null;
export const selectIsOwner = (s: WithAuth): boolean => s.auth.user?.role === 'admin';
export const selectCompanyId = (s: WithAuth): string | null => s.auth.companyId ?? null;
export const selectCompany = (s: WithAuth): CompanyRef | null => s.auth.company ?? null;
export const selectCompanyStatus = (s: WithAuth): AccountStatus | null =>
  s.auth.companyStatus ?? null;
export const selectCompanyType = (s: WithAuth): CompanyType | null =>
  s.auth.companyType ?? null;
export const selectFeatures = (s: WithAuth): Features | null => s.auth.features ?? null;
export const selectIsAuthenticated = (s: WithAuth): boolean => s.auth.isAuthenticated;
export const selectAuthStatus = (s: WithAuth): AuthState['status'] => s.auth.status;
export const selectAuthError = (s: WithAuth): string => s.auth.error;

/**
 * The chosen sign-in portal. Drives which form renders — never what it permits.
 * For authority use selectRole, which reads the server's word.
 */
export const selectSelectedRole = (s: WithAuth): PortalRole | null =>
  s.auth.selectedRole;

/**
 * Is the company in a state where business routes will work?
 *
 * Only 'active' passes. Signin deliberately lets 'draft' and 'inactive' through
 * with a valid token so the client can reach onboarding or renewal — but
 * CompanyGuard 403s every business endpoint for them, so the shell must gate on
 * this rather than on merely having a session.
 */
export const selectCompanyIsActive = (s: WithAuth): boolean =>
  s.auth.companyStatus === 'active';

export default authSlice.reducer;
