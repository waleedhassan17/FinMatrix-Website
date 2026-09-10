// ═══════════════════════════════════════════════════════
// FinMatrix Web — Plan grid
// ═══════════════════════════════════════════════════════
// Turns the flat plan list into the thing a buyer can actually read: one card per
// tier, with a term toggle choosing the price. The live catalogue is three tiers
// × two terms, so rendering it flat would show six cards, each tier twice.
//
// Loading and error are first-class. The landing page's pricing section is fed by
// a network call a visitor did not ask for, so it has to degrade into something
// other than a hole in the page — and never into a hardcoded price.
//
// `tone` describes the ground it sits on: 'dark' on the landing page's navy
// pricing band, 'light' in onboarding and renewal.

import { AlertCircle } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { PeriodToggle } from '@/features/billing/PeriodToggle';
import { PlanCard, type PlanTone } from '@/features/billing/PlanCard';
import { cn } from '@/lib/cn';
import {
  groupPlansByTier,
  planForTerm,
  planTerms,
  savingsPercent,
  type Plan,
} from '@/models/plan';

function PlanSkeleton({ dark }: { dark: boolean }) {
  const bar = cn('animate-pulse rounded-xs', dark ? 'bg-white/10' : 'bg-neutral-100');

  return (
    <div
      className={cn(
        'flex h-full min-h-[440px] flex-col rounded-xl border p-xl',
        dark ? 'border-white/10 bg-white/5' : 'border-border-light bg-surface shadow-card',
      )}
    >
      <div className={cn(bar, 'h-3 w-24')} />
      <div className={cn(bar, 'mt-md h-9 w-36')} />
      <div className={cn(bar, 'mt-xs h-3 w-44')} />
      <div className={cn('my-lg h-px', dark ? 'bg-white/10' : 'bg-border-light')} />
      <div className="flex flex-1 flex-col gap-sm">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={cn(bar, 'h-3 w-full')} />
        ))}
      </div>
      <div className={cn(bar, 'mt-xl h-12 w-full rounded-sm')} />
    </div>
  );
}

export function PlanGrid({
  plans,
  variant,
  isLoading = false,
  error,
  onRetry,
  selectedPlanId,
  onSelect,
  ctaLabel,
  busyPlanId,
  tone = 'light',
}: {
  plans: readonly Plan[];
  variant: 'marketing' | 'select';
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  selectedPlanId?: string | null;
  onSelect?: (plan: Plan) => void;
  ctaLabel?: string;
  busyPlanId?: string | null;
  tone?: PlanTone;
}) {
  const dark = tone === 'dark';
  const tiers = useMemo(() => groupPlansByTier(plans), [plans]);
  const terms = useMemo(() => planTerms(plans), [plans]);

  // Default to the longest term: it is the cheapest per month in every live tier,
  // so it is the honest number to lead with rather than the highest one.
  const [term, setTerm] = useState<number | null>(null);
  const activeTerm = term ?? terms[terms.length - 1] ?? 0;

  // Percent saved per term, measured against the shortest one. Computed from the
  // catalogue so the badge cannot outlive a price change.
  const savings = useMemo(() => {
    const shortest = terms[0];
    const out: Record<number, number | null> = {};
    if (shortest === undefined) return out;

    for (const months of terms) {
      if (months === shortest) {
        out[months] = null;
        continue;
      }
      const found = tiers
        .map((tier) => {
          const base = planForTerm(tier, shortest);
          const longer = planForTerm(tier, months);
          return base && longer ? savingsPercent(base, longer) : null;
        })
        .find((v) => v !== null && v > 0);
      out[months] = found ?? null;
    }
    return out;
  }, [terms, tiers]);

  if (isLoading) {
    return (
      <div className="grid gap-xl pt-md md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <PlanSkeleton key={i} dark={dark} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          'mx-auto flex max-w-[440px] flex-col items-center gap-md rounded-xl border p-xxl text-center',
          dark ? 'border-white/10 bg-white/5' : 'border-border-light bg-surface shadow-card',
        )}
      >
        <AlertCircle
          className={cn('size-6', dark ? 'text-danger-light' : 'text-danger')}
          aria-hidden="true"
        />
        <p className={cn('text-h4', dark ? 'text-text-inverse' : 'text-text-primary')}>
          Plans could not be loaded
        </p>
        <p className={cn('text-body-sm', dark ? 'text-white/70' : 'text-text-secondary')}>
          {error}
        </p>
        {onRetry && (
          <Button type="button" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  if (tiers.length === 0) {
    return (
      <p
        className={cn(
          'text-center text-body-md',
          dark ? 'text-white/70' : 'text-text-secondary',
        )}
      >
        No plans are published right now. Please check back shortly.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-xxl">
      {terms.length > 1 && (
        <PeriodToggle
          terms={terms}
          value={activeTerm}
          onChange={setTerm}
          savings={savings}
          tone={tone}
        />
      )}

      <div
        {...(variant === 'select'
          ? { role: 'radiogroup', 'aria-label': 'Subscription plan' }
          : {})}
        // Top padding leaves room for the "Recommended" ribbon, which sits above
        // its card's edge.
        className="grid w-full items-stretch gap-xl pt-md md:grid-cols-2 lg:grid-cols-3"
      >
        {tiers.map((tier) => {
          const plan = planForTerm(tier, activeTerm);
          if (!plan) return null;

          return (
            <PlanCard
              key={tier.rung}
              plan={plan}
              variant={variant}
              tone={tone}
              highlighted={tier.highlighted}
              selected={selectedPlanId === plan.id}
              onSelect={onSelect}
              ctaLabel={ctaLabel}
              busy={busyPlanId === plan.id}
            />
          );
        })}
      </div>
    </div>
  );
}

export default PlanGrid;
