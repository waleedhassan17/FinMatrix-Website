import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Gift, RefreshCw, ShieldX, XCircle } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { BILLING_DISABLED_BUILD } from '@/config/featureFlags';
import { AuthShell } from '@/features/auth/AuthShell';
import { useSignOut } from '@/features/auth/useSignOut';
import { authMe } from '@/networks/auth/authNetwork';
import { getBillingStatus } from '@/networks/billing/billingNetwork';
// BILLING-DISABLED BUILD: drives the draft branch's "Submit for approval".
import { submitCompanyForApproval } from '@/networks/companies/companiesNetwork';
import {
  selectAuthStatus,
  selectCompany,
  selectCompanyStatus,
  selectIsOwner,
  setIdentity,
} from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/store';
import type { AccountStatus } from '@/types';

/**
 * Where a user lands when their company will not serve business requests.
 *
 * Reached three ways: sign-in returned a gate code (pending / rejected — no
 * token is issued, so the login page hands the code over in route state), a
 * signed-in draft or expired owner was routed here, or a business request came
 * back 403 COMPANY_NOT_ACTIVE mid-session and the axios client re-read
 * /auth/me. From the user's side these are the same situation — the product is
 * closed and they need to know why.
 *
 * A FREE TRIAL request waits in the same review queue as a payment, so it is
 * `pending` too. Its copy is branched here rather than given another page: the
 * promise differs ("activated within 24 hours", "your 30 days start then") and
 * neither message may be shown to the other kind of owner.
 */

interface Copy {
  icon: ComponentType<{ className?: string }>;
  tone: string;
  title: string;
  body: string;
}

const COPY: Record<AccountStatus | 'unknown', Copy> = {
  pending: {
    icon: Clock,
    tone: 'text-warning',
    title: 'Waiting for approval',
    body: 'Your company is being reviewed by the FinMatrix team. You will be able to sign in as soon as it is approved.',
  },
  // These two used to send the user to the mobile app, because the web had no
  // onboarding or renewal flow. It has both now, so they point at it.
  draft: {
    icon: Clock,
    tone: 'text-warning',
    title: 'Setup not finished',
    // BILLING-DISABLED BUILD: was "Start a free trial or choose a plan to
    // finish." The only step left is the submit, which the button does.
    body: 'Your company registration has not been submitted yet. Send it for approval to finish.',
  },
  inactive: {
    icon: XCircle,
    tone: 'text-danger',
    title: 'Subscription expired',
    body: 'This company’s subscription has lapsed, so the books are locked. Your data is untouched — renew to get straight back in.',
  },
  rejected: {
    icon: ShieldX,
    tone: 'text-danger',
    title: 'Registration rejected',
    body: 'This company’s registration was not approved. Contact FinMatrix support if you believe that is a mistake.',
  },
  active: {
    icon: Clock,
    tone: 'text-success',
    title: 'Account active',
    body: 'Your company is active. If you are seeing this, try reloading.',
  },
  unknown: {
    icon: XCircle,
    tone: 'text-text-tertiary',
    title: 'Account unavailable',
    body: 'We could not determine your company’s status. Try again, or sign in with a different account.',
  },
};

const TRIAL_PENDING_COPY: Copy = {
  icon: Gift,
  tone: 'text-primary',
  title: 'Your free trial is being activated',
  body: 'We have received your request for a 30-day free trial — every feature, with one delivery rider. Our team activates it within 24 hours and a confirmation email is on its way. Your 30 days start when the trial is activated, so no time is lost while you wait.',
};

const TRIAL_ENDED_COPY: Copy = {
  icon: XCircle,
  tone: 'text-danger',
  title: 'Your free trial has ended',
  body: 'Subscribe to keep your data active. Everything you set up during the trial is exactly where you left it.',
};

/** Sign-in gate codes → the status they stand for. */
const CODE_STATUS: Record<string, AccountStatus> = {
  COMPANY_PENDING: 'pending',
  COMPANY_REJECTED: 'rejected',
  COMPANY_INACTIVE: 'inactive',
};

interface GateState {
  code?: string;
  message?: string;
  pendingKind?: 'trial' | 'payment' | null;
}

