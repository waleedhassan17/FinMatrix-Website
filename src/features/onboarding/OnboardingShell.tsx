// ═══════════════════════════════════════════════════════
// FinMatrix Web — Onboarding & billing frame
// ═══════════════════════════════════════════════════════
// A dark navy header carrying the wordmark, the step rail and the page title,
// with the content lifted up to overlap its lower edge. The same visual language
// as the landing hero and the auth brand panel, so signup → company → plan → pay
// reads as one continuous product rather than a set of forms.
//
// Used by the three onboarding steps (with `step`) and by /account/renew
// (without it, with `back`). Renders no sidebar on purpose: the company is still
// a draft, or has lapsed, so every link in AppLayout would point at a screen whose
// requests 403.

import { ArrowLeft, BarChart3, Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/cn';

// BILLING-DISABLED BUILD: onboarding is one step. A three-dot rail reading
// "Company → Plan → Payment" would promise two steps that no longer exist.
//
// The `step` prop below deliberately keeps its `1 | 2 | 3` type: PlanSelectPage
// and PaySubscriptionPage still pass 2 and 3, and both are still type-checked
// (tsconfig.app.json includes all of src/) even though nothing routes to them.
export const ONBOARDING_STEPS = ['Company'] as const;
// export const ONBOARDING_STEPS = ['Company', 'Plan', 'Payment'] as const;

export function OnboardingShell({
  step,
  title,
  subtitle,
  back,
  children,
}: {
  /** 1-based. Omit on screens that are not part of the signup sequence. */
  step?: 1 | 2 | 3;
  title: string;
  subtitle?: ReactNode;
  back?: { to: string; label: string };
  children: ReactNode;
}) {
  const current = step ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="relative isolate overflow-hidden surface-mesh-navy text-text-inverse">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 pattern-grid-dark fade-mask-radial"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 texture-grain opacity-[0.06]"
        />

        <div className="mx-auto max-w-[1040px] px-lg">
          <div className="flex h-[72px] items-center justify-between gap-md">
            <div className="flex items-center gap-sm">
              <span className="flex size-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/20">
                <BarChart3 className="size-5 text-text-inverse" aria-hidden="true" />
              </span>
              <span className="text-h3 text-text-inverse">FinMatrix</span>
            </div>
            {step && (
              <p className="text-label-sm text-white/60">
                Step {step} of {ONBOARDING_STEPS.length}
              </p>
            )}
          </div>

          {step && (
            <ol aria-label="Setup progress" className="mt-md flex flex-wrap items-center gap-xs">
              {ONBOARDING_STEPS.map((label, i) => {
                const n = i + 1;
                const done = n < current;
                const isCurrent = n === current;

                return (
                  <li key={label} className="flex items-center gap-xs">
                    <span
                      aria-current={isCurrent ? 'step' : undefined}
                      className={cn(
                        'flex items-center gap-xs rounded-full border py-xxs pr-sm pl-xxs text-label-sm',
                        isCurrent && 'border-transparent bg-surface text-primary-900',
                        done && 'border-success-bright/30 bg-success-bright/10 text-success-bright',
                        !done && !isCurrent && 'border-white/10 bg-white/5 text-white/60',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-5 items-center justify-center rounded-full text-caption',
                          isCurrent && 'bg-primary text-text-inverse',
                          done && 'bg-success-bright text-primary-950',
                          !done && !isCurrent && 'bg-white/10 text-white/70',
                        )}
                      >
                        {done ? <Check className="size-3" aria-hidden="true" /> : n}
                      </span>
                      {label}
                    </span>
                    {n < ONBOARDING_STEPS.length && (
                      <span aria-hidden="true" className="h-px w-5 bg-white/20" />
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {back && (
            <Link
              to={back.to}
              className="mt-lg inline-flex items-center gap-xxs rounded-sm text-label-md text-white/70 transition-colors hover:text-text-inverse"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {back.label}
            </Link>
          )}

          <h1 className="mt-xl max-w-[760px] text-display-sm text-text-inverse sm:text-display-md">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-sm max-w-[680px] text-body-lg text-white/75">{subtitle}</p>
          )}

          {/* Room for the content to lift into. */}
          <div aria-hidden="true" className="h-[96px]" />
        </div>
      </header>

      <main className="relative mx-auto -mt-[64px] max-w-[1040px] px-lg pb-section">
        {children}
      </main>
    </div>
  );
}

export default OnboardingShell;
