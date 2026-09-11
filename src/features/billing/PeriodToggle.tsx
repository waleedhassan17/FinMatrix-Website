// ═══════════════════════════════════════════════════════
// FinMatrix Web — Billing period toggle
// ═══════════════════════════════════════════════════════
// The live catalogue sells every tier on two terms (6 months and 1 year), so
// without this the grid would render each tier twice under near-identical names.
// One card per tier, and this chooses which term's price it shows.
//
// A segmented control with a sliding indicator. The segments are equal-width grid
// columns, which is what lets the indicator move by exactly `index × 100%` of its
// own width with no measuring — a measured indicator would need a ResizeObserver
// and would jump on first paint.
//
// THE BADGE SAYS "PER MONTH", AND IT HAS TO. The longer term is cheaper per month
// but costs MORE in total, because it buys more months: Starter is Rs 18,000 for 6
// months and Rs 27,000 for a year. A bare "Save 25%" beside the larger total is a
// claim any buyer can disprove by subtracting. The saving itself is computed from
// the plans (savingsPercent), never typed.

import { cn } from '@/lib/cn';
import { formatTerm } from '@/models/plan';

export function PeriodToggle({
  terms,
  value,
  onChange,
  savings,
  tone = 'light',
}: {
  terms: readonly number[];
  value: number;
  onChange: (months: number) => void;
  /** Percent saved, by term. Only the longer term has one. */
  savings?: Record<number, number | null>;
  tone?: 'light' | 'dark';
}) {
  if (terms.length < 2) return null;

  const dark = tone === 'dark';
  const index = Math.max(0, terms.indexOf(value));

  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className={cn(
        'relative grid rounded-xl border p-xxs',
        dark ? 'border-white/15 bg-white/5' : 'border-border bg-surface shadow-card',
      )}
      style={{ gridTemplateColumns: `repeat(${terms.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-xxs bottom-xxs left-xxs rounded-lg shadow-md',
          'transition-transform duration-300 ease-out motion-reduce:transition-none',
          dark ? 'bg-surface' : 'bg-primary',
        )}
        style={{
          width: `calc((100% - 8px) / ${terms.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />

      {terms.map((months) => {
        const active = months === value;
        const saved = savings?.[months] ?? null;

        return (
          <button
            key={months}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(months)}
            className={cn(
              'relative z-10 flex items-center justify-center gap-xs rounded-lg px-lg py-sm text-label-md whitespace-nowrap transition-colors',
              active && (dark ? 'text-primary-900' : 'text-text-inverse'),
              !active &&
                (dark
                  ? 'text-white/75 hover:text-text-inverse'
                  : 'text-text-secondary hover:text-primary'),
            )}
          >
            {formatTerm(months)}
            {saved !== null && saved > 0 && (
              <span
                className={cn(
                  'rounded-full px-xs py-[1px] text-label-sm',
                  active && !dark && 'bg-surface/20 text-text-inverse',
                  // success-hover on success-light is 4.3:1 — under the 4.5:1
                  // small text needs. The lighter tint clears it (4.7:1).
                  active && dark && 'bg-success-lighter text-success-hover',
                  !active && !dark && 'bg-success-lighter text-success-hover',
                  !active && dark && 'bg-success-bright/15 text-success-bright',
                )}
              >
                {saved}% less / mo
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default PeriodToggle;
