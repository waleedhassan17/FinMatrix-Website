import { AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthShell } from '@/features/auth/AuthShell';
import { useSignOut } from '@/features/auth/useSignOut';
import {
  authForgotPassword,
  authResetPassword,
  authVerifyOtp,
} from '@/networks/auth/authNetwork';
import { ApiError } from '@/networks/network/apiHelpers';
import { selectIsAuthenticated } from '@/store/authSlice';
import { useAppSelector } from '@/store/store';

/**
 * All three reset steps in one screen, as the app does it: request an OTP,
 * exchange it for a reset token, set the password. Keeping them together means
 * the email typed in step 1 is still on screen in step 2, which is what makes
 * "wrong address" recoverable without starting over.
 *
 * The OTP allows five attempts before the server locks it (OTP_LOCKED), and
 * requesting one is throttled to 3 per 15 minutes.
 */
type Step = 'email' | 'otp' | 'password';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Opened from My account while signed in: the address is already known, and
  // finishing the reset has to end this session rather than bounce off /login.
  const signedIn = useAppSelector(selectIsAuthenticated);
  const { signOut } = useSignOut();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(() => params.get('email')?.trim() ?? '');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown) => {
    const message =
      e instanceof Error ? e.message : 'Something went wrong. Please try again.';
    // A locked OTP is terminal for this attempt — send them back to step 1
    // rather than leaving them typing into a field the server has stopped
    // reading.
    if (e instanceof ApiError && e.code === 'OTP_LOCKED') {
      setStep('email');
      setOtp('');
    }
    setError(message);
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await authForgotPassword(email);
      setStep('otp');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { resetToken: token } = await authVerifyOtp(email, otp);
      setResetToken(token);
      setStep('password');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await authResetPassword({ email, resetToken, password });
      toast.success('Password changed. Sign in with your new password.');
      // Signed in, /login would redirect straight back into the app on the old
      // session. Signing out clears it and lands on /login itself.
      if (signedIn) signOut();
      else navigate('/login', { replace: true });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const COPY: Record<Step, { title: string; subtitle: string }> = {
    email: {
      title: 'Reset your password',
      subtitle: 'We will send a 6-digit code to your email.',
    },
    otp: {
      title: 'Enter the code',
      subtitle: `We sent a 6-digit code to ${email}. It expires shortly.`,
    },
    password: {
      title: 'Set a new password',
      subtitle: 'At least 8 characters, with an uppercase letter and a number.',
    },
  };

  return (
    <AuthShell
      title={COPY[step].title}
      subtitle={COPY[step].subtitle}
      footer={
        <Link to={signedIn ? '/account' : '/login'} className="text-primary hover:underline">
          {signedIn ? 'Back to my account' : 'Back to sign in'}
        </Link>
      }
    >
      {error && (
        <div
          role="alert"
          className="mb-md flex items-start gap-xs rounded-md bg-danger-lighter p-sm"
        >
          <AlertCircle className="mt-[2px] size-4 shrink-0 text-danger" />
          <span className="text-body-sm text-danger">{error}</span>
        </div>
      )}

      {step === 'email' && (
        <form onSubmit={submitEmail} className="flex flex-col gap-md">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" full disabled={busy}>
            {busy ? 'Sending…' : 'Send code'}
          </Button>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={submitOtp} className="flex flex-col gap-md">
          <Input
            label="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            hint="Five attempts before the code locks."
            required
          />
          <Button type="submit" full disabled={busy || otp.length !== 6}>
            {busy ? 'Checking…' : 'Verify code'}
          </Button>
          <Button
            variant="text"
            full
            disabled={busy}
            onClick={() => {
              setStep('email');
              setOtp('');
              setError('');
            }}
          >
            Use a different email
          </Button>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={submitPassword} className="flex flex-col gap-md">
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          <Button type="submit" full disabled={busy}>
            {busy ? 'Saving…' : 'Change password'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
