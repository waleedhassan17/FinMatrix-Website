import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  Clock,
  Download,
  Gift,
  Mail,
  MessageCircle,
  PauseCircle,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { AuthShell } from '@/features/auth/AuthShell';
import { useSignOut } from '@/features/auth/useSignOut';
import { ActivationRequestDialog } from '@/features/launch/ActivationRequestDialog';
import { usePublicConfig } from '@/hooks/usePublicConfig';
import { LAUNCH } from '@/config/launchStrings';
import { authMe, authRefreshSession, type MeResponse } from '@/networks/auth/authNetwork';
import { accountState, type AccountScreenState as State } from '@/models/accountStatus';
import { BackupPanel } from '@/pages/settings/BackupExportPage';
import {
  selectAuthStatus,
  selectCompany,
  selectCompanyStatus,
  selectIsOwner,
  selectPendingKind,
  selectSubscription,
  selectUser,
  setIdentity,
} from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/store';

/**
 * Where a user lands when their company will not serve business requests:
 * a trial held for review, an approval request waiting, a rejection, a trial
 * or plan that ended, or a suspension. Reached from a blocked sign-in (the
 * gate code arrives in route state), from a signed-in owner whose company is
 * not active, or mid-session when a request comes back 403.
 *
 * Every state says what happens next. An ended trial is never a dead end: the
 * owner can download a full backup, request activation, or book a call.
 */

interface View {
  icon: ComponentType<{ className?: string }>;
  tone: string;
  title: string;
  body: string;
}

