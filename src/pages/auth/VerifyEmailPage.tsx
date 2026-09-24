// ═══════════════════════════════════════════════════════
// FinMatrix Web — Confirm your email (/verify-email)
// ═══════════════════════════════════════════════════════
// Two screens behind one route, chosen by whether the URL carries a token.
//
// WAITING (no token): the owner has just signed up, or signed in unverified.
// Their session is kept — the server refuses it everywhere past /auth — so this
// page can re-read the account every few seconds and move on BY ITSELF the
// moment the link is opened, wherever it is opened: another tab, another
// browser, their phone. It used to be a static page that could only offer
// "Back to sign in", so an owner who had just confirmed their address was made
// to type their password again.
//
// TOKEN (?token=…): this is where the email's button now lands. It confirms the
// address and, when this browser holds that owner's session, carries straight
// on into company setup. Without a session (the link opened on a phone, say) it
// says so plainly: the window that is waiting has already moved on, or sign in
// here. The confirm is a POST from the page, not the GET that opened it, so a
// mail scanner that pre-opens links cannot spend the token.

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthShell } from '@/features/auth/AuthShell';
import { nextStepFor } from '@/features/auth/nextStep';
import { useSignOut } from '@/features/auth/useSignOut';
import {
  authMe,
  authResendVerification,
  authVerifyEmail,
  type MeResponse,
} from '@/networks/auth/authNetwork';
import {
  selectAuthStatus,
  selectCompanyId,
  selectCompanyStatus,
  selectNeedsEmailVerification,
  selectUser,
  setIdentity,
} from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/store';

/** How often the waiting screen re-reads the account while the tab is visible. */
const POLL_MS = 5000;
/** The server allows 3 resends per 15 minutes; this keeps a person well inside that. */
const RESEND_COOLDOWN_S = 60;

/** The server's own rule (JwtStrategy): only an owner with an address can be unverified. */
const isConfirmed = (me: MeResponse): boolean =>
  !(me.user.role === 'admin' && !!me.user.email && me.user.isEmailVerified === false);

/** Phones are where the Android app lives, so only they are offered it. */
const onPhone = (): boolean =>
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** The app's own verify screen, told only that the address is confirmed — never a token. */
const APP_LINK = 'finmatrix://verify-email?verified=1';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  return token ? <ConfirmFromLink token={token} /> : <WaitForConfirmation />;
}

// ─── Waiting ────────────────────────────────────────────────────────────────

