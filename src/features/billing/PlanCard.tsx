// ═══════════════════════════════════════════════════════
// FinMatrix Web — Plan card
// ═══════════════════════════════════════════════════════
// ONE card, three surfaces: landing pricing, onboarding's plan step, and
// /account/renew. They show the same prices to the same buyer minutes apart, so a
// second implementation would eventually contradict the first.
//
//   variant="marketing" — a plain container whose one interactive element is a
//                         link to signup. Hover lift, no selected state.
//   variant="select"    — the CARD ITSELF is the control: a radio inside the
//                         grid's radiogroup. It holds no inner button.
//
// ONE INTERACTIVE ELEMENT PER CARD, and the variants differ structurally to keep
// it that way. A clickable card wrapping a button nests two controls: screen
// readers announce a button inside a radio, and the click fires twice.
//
// `tone` describes the GROUND the card sits on, not the card. The body is white on
// every surface; only the highlight changes, because a navy ring and ribbon that
// stand out on white disappear into a navy section.
//
// The highlighted card is lifted with a ring, a top rule and a deeper shadow —
// not `scale-105`, which inside an equal-height grid overhung the 24px gutter by
// ~10px on each side.

import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatTerm, planPerks, type Plan } from '@/models/plan';

export type PlanTone = 'light' | 'dark';

function PlanBody({ plan, selected }: { plan: Plan; selected: boolean }) {
  const perks = planPerks(plan);
  const term = formatTerm(plan.periodMonths);

  return (
    <>
      {selected && (
        <span className="absolute top-lg right-lg flex size-6 items-center justify-center rounded-full bg-primary shadow-md">
          <Check className="size-4 text-text-inverse" aria-hidden="true" />
        </span>
      )}

      <p className="text-overline text-primary">{plan.name}</p>

      {/* The price label is the server's own string — see src/models/plan.ts on
          why it is not re-run through formatMoney. */}
      <p className="mt-md flex items-baseline gap-xxs">
        <span className="text-display-md tabular text-text-primary">
          {plan.monthlyLabel}
        </span>
        <span className="text-body-sm text-text-secondary">/ month</span>
      </p>

      {/* The total is stated plainly rather than softened: a longer term costs
          MORE overall because it buys more months. */}
      <p className="mt-xs text-body-sm text-text-secondary">
        {plan.totalLabel ? (
          <>
            <span className="tabular text-label-md text-text-primary">
              {plan.totalLabel}
            </span>{' '}
            billed once for {term}
          </>
        ) : (
          term
        )}
      </p>

      <div className="my-lg h-px bg-border-light" />

      <ul className="flex flex-1 flex-col gap-sm text-left">
        {perks.map((perk) => (
          <li key={perk} className="flex items-start gap-sm">
            <span className="mt-[2px] flex size-5 shrink-0 items-center justify-center rounded-full bg-success-lighter">
              <Check className="size-3 text-success" aria-hidden="true" />
            </span>
            <span className="text-body-sm text-text-secondary">{perk}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function shellClasses(highlighted: boolean, tone: PlanTone): string {
  const highlight =
    tone === 'dark'
      ? 'border-transparent shadow-xl ring-4 ring-success-bright/40'
      : 'border-primary shadow-lg ring-4 ring-primary/10';
  const rest =
    tone === 'dark' ? 'border-transparent shadow-lg' : 'border-border-light shadow-card';

  return cn(
    'relative flex h-full flex-col rounded-xl border bg-surface p-xl text-left transition-[box-shadow,transform,border-color] duration-300',
    highlighted ? highlight : rest,
  );
}

export function PlanCard({
  plan,
  variant,
  highlighted = false,
  selected = false,
  onSelect,
  ctaLabel,
  busy = false,
  tone = 'light',
}: {
  plan: Plan;
  variant: 'marketing' | 'select';
  highlighted?: boolean;
  selected?: boolean;
  onSelect?: (plan: Plan) => void;
  ctaLabel?: string;
  busy?: boolean;
  tone?: PlanTone;
}) {
  const decoration = highlighted && (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1 rounded-t-xl bg-linear-to-r from-primary via-primary-600 to-accent-teal"
      />
      {/* "Recommended", never "Most popular" — there are no usage figures behind
          a popularity claim. */}
      <span
        className={cn(
          'absolute -top-md left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-md py-xxs text-overline shadow-md',
          tone === 'dark'
            ? 'bg-success-bright text-primary-950'
            : 'bg-primary text-text-inverse',
        )}
      >
        Recommended
      </span>
    </>
  );

  if (variant === 'select') {
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={busy}
        onClick={() => onSelect?.(plan)}
        className={cn(
          shellClasses(highlighted, tone),
          'cursor-pointer disabled:cursor-default',
          selected && 'border-primary ring-2 ring-primary',
        )}
      >
        {decoration}
        <PlanBody plan={plan} selected={selected} />

        {/* A label for the card's state, not a second control. */}
        <span
          aria-hidden="true"
          className={cn(
            'mt-xl flex h-12 w-full items-center justify-center rounded-sm text-label-lg transition-colors',
            selected
              ? 'bg-primary text-text-inverse'
              : 'border border-border bg-surface text-text-primary',
          )}
        >
          {busy ? 'Please wait…' : selected ? 'Selected' : (ctaLabel ?? 'Choose plan')}
        </span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        shellClasses(highlighted, tone),
        'hover:-translate-y-1 hover:shadow-xl motion-reduce:hover:translate-y-0',
      )}
    >
      {decoration}
      <PlanBody plan={plan} selected={false} />

      <div className="mt-xl">
        <Button full variant={highlighted ? 'primary' : 'secondary'} asChild>
          <Link to="/register">{ctaLabel ?? 'Create your account'}</Link>
        </Button>
      </div>
    </div>
  );
}

export default PlanCard;
