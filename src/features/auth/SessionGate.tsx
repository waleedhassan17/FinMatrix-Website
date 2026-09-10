// ═══════════════════════════════════════════════════════
// FinMatrix Web — Session bootstrap, guards and event bridge
// ═══════════════════════════════════════════════════════

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import { authMe } from '@/networks/auth/authNetwork';
import { isPathAllowedForRole } from '@/config/routeAccess';
import {
  setAnonymous,
  setIdentity,
  signOut as signOutAction,
  selectAuthStatus,
  selectCompanyId,
  selectCompanyStatus,
  selectRole,
} from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  setCompanyStatusStaleHandler,
  setSessionExpiredHandler,
} from '@/utils/authEvents';
import { clearTokens, hasSession } from '@/utils/storage';

/**
 * Boots the session once, and wires the two events the axios client emits.
 *
 * Mount this INSIDE the router (it needs no navigation of its own, but the
 * guards below depend on the state it produces) and above every route.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const status = useAppSelector(selectAuthStatus);
  const booted = useRef(false);

  // ── Boot ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    if (!hasSession()) {
      dispatch(setAnonymous());
      return;
    }

    // A token exists but we have no identity — the usual case after a reload.
    // /auth/me is the source of truth for role, companyStatus and features;
    // none of them are persisted, precisely so a stale copy cannot outlive a
    // demotion or a lapsed subscription.
    authMe()
      .then((me) => dispatch(setIdentity(me)))
      .catch(() => {
        // The token is dead and the interceptor's refresh could not save it.
        clearTokens();
        dispatch(setAnonymous());
      });
  }, [dispatch]);

  // ── Session expired ─────────────────────────────────────────────────
  useEffect(() => {
    setSessionExpiredHandler(() => {
      dispatch(signOutAction());
      // Drop every cached response as well. Without this the next user to sign
      // in on this machine sees the previous one's invoice list for a beat.
      queryClient.clear();
      toast.error('Your session expired. Please sign in again.');
    });
    return () => setSessionExpiredHandler(null);
  }, [dispatch, queryClient]);

  // ── Company status went stale (403 COMPANY_NOT_ACTIVE) ──────────────
  useEffect(() => {
    setCompanyStatusStaleHandler(() => {
      // Re-read rather than assume: the subscription may have lapsed, or an
      // admin may have deactivated the company. /auth/me tells us which, and
      // the guard below routes accordingly.
      authMe()
        .then((me) => dispatch(setIdentity(me)))
        .catch(() => {
          /* the 401 path will pick it up if the token is gone too */
        });
    });
    return () => setCompanyStatusStaleHandler(null);
  }, [dispatch]);

  if (status === 'unknown') {
    return <BootSplash />;
  }

  return <>{children}</>;
}

function BootSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-sm">
        <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        <p className="text-body-sm text-text-secondary">Loading FinMatrix…</p>
      </div>
    </div>
  );
}

/**
 * Requires a signed-in user.
 *
 * Note it never redirects while status is 'unknown' — SessionGate holds the
 * splash until boot settles, but a guard that redirected on 'unknown' would
 * bounce a signed-in user to /login on every reload.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAppSelector(selectAuthStatus);
  const location = useLocation();

  if (status === 'anonymous') {
    // Remember where they were headed so sign-in can return them there.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

/**
 * Requires a company that business endpoints will actually serve.
 *
 * Sign-in deliberately succeeds for `draft` and `inactive` companies so the
 * client can reach onboarding or renewal — but CompanyGuard 403s every
 * business route for them. Without this gate the user would land on a
 * dashboard where every panel failed.
 */
export function RequireActiveCompany({ children }: { children: ReactNode }) {
  const companyStatus = useAppSelector(selectCompanyStatus);
  const companyId = useAppSelector(selectCompanyId);

  // No company at all — a freshly registered owner who has not been through
  // onboarding yet. Their companyStatus is null, which the check below treats as
  // "nothing to gate on", so without this clause they sail through to a dashboard
  // where every request goes out with no x-company-id and 403s. Send them to the
  // step they actually owe us.
  if (companyId === null) {
    return <Navigate to="/onboarding/company" replace />;
  }

  if (companyStatus !== null && companyStatus !== 'active') {
    return <Navigate to="/account-status" replace />;
  }

  return <>{children}</>;
}

/**
 * Owner-only.
 *
 * For the routes that sit OUTSIDE RequireRouteAccess — onboarding and renewal,
 * which must stay reachable while the company is draft or expired and therefore
 * cannot live inside RequireActiveCompany. Without this they would be open to any
 * authenticated staff member, since the staff allow-list never runs on them.
 */
export function RequireOwner({ children }: { children: ReactNode }) {
  const role = useAppSelector(selectRole);

  if (role !== null && role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

/**
 * Refuses a path this role has no business on.
 *
 * The sidebar already omits the link, but omitting a link is not the guarantee
 * the app makes: there, a route a staff member may not reach is not registered
 * at all, so typing the URL does nothing. This reproduces that for the browser
 * — a staff member who types /accounts lands on their dashboard rather than on
 * a screen whose every request 403s.
 */
export function RequireRouteAccess({ children }: { children: ReactNode }) {
  const role = useAppSelector(selectRole);
  const { pathname } = useLocation();

  if (!isPathAllowedForRole(pathname, role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

/**
 * Sends an already-signed-in user away from the public screens.
 *
 * Guards the sign-in and signup routes, and the landing page at `/` — a signed-in
 * visitor who types the bare domain wants their dashboard, not the sales pitch.
 * Deliberately silent on 'unknown': redirecting while the boot /auth/me is still
 * in flight would bounce a returning user through the marketing site on every
 * reload.
 */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const status = useAppSelector(selectAuthStatus);
  if (status === 'authenticated') {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
