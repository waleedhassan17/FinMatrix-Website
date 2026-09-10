import { useQueryClient } from '@tanstack/react-query';
import { Clock, RefreshCw, ShieldX, XCircle } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { AuthShell } from '@/features/auth/AuthShell';
import { useSignOut } from '@/features/auth/useSignOut';
import { authMe } from '@/networks/auth/authNetwork';
import {
  selectCompany,
  selectCompanyStatus,
  selectIsOwner,
  setIdentity,
} from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/store';
import type { AccountStatus } from '@/types';

/**
 * Where a signed-in user lands when their company will not serve business
 * requests.
 *
 * Reached two ways: sign-in returned a gate code (pending / rejected), or a
 * business request came back 403 COMPANY_NOT_ACTIVE mid-session and the axios
 * client re-read /auth/me. Both end here, because from the user's side they are
 * the same situation — the product is closed and they need to know why.
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
    body: 'Your company registration has not been submitted yet. Pick a plan and send us your payment to finish.',
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

export default function AccountStatusPage() {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const status = useAppSelector(selectCompanyStatus);
  const company = useAppSelector(selectCompany);
  const isOwner = useAppSelector(selectIsOwner);
  const { signOut } = useSignOut();
  const [checking, setChecking] = useState(false);

  const copy = COPY[status ?? 'unknown'];
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

  return (
    <AuthShell title={copy.title} subtitle={company?.name}>
      <div className="flex flex-col items-center gap-md text-center">
        <Icon className={`size-10 ${copy.tone}`} />
        <p className="text-body-md text-text-secondary">{copy.body}</p>

        <div className="mt-sm flex w-full flex-col gap-xs">
          {/* A way forward, not just an explanation. `inactive` means the
              subscription lapsed, which the owner can fix right now; `draft`
              means onboarding was abandoned part-way. Both were previously dead
              ends with nothing but "Check again". */}
          {status === 'inactive' && isOwner && (
            <Button full asChild>
              <Link to="/account/renew">Renew subscription</Link>
            </Button>
          )}
          {status === 'draft' && isOwner && (
            <Button full asChild>
              <Link to="/onboarding/plan">Finish setting up</Link>
            </Button>
          )}

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
        </div>
      </div>
    </AuthShell>
  );
}
