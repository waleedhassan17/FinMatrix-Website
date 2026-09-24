// ═══════════════════════════════════════════════════════
// FinMatrix Web — Create a business account (/register)
// ═══════════════════════════════════════════════════════
// Owners only. There is no role picker here and no staff path: /auth/signup takes
// role 'admin' or 'delivery' and refuses 'staff', so the only account that can
// create itself is the owner of a new company.
//
// THE PASSWORD RULE MIRRORS THE SERVER'S, field for field — min 8, and at least
// one lowercase, one uppercase and one digit. It is stated up front rather than
// discovered through a round-trip: the server returns all four complaints at once
// in a single string, which makes for a miserable error message.

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Check, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthShell } from '@/features/auth/AuthShell';
import { authRegister } from '@/networks/auth/authNetwork';
import { setIdentity } from '@/store/authSlice';
import { useAppDispatch } from '@/store/store';

/** Exactly the server's rule. Kept beside the hint the form shows. */
const PASSWORD_RULES = [
  { test: (v: string) => v.length >= 8, label: 'At least 8 characters' },
  { test: (v: string) => /[a-z]/.test(v), label: 'A lowercase letter' },
  { test: (v: string) => /[A-Z]/.test(v), label: 'An uppercase letter' },
  { test: (v: string) => /\d/.test(v), label: 'A number' },
];

const schema = z
  .object({
    displayName: z.string().trim().min(2, 'Enter your name (2 characters or more).'),
    email: z.string().trim().pipe(z.email('Enter a valid email address.')),
    phone: z.string().trim(),
    password: z
      .string()
      .min(8, 'Use at least 8 characters.')
      .regex(/[a-z]/, 'Include a lowercase letter.')
      .regex(/[A-Z]/, 'Include an uppercase letter.')
      .regex(/\d/, 'Include a number.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Both passwords must match.',
    path: ['confirm'],
  });

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: '',
      email: '',
      phone: '',
      password: '',
      confirm: '',
    },
  });

  const password = watch('password');

  const onSubmit = async (values: FormValues) => {
    setFormError('');
    try {
      const identity = await authRegister({
        email: values.email,
        password: values.password,
        displayName: values.displayName,
        phone: values.phone,
      });

      // The session signup returns is kept, so the verify screen can watch for
      // the link being opened and carry the owner straight on to company setup
      // — without it they verified and were sent back here to sign in again.
      if (identity) dispatch(setIdentity(identity));
      navigate('/verify-email', {
        replace: true,
        state: { email: values.email.trim() },
      });
    } catch (e) {
      setFormError(
        e instanceof Error ? e.message : 'Something went wrong. Please try again.',
      );
    }
  };

  return (
    <AuthShell
      title="Create a business account"
      subtitle="You will be the owner of this company, with full access."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login?role=admin" className="text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-md">
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-xs rounded-md bg-danger-lighter p-sm"
          >
            <AlertCircle className="mt-[2px] size-4 shrink-0 text-danger" />
            <span className="text-body-sm text-danger">{formError}</span>
          </div>
        )}

        <Input
          label="Your name"
          autoComplete="name"
          autoFocus
          error={errors.displayName?.message}
          {...register('displayName')}
        />

        <Input
          label="Email"
          type="text"
          inputMode="email"
          autoComplete="email"
          hint="We send a confirmation link here."
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Phone (optional)"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          error={errors.phone?.message}
          {...register('phone')}
        />

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          error={errors.password?.message}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="p-xxs text-text-tertiary hover:text-text-secondary"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          }
          {...register('password')}
        />

        {/* Live, and listed rather than summarised — the server checks all four
            and reports them in one run-on sentence. */}
        <ul className="flex flex-col gap-xxs">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(password ?? '');
            return (
              <li key={rule.label} className="flex items-center gap-xs">
                <Check
                  className={met ? 'size-4 text-success' : 'size-4 text-text-disabled'}
                  aria-hidden="true"
                />
                <span
                  className={
                    met
                      ? 'text-caption text-text-secondary'
                      : 'text-caption text-text-tertiary'
                  }
                >
                  {rule.label}
                </span>
              </li>
            );
          })}
        </ul>

        <Input
          label="Confirm password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />

        <Button type="submit" full disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>

        {/* Said before signup, not after: every company is reviewed by a
            person before it goes live, and an owner who learns that only at
            the end feels misled. */}
        <p className="text-caption text-text-secondary">
          Next: confirm your email and tell us about your business. Our team
          reviews every new company before it goes live, and we email you the
          moment yours is approved.
        </p>
      </form>
    </AuthShell>
  );
}
