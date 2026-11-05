import { AlertCircle, Check, Eye, EyeOff, LogOut, MailCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OtpInput } from '@/components/ui/OtpInput';
import { SidePanel } from '@/components/ui/SidePanel';
import { PasswordRequirements } from '@/features/auth/PasswordRequirements';
import { useSignOut } from '@/features/auth/useSignOut';
import { cn } from '@/lib/cn';
import {
  authForgotPassword,
  authResetPassword,
  authVerifyOtp,
} from '@/networks/auth/authNetwork';
import { ApiError } from '@/networks/network/apiHelpers';
import { meetsPasswordPolicy } from '@/utils/password';

type Step = 'request' | 'code' | 'password';

const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'request', label: 'Get code' },
  { key: 'code', label: 'Enter code' },
  { key: 'password', label: 'New password' },
];

const FORM_ID = 'change-password-form';
/** The server allows three code requests per 15 minutes; don't invite a fourth. */
const RESEND_COOLDOWN = 60;

/**
 * Change password without leaving My account: the same emailed-code flow as
 * "Forgot password" (request → verify → reset), in a panel over the page.
 *
 * Finishing it signs the person out: the server revokes every refresh token
 * when a password is reset, so this session could not survive anyway — the
 * panel says so before they commit, rather than surprising them after.
 *
 * Mount it with a fresh `key` each time it opens, so it always starts at
 * step one.
 */
