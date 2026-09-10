// ═══════════════════════════════════════════════════════
// FinMatrix Web — Sign in (both portals)
// ═══════════════════════════════════════════════════════
// One component, two doors, mirroring the app's SignInScreen: the role resolves
// as `?role=` → stored preference → 'admin', and it switches the identifier
// field, the accent and which secondary links exist.
//
// WHAT THE ROLE DOES NOT DO: influence the request. Both portals post the same
// body to the same endpoint — { identifier, email: identifier, password } — and
// the SERVER decides the account and its role. Nothing the client sends changes
// what it gets back. The role here shapes a form, not an outcome.
//
// THE STAFF PORTAL IS LOGIN-ONLY, and that is the server's contract rather than a
// layout preference: /auth/signup accepts role 'admin' or 'delivery' and REFUSES
// 'staff', and a staff password is reset by the owner through
// POST /settings/users/:id/reset-password. A staff account therefore cannot be
// created, recovered or verified from here — so there is no signup link, no
// forgot-password link, and no email-verification branch on this door. Adding one
// would be offering a door that opens onto nothing.

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthShell } from '@/features/auth/AuthShell';
import { makeLoginSchema, type LoginFormValues } from '@/features/auth/loginSchema';
import { authLogin, AuthError } from '@/networks/auth/authNetwork';
import { setIdentity, setSelectedRole, selectSelectedRole } from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/store';
import type { PortalRole } from '@/utils/storage';

const asPortalRole = (v: string | null): PortalRole | null =>
  v === 'admin' || v === 'staff' ? v : null;

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const storedRole = useAppSelector(selectSelectedRole);

  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Same precedence as the app: an explicit link wins, then what the visitor
  // chose last, then the owner door as the default.
  const role: PortalRole =
    asPortalRole(searchParams.get('role')) ?? storedRole ?? 'admin';
  const isStaff = role === 'staff';

  const schema = useMemo(() => makeLoginSchema(role), [role]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: '', password: '' },
  });

  const redirectTo =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ??
    '/dashboard';

  const switchPortal = (next: PortalRole) => {
    dispatch(setSelectedRole(next));
    navigate(`/login?role=${next}`, { replace: true });
  };

  const onSubmit = async (values: LoginFormValues) => {
    setFormError('');
    try {
      const result = await authLogin(values);
      dispatch(setIdentity(result));

      // A token was issued, but the company may still be gated. Sign-in only
      // blocks `pending` and `rejected`; `draft` and `inactive` come back 200
      // so the client can reach onboarding or renewal.
      if (result.companyStatus && result.companyStatus !== 'active') {
        navigate('/account-status', { replace: true });
        return;
      }

      navigate(redirectTo, { replace: true });
    } catch (e) {
      if (e instanceof AuthError) {
        // The server's code is the only thing worth branching on — the
        // exception filter strips every other field off the error body.
        //
        // EMAIL_NOT_VERIFIED is handled on the owner door only. A staff account
        // has no email to verify, so the server cannot raise it there; routing
        // a staff member to a verification screen would strand them.
        if (!isStaff && e.code === 'EMAIL_NOT_VERIFIED') {
          navigate('/verify-email', {
            replace: true,
            state: { email: e.email ?? values.identifier },
          });
          return;
        }
        if (
          e.code === 'COMPANY_PENDING' ||
          e.code === 'COMPANY_REJECTED' ||
          e.code === 'COMPANY_INACTIVE'
        ) {
          navigate('/account-status', { replace: true, state: { code: e.code } });
          return;
        }
      }
      setFormError(
        e instanceof Error ? e.message : 'Something went wrong. Please try again.',
      );
    }
  };

  return (
    <AuthShell
      accent={isStaff ? 'teal' : 'navy'}
      eyebrow={isStaff ? 'Team member portal' : undefined}
      title="Sign in"
      subtitle={
        isStaff
          ? 'Use the username and password your company gave you.'
          : 'Use the email address for your FinMatrix account.'
      }
      footer={
        isStaff ? (
          <button
            type="button"
            onClick={() => switchPortal('admin')}
            className="text-label-md text-text-secondary hover:text-primary hover:underline"
          >
            Not a team member? Sign in as business owner
          </button>
        ) : (
          <button
            type="button"
            onClick={() => switchPortal('staff')}
            className="text-label-md text-text-secondary hover:text-primary hover:underline"
          >
            Team member? Sign in here
          </button>
        )
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
          label={isStaff ? 'Username' : 'Email'}
          // Never type="email": it would add a second, independent block the
          // form cannot report, on top of the zod rule that already checks this.
          type="text"
          inputMode={isStaff ? 'text' : 'email'}
          autoComplete="username"
          autoFocus
          error={errors.identifier?.message}
          {...register('identifier')}
        />

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
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

        {/* Owner only. There is no staff equivalent to put here: the reset flow
            is an email OTP, and a staff account has no email. */}
        {!isStaff && (
          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="text-label-md text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        )}

        <Button type="submit" full disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {/* Owner only, and prominent: this is the single screen where an owner
          either signs in or starts a business, so neither path is a detour
          through another route. */}
      {!isStaff && (
        <div className="mt-xl border-t border-border-light pt-lg">
          <p className="text-body-sm text-text-secondary">
            New to FinMatrix?
          </p>
          <Button variant="secondary" full className="mt-sm" asChild>
            <Link to="/register">Create a business account →</Link>
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