function WaitForConfirmation() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const { signOut, signOutTo } = useSignOut();

  const signedIn = useAppSelector(selectAuthStatus) === 'authenticated';
  const needsVerification = useAppSelector(selectNeedsEmailVerification);
  const user = useAppSelector(selectUser);
  const companyId = useAppSelector(selectCompanyId);
  const companyStatus = useAppSelector(selectCompanyStatus);

  const passedEmail = (location.state as { email?: string } | null)?.email ?? '';
  const [email, setEmail] = useState(passedEmail);
  const address = signedIn ? (user?.email ?? passedEmail) : email;

  const [notice, setNotice] = useState('');
  const [resendError, setResendError] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Re-read the account on a timer and whenever the tab comes back into view.
  // TanStack pauses the timer while the tab is hidden, and refetches on focus
  // — which is exactly when an owner returns from their inbox.
  const check = useQuery({
    queryKey: ['auth', 'email-verification'],
    queryFn: authMe,
    enabled: signedIn && needsVerification,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: 'always',
    retry: false,
    gcTime: 0,
  });

  // Confirmed elsewhere: store the fresh identity and say so. The redirect
  // below then carries them on, because the guard state has changed.
  const announced = useRef(false);
  useEffect(() => {
    const me = check.data;
    if (!me || !isConfirmed(me) || announced.current) return;
    announced.current = true;
    dispatch(setIdentity(me));
    toast.success('Email confirmed. Let’s set up your company.');
  }, [check.data, dispatch]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (signedIn && !needsVerification) {
    return <Navigate to={nextStepFor({ companyId, companyStatus })} replace />;
  }

  const continueNow = async () => {
    setNotice('');
    const result = await check.refetch();
    if (result.data && !isConfirmed(result.data)) {
      setNotice(
        'We have not seen the confirmation yet. Open the link in the email, then come back — this page moves on by itself.',
      );
    }
  };

  const resend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!address || cooldown > 0) return;
    setResendError('');
    setSending(true);
    try {
      await authResendVerification(address);
      setCooldown(RESEND_COOLDOWN_S);
      toast.success(`A new link is on its way to ${address}.`);
    } catch (err) {
      setResendError(
        (err as { status?: number } | null)?.status === 429
          ? 'You have asked for several emails in the last few minutes. Wait a little, then try again — the last one we sent still works.'
          : err instanceof Error
            ? err.message
            : 'Could not send the email.',
      );
    } finally {
      setSending(false);
    }
  };

  // No session: arrived from a sign-in an older server refused, or after
  // signing out. Nothing to watch with, so resend and sign in are what is left.
  if (!signedIn) {
    return (
      <AuthShell
        title="Confirm your email"
        subtitle="Open the link we emailed you, then sign in to continue."
        footer={
          <Link to="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-md text-center">
          <MailCheck className="size-10 text-primary" aria-hidden="true" />
          <p className="text-body-md text-text-secondary">
            Didn&rsquo;t get it? Check your spam folder, or send it again.
          </p>
        </div>
        <form onSubmit={resend} className="mt-lg flex flex-col gap-md">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={resendError}
            required
          />
          <Button type="submit" full disabled={sending || !email || cooldown > 0}>
            {sending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend confirmation email'}
          </Button>
          <Button variant="secondary" full asChild>
            <Link to={`/login?verified=1${email ? `&email=${encodeURIComponent(email)}` : ''}`}>
              I&rsquo;ve confirmed — sign in
            </Link>
          </Button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Check your email"
      subtitle={
        <>
          We sent a confirmation link to{' '}
          <span className="text-label-md text-text-primary">{address}</span>.
        </>
      }
      footer={
        <button
          type="button"
          onClick={signOut}
          className="text-label-md text-text-secondary hover:text-primary hover:underline"
        >
          Sign out
        </button>
      }
    >
      <div className="flex flex-col items-center gap-md text-center">
        <MailCheck className="size-10 text-primary" aria-hidden="true" />
        <p className="text-body-md text-text-secondary">
          Open the link on this computer or on your phone. This page moves on by
          itself as soon as your address is confirmed.
        </p>
        <p
          className="inline-flex items-center gap-xs text-caption text-text-tertiary"
          aria-live="polite"
        >
          <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Waiting for confirmation
        </p>
      </div>

      {notice && (
        <div
          role="status"
          className="mt-lg flex items-start gap-xs rounded-md bg-primary-tint p-sm text-left"
        >
          <AlertCircle className="mt-[2px] size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="text-body-sm text-text-primary">{notice}</span>
        </div>
      )}

      <div className="mt-lg flex flex-col gap-xs">
        <Button full onClick={continueNow} disabled={check.isFetching}>
          {check.isFetching ? 'Checking…' : 'I’ve confirmed — continue'}
        </Button>
        <Button
          variant="secondary"
          full
          onClick={() => void resend()}
          disabled={sending || cooldown > 0}
        >
          {sending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
        </Button>
        {resendError && (
          <p role="alert" className="text-body-sm text-danger">
            {resendError}
          </p>
        )}
      </div>

      <p className="mt-lg text-center text-body-sm text-text-secondary">
        Wrong address?{' '}
        <button
          type="button"
          onClick={() => signOutTo('/register')}
          className="text-primary hover:underline"
        >
          Start again with a different email
        </button>
      </p>
    </AuthShell>
  );
}

// ─── From the email link ────────────────────────────────────────────────────

type LinkState =
  | { kind: 'confirming' }
  | { kind: 'confirmed'; email: string | null; already: boolean }
  // Too many attempts from this network. The link itself is fine, and saying
  // "expired" would send the owner off to request a new one for nothing.
  | { kind: 'busy' }
  | { kind: 'failed'; message: string };

function ConfirmFromLink({ token }: { token: string }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const signedIn = useAppSelector(selectAuthStatus) === 'authenticated';
  const [state, setState] = useState<LinkState>({ kind: 'confirming' });

  // Once. React's dev double-mount would otherwise send the token twice — the
  // second answer would be "already confirmed", which is true but noisy.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      let confirmedEmail: string | null = null;
      let already = false;
      try {
        const result = await authVerifyEmail(token);
        confirmedEmail = result.email;
        already = result.alreadyVerified;
      } catch (e) {
        if ((e as { status?: number } | null)?.status === 429) {
          setState({ kind: 'busy' });
          return;
        }
        setState({
          kind: 'failed',
          message: e instanceof Error ? e.message : 'This link could not be used.',
        });
        return;
      }

      // Signed in here as the owner who was just confirmed (they registered in
      // this browser): carry straight on. Another account's session is left
      // alone — the confirmation belongs to someone else.
      if (signedIn) {
        try {
          const me = await authMe();
          const sameOwner =
            !confirmedEmail ||
            me.user.email?.toLowerCase() === confirmedEmail.toLowerCase();
          if (sameOwner && isConfirmed(me)) {
            dispatch(setIdentity(me));
            toast.success('Email confirmed. Let’s set up your company.');
            navigate(nextStepFor(me), { replace: true });
            return;
          }
        } catch {
          /* fall through to the signed-out card */
        }
      }
      setState({ kind: 'confirmed', email: confirmedEmail, already });
    })();
  }, [dispatch, navigate, signedIn, token]);

  if (state.kind === 'confirming') {
    return (
      <AuthShell title="Confirming your email" subtitle="One moment…">
        <div className="flex justify-center py-lg" aria-busy="true">
          <Loader2
            className="size-8 animate-spin text-primary motion-reduce:animate-none"
            aria-hidden="true"
          />
        </div>
      </AuthShell>
    );
  }

  if (state.kind === 'busy') {
    return (
      <AuthShell
        title="Please wait a moment"
        subtitle="There have been too many attempts from this network in the last few minutes."
      >
        <div className="flex flex-col items-center gap-md text-center">
          <AlertCircle className="size-10 text-warning" aria-hidden="true" />
          <p className="text-body-md text-text-secondary">
            Your link is still good. Wait a few minutes, then try again.
          </p>
        </div>
        <div className="mt-lg flex flex-col gap-xs">
          <Button full onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (state.kind === 'failed') {
    return (
      <AuthShell
        title="This link has expired"
        subtitle="Confirmation links last 24 hours and only the newest one works."
        footer={
          <Link to="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-md text-center">
          <AlertCircle className="size-10 text-warning" aria-hidden="true" />
          <p className="text-body-md text-text-secondary">{state.message}</p>
          <p className="text-body-sm text-text-secondary">
            Sign in and we&rsquo;ll take you to a screen where you can send a fresh link.
          </p>
        </div>
        <div className="mt-lg flex flex-col gap-xs">
          <Button full asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  const signInHref = `/login?verified=1${
    state.email ? `&email=${encodeURIComponent(state.email)}` : ''
  }`;

  return (
    <AuthShell
      title="Email confirmed"
      subtitle={state.already ? 'This address was already confirmed.' : 'Thanks — your address is confirmed.'}
    >
      <div className="flex flex-col items-center gap-md text-center">
        <CheckCircle2 className="size-10 text-success" aria-hidden="true" />
        <p className="text-body-md text-text-secondary">
          If FinMatrix is open in another window or on your phone, it has already
          moved on to setting up your company. Or continue here.
        </p>
      </div>
      <div className="mt-lg flex flex-col gap-xs">
        <Button full asChild>
          <Link to={signInHref}>Sign in to continue</Link>
        </Button>
        {onPhone() && (
          <Button variant="secondary" full asChild>
            <a href={APP_LINK}>Open the FinMatrix app</a>
          </Button>
        )}
      </div>
    </AuthShell>
  );
}