export default function AccountStatusPage() {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const location = useLocation();
  const authStatus = useAppSelector(selectAuthStatus);
  const sessionStatus = useAppSelector(selectCompanyStatus);
  const company = useAppSelector(selectCompany);
  const isOwner = useAppSelector(selectIsOwner);
  const { signOut } = useSignOut();
  const [checking, setChecking] = useState(false);
  // BILLING-DISABLED BUILD: drives the draft branch's "Submit for approval".
  const [submitting, setSubmitting] = useState(false);

  const gate = (location.state as GateState | null) ?? null;
  const gateStatus = gate?.code ? CODE_STATUS[gate.code] : undefined;
  const signedIn = authStatus === 'authenticated';

  // With a session we can ask what is in review and whether a trial lapsed.
  // Without one (a blocked sign-in) there is no token to ask with.
  const status: AccountStatus | null = signedIn ? sessionStatus : (gateStatus ?? null);
  const billing = useQuery({
    queryKey: ['billing', 'status'],
    queryFn: getBillingStatus,
    enabled: signedIn && (status === 'pending' || status === 'inactive'),
    retry: false,
  });

  if (authStatus === 'anonymous' && !gateStatus) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const trialPending =
    status === 'pending' && (gate?.pendingKind === 'trial' || billing.data?.trialPending === true);
  const trialEnded =
    status === 'inactive' && billing.data?.isTrial === true && !billing.data.trialConvertedAt;

  const copy = trialPending
    ? TRIAL_PENDING_COPY
    : trialEnded
      ? TRIAL_ENDED_COPY
      : COPY[status ?? 'unknown'];
  const Icon = copy.icon;

  // Re-checking is worth offering: `inactive` is computed live from the
  // subscription expiry date, so a renewal completed on the phone takes effect
  // here the moment /auth/me is asked again — no waiting for the nightly cron.
  const recheck = async () => {
    setChecking(true);
    try {
      const me = await authMe();
      dispatch(setIdentity(me));
      queryClient.clear();
    } catch {
      /* leave the user on this screen; the message already explains why */
    } finally {
      setChecking(false);
    }
  };

  // BILLING-DISABLED BUILD: hand a stuck draft to an administrator. Reached
  // when CompanySetupPage's submit failed, or when an owner abandoned
  // onboarding and signed back in (the server does not block `draft` at
  // sign-in). Until this runs, nobody is looking at their company.
  const submitForApproval = async () => {
    if (!company?.id) return;
    setSubmitting(true);
    try {
      await submitCompanyForApproval(company.id);
      dispatch(setIdentity(await authMe()));
      queryClient.clear();
    } catch {
      /* the button stays; the copy already explains the state */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title={copy.title} subtitle={company?.name}>
      <div className="flex flex-col items-center gap-md text-center">
        <Icon className={`size-10 ${copy.tone}`} />
        <p className="text-body-md text-text-secondary">{copy.body}</p>

        {trialPending && (
          <p className="text-body-sm text-text-tertiary">
            Free trials are usually activated within 24 hours.
          </p>
        )}

        <div className="mt-sm flex w-full flex-col gap-xs">
          {signedIn ? (
            <>
              {/* A way forward, not just an explanation. `inactive` means the
                  subscription lapsed, which the owner can fix right now; `draft`
                  means onboarding was abandoned part-way. Both were previously
                  dead ends with nothing but "Check again". */}
              {/* BILLING-DISABLED BUILD: `inactive` can no longer be fixed by
                  the owner — there is nothing to renew — so the renew button
                  is hidden. A deactivated account is an administrator's
                  decision now, which the copy already says. */}
              {!BILLING_DISABLED_BUILD && status === 'inactive' && isOwner && (
                <Button full asChild>
                  <Link to="/account/renew">
                    {trialEnded ? 'Subscribe to a plan' : 'Renew subscription'}
                  </Link>
                </Button>
              )}

              {/* BILLING-DISABLED BUILD: a draft's remaining work used to be
                  "choose a plan", so this linked to /onboarding/plan — a route
                  that no longer exists. The only step left is the submit
                  itself, so the button does it. This is the web twin of the
                  app's PendingApprovalScreen auto-submit, and the retry path
                  for a failed submit in CompanySetupPage. */}
              {status === 'draft' &&
                isOwner &&
                (BILLING_DISABLED_BUILD ? (
                  <Button full onClick={submitForApproval} disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit for approval'}
                  </Button>
                ) : (
                  <Button full asChild>
                    <Link to="/onboarding/plan">Finish setting up</Link>
                  </Button>
                ))}

              <Button
                variant={
                  isOwner && (status === 'inactive' || status === 'draft')
                    ? 'secondary'
                    : 'primary'
                }
                full
                onClick={recheck}
                disabled={checking}
              >
                <RefreshCw className={`size-4 ${checking ? 'animate-spin' : ''}`} />
                {checking ? 'Checking…' : 'Check again'}
              </Button>
              <Button variant="text" full onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            // No session: the only thing to do is try signing in again later.
            <Button full asChild>
              <Link to="/login">Back to sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