const VIEWS: Record<State, View> = {
  held: { icon: Gift, tone: 'text-primary', title: LAUNCH.heldTitle, body: LAUNCH.heldBody },
  approval: { icon: Clock, tone: 'text-warning', title: LAUNCH.approvalPendingTitle, body: LAUNCH.approvalPendingBody },
  pending: { icon: Clock, tone: 'text-warning', title: LAUNCH.approvalPendingTitle, body: LAUNCH.approvalPendingBody },
  draft: {
    icon: Clock,
    tone: 'text-warning',
    title: 'Setup not finished',
    body: 'Your company is set up. Choose how to start: your free trial, or account approval.',
  },
  rejected: { icon: ShieldX, tone: 'text-danger', title: LAUNCH.rejectedTitle, body: LAUNCH.rejectedBody },
  trialEnded: { icon: XCircle, tone: 'text-danger', title: LAUNCH.trialEndedTitle, body: LAUNCH.trialEndedBody },
  planEnded: { icon: XCircle, tone: 'text-danger', title: LAUNCH.planEndedTitle, body: LAUNCH.planEndedBody },
  suspended: { icon: PauseCircle, tone: 'text-warning', title: LAUNCH.suspendedTitle, body: LAUNCH.suspendedBody },
  deactivated: {
    icon: PauseCircle,
    tone: 'text-warning',
    title: 'Account deactivated',
    body: 'Access to this company has been paused by FinMatrix. Your data is safe and untouched — contact FinMatrix support to restore access.',
  },
  active: {
    icon: ShieldCheck,
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

/** How often a company awaiting review re-checks while this page is open. */
const APPROVAL_POLL_MS = 30_000;

interface GateState {
  code?: string;
  message?: string;
  pendingKind?: 'trial' | 'approval' | 'payment' | null;
  rejectionReason?: string | null;
}

export default function AccountStatusPage() {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const config = usePublicConfig();
  const user = useAppSelector(selectUser);
  const authStatus = useAppSelector(selectAuthStatus);
  const sessionStatus = useAppSelector(selectCompanyStatus);
  const company = useAppSelector(selectCompany);
  const isOwner = useAppSelector(selectIsOwner);
  const pendingKind = useAppSelector(selectPendingKind);
  const subscription = useAppSelector(selectSubscription);
  const { signOut } = useSignOut();
  const [checking, setChecking] = useState(false);
  const [activationOpen, setActivationOpen] = useState(false);
  const [showBackup, setShowBackup] = useState(false);

  const gate = (location.state as GateState | null) ?? null;
  const signedIn = authStatus === 'authenticated';

  const state = accountState({
    signedIn,
    status: sessionStatus,
    pendingKind,
    trialEnded: subscription?.trialEnded === true,
    suspended: subscription?.suspended === true,
    subscriptionStatus: subscription?.subscriptionStatus,
    gateCode: gate?.code,
    gatePendingKind: gate?.pendingKind,
  });

  // Approved: straight to the dashboard (the token is re-issued first).
  const wentLive = useRef(false);
  const goLive = useCallback(
    async (me: MeResponse) => {
      if (wentLive.current) return;
      wentLive.current = true;
      await authRefreshSession();
      dispatch(setIdentity(me));
      queryClient.clear();
      toast.success(`${me.company?.name ?? 'Your company'} is active. Welcome to FinMatrix.`);
      navigate('/dashboard', { replace: true });
    },
    [dispatch, navigate, queryClient],
  );

  // While something is being reviewed, look again every 30 seconds and
  // whenever the tab comes back, so approval takes effect without a click.
  const waiting =
    signedIn &&
    (sessionStatus === 'pending' ||
      ((state === 'trialEnded' || state === 'planEnded') && subscription?.paymentStatus === 'submitted'));
  const watch = useQuery({
    queryKey: ['auth', 'approval-watch'],
    queryFn: authMe,
    enabled: waiting,
    refetchInterval: APPROVAL_POLL_MS,
    refetchOnWindowFocus: 'always',
    retry: false,
    gcTime: 0,
  });
  useEffect(() => {
    const me = watch.data;
    if (!me) return;
    if (me.companyStatus === 'active') {
      void goLive(me);
    } else if (me.companyStatus !== sessionStatus) {
      dispatch(setIdentity(me));
    }
  }, [watch.data, sessionStatus, goLive, dispatch]);

  if (authStatus === 'anonymous' && !gate?.code) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const view = VIEWS[state];
  const Icon = view.icon;
  const ended = state === 'trialEnded' || state === 'planEnded';
  const activationPending = ended && subscription?.paymentStatus === 'submitted';
  const staffOnEnded = ended && !isOwner;

  const recheck = async () => {
    setChecking(true);
    try {
      const me = await authMe();
      if (me.companyStatus === 'active') {
        await goLive(me);
        return;
      }
      dispatch(setIdentity(me));
      queryClient.clear();
    } catch {
      /* the message already explains why */
    } finally {
      setChecking(false);
    }
  };

  const supportLinks = (config.supportEmail || config.supportWhatsapp) && (
    <div className="flex flex-wrap justify-center gap-md text-body-sm">
      {config.supportEmail && (
        <a className="inline-flex items-center gap-xxs text-primary" href={`mailto:${config.supportEmail}`}>
          <Mail className="size-4" /> {config.supportEmail}
        </a>
      )}
      {config.supportWhatsapp && (
        <a
          className="inline-flex items-center gap-xxs text-primary"
          href={`https://wa.me/${config.supportWhatsapp.replace(/\D/g, '')}`}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle className="size-4" /> WhatsApp
        </a>
      )}
    </div>
  );

  const rejectionReason = gate?.rejectionReason ?? null;

  return (
    <AuthShell title={view.title} subtitle={company?.name}>
      <div className="flex flex-col items-center gap-md text-center">
        <Icon className={`size-10 ${view.tone}`} />
        <p className="text-body-md text-text-secondary" data-testid="status-body">
          {staffOnEnded ? LAUNCH.staffEndedBody : view.body}
        </p>

        {state === 'rejected' && rejectionReason && (
          <p className="rounded-md bg-danger-lighter p-sm text-body-sm text-text-primary">
            <span className="text-label-md">{LAUNCH.reasonLabel}: </span>
            {rejectionReason}
          </p>
        )}

        {signedIn && (state === 'approval' || state === 'pending') && user?.email && (
          <p className="text-body-sm text-text-tertiary">{user.email}</p>
        )}

        {activationPending && (
          <p className="rounded-md bg-primary-tint p-sm text-body-sm text-text-primary">
            {LAUNCH.activationPending}
          </p>
        )}

        {(state === 'rejected' || state === 'suspended' || state === 'deactivated' || ended) && supportLinks}

        <div className="mt-sm flex w-full flex-col gap-xs">
          {signedIn ? (
            <>
              {state === 'draft' && isOwner && (
                <Button full asChild>
                  <Link to="/onboarding/company">{LAUNCH.chooseTitle}</Link>
                </Button>
              )}

              {ended && isOwner && company?.id && (
                <>
                  <Button full onClick={() => setShowBackup((v) => !v)}>
                    <Download className="size-4" />
                    {LAUNCH.downloadData}
                  </Button>
                  {!activationPending && (
                    <Button full variant="secondary" onClick={() => setActivationOpen(true)}>
                      {LAUNCH.requestActivation}
                    </Button>
                  )}
                  <Button full variant="secondary" asChild>
                    <Link to="/book-demo">
                      <CalendarClock className="size-4" />
                      {LAUNCH.bookCall}
                    </Link>
                  </Button>
                </>
              )}

              <Button variant={ended || state === 'draft' ? 'text' : 'primary'} full onClick={recheck} disabled={checking}>
                <RefreshCw className={`size-4 ${checking ? 'animate-spin' : ''}`} />
                {checking ? LAUNCH.checking : LAUNCH.checkAgain}
              </Button>
              <Button variant="text" full onClick={signOut}>
                {LAUNCH.signOut}
              </Button>
            </>
          ) : (
            <Button full asChild>
              <Link to="/login">{LAUNCH.backToSignIn}</Link>
            </Button>
          )}
        </div>

        {ended && isOwner && showBackup && (
          <div className="mt-md w-full" data-testid="backup-panel">
            <BackupPanel compact />
          </div>
        )}
      </div>

      {company?.id && (
        <ActivationRequestDialog
          companyId={company.id}
          open={activationOpen}
          onOpenChange={setActivationOpen}
          onDone={() => void recheck()}
        />
      )}
    </AuthShell>
  );
}