export function ChangePasswordPanel({
  open,
  onOpenChange,
  email,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
}) {
  const { signOut } = useSignOut();
  const [step, setStep] = useState<Step>('request');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const fail = (e: unknown) => {
    const message = e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.';
    // A locked code or an expired reset session is terminal for this attempt:
    // back to the start rather than leaving them typing into a dead step.
    if (e instanceof ApiError && (e.code === 'OTP_LOCKED' || e.code === 'INVALID_TOKEN')) {
      setStep('request');
      setOtp('');
      setResetToken('');
    }
    setError(message);
  };

  const run = async (work: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await work();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      await authForgotPassword(email);
      setOtp('');
      setCooldown(RESEND_COOLDOWN);
      setStep('code');
    });

  const resend = () =>
    run(async () => {
      await authForgotPassword(email);
      setOtp('');
      setCooldown(RESEND_COOLDOWN);
      toast.success('New code sent', { description: `Check ${email}.` });
    });

  const verify = () =>
    run(async () => {
      const { resetToken: token } = await authVerifyOtp(email, otp);
      setResetToken(token);
      setStep('password');
    });

  const policyMet = meetsPasswordPolicy(password);
  const mismatch = confirm.length > 0 && confirm !== password;

  const change = () =>
    run(async () => {
      await authResetPassword({ email, resetToken, password });
      toast.success('Password changed', { description: 'Sign in again with your new password.' });
      onOpenChange(false);
      signOut();
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (step === 'request') void sendCode();
    else if (step === 'code') {
      if (otp.length === 6) void verify();
    } else if (policyMet && confirm === password) void change();
  };

  const primary: Record<Step, { label: string; busyLabel: string; disabled: boolean }> = {
    request: { label: 'Email me a code', busyLabel: 'Sending…', disabled: false },
    code: { label: 'Verify code', busyLabel: 'Checking…', disabled: otp.length !== 6 },
    password: {
      label: 'Change password & sign out',
      busyLabel: 'Saving…',
      disabled: !policyMet || confirm !== password,
    },
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return;
        onOpenChange(next);
      }}
      title="Change password"
      description="Confirm it’s you with a code we email, then choose a new password."
      footer={
        <div className="flex items-center justify-between gap-xs">
          {step === 'code' ? (
            <Button
              variant="text"
              size="sm"
              disabled={busy}
              onClick={() => {
                setStep('request');
                setOtp('');
                setError('');
              }}
            >
              Back
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-xs">
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} size="sm" disabled={busy || primary[step].disabled}>
              {busy ? primary[step].busyLabel : primary[step].label}
            </Button>
          </div>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-lg p-lg">
        <Stepper current={step} />

        {error && (
          <div role="alert" className="flex items-start gap-xs rounded-md bg-danger-lighter p-sm">
            <AlertCircle className="mt-[2px] size-4 shrink-0 text-danger" aria-hidden="true" />
            <span className="text-body-sm text-danger">{error}</span>
          </div>
        )}

        {step === 'request' && (
          <div className="flex flex-col items-center gap-sm rounded-lg bg-primary-50 px-lg py-xl text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-surface text-primary shadow-card">
              <MailCheck className="size-6" aria-hidden="true" />
            </span>
            <p className="text-label-lg text-text-primary">We’ll email you a 6-digit code</p>
            <p className="max-w-[22rem] text-body-sm text-text-secondary">
              It goes to <span className="break-all text-text-primary">{email}</span>. Enter it on
              the next step to confirm it’s you.
            </p>
          </div>
        )}

        {step === 'code' && (
          <div className="flex flex-col gap-md">
            <p className="text-body-sm text-text-secondary">
              Enter the code we sent to <span className="break-all text-text-primary">{email}</span>.
              It expires after a few minutes.
            </p>
            <OtpInput
              label="6-digit code"
              value={otp}
              onChange={setOtp}
              autoFocus
              disabled={busy}
              hint="Five wrong tries lock the code, and you’ll need a new one."
            />
            <p className="text-body-sm text-text-secondary">
              Didn’t get it? Check spam, or{' '}
              {cooldown > 0 ? (
                <span className="text-text-tertiary tabular">
                  resend in 0:{String(cooldown).padStart(2, '0')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void resend()}
                  disabled={busy}
                  className="text-primary underline-offset-2 hover:underline disabled:opacity-60"
                >
                  send a new code
                </button>
              )}
              .
            </p>
          </div>
        )}

        {step === 'password' && (
          <div className="flex flex-col gap-md">
            <Input
              label="New password"
              type={reveal ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              trailing={
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  aria-label={reveal ? 'Hide password' : 'Show password'}
                  aria-pressed={reveal}
                  className="flex size-8 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary"
                >
                  {reveal ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                </button>
              }
            />
            <PasswordRequirements password={password} />
            <Input
              label="Confirm new password"
              type={reveal ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={mismatch ? 'The two passwords don’t match.' : undefined}
            />
            <div className="flex items-start gap-xs rounded-md bg-warning-lighter p-sm">
              <LogOut className="mt-[2px] size-4 shrink-0 text-warning" aria-hidden="true" />
              <p className="text-body-sm text-text-secondary">
                Changing your password signs you out everywhere, including here. You’ll sign in
                again with the new one.
              </p>
            </div>
          </div>
        )}
      </form>
    </SidePanel>
  );
}

function Stepper({ current }: { current: Step }) {
  const index = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="flex items-center gap-xs" aria-label="Progress">
      {STEPS.map((s, i) => {
        const state = i < index ? 'done' : i === index ? 'current' : 'todo';
        return (
          <li key={s.key} className={cn('flex items-center gap-xs', i < STEPS.length - 1 && 'flex-1')}>
            <span
              aria-current={state === 'current' ? 'step' : undefined}
              className="flex items-center gap-xs"
            >
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-label-sm tabular transition-colors',
                  state === 'done' && 'bg-primary text-text-inverse',
                  state === 'current' && 'bg-primary-tint text-primary ring-1 ring-primary',
                  state === 'todo' && 'bg-neutral-100 text-text-tertiary',
                )}
              >
                {state === 'done' ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : i + 1}
              </span>
              <span
                className={cn(
                  'whitespace-nowrap text-label-sm',
                  state === 'todo' ? 'text-text-tertiary' : 'text-text-primary',
                )}
              >
                {s.label}
                {state === 'done' && <span className="sr-only"> (done)</span>}
              </span>
            </span>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={cn('h-px min-w-[12px] flex-1', i < index ? 'bg-primary' : 'bg-border')}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default ChangePasswordPanel;
