import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface SegmentOption<V extends string> {
  value: V;
  label: ReactNode;
  /** Shown to assistive tech and as a title when `label` is an icon. */
  ariaLabel?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<V extends string> {
  /** What the group chooses — "Trial balance mode". Read by screen readers. */
  label: string;
  value: V;
  options: readonly SegmentOption<V>[];
  onChange: (value: V) => void;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Two to four mutually exclusive views of the same thing — Closing | Working |
 * Movement, Direct | Indirect. Buttons with `aria-pressed` in a labelled
 * group: each is a native button, so Tab reaches it and Enter or Space picks
 * it, with no roving-focus script to get wrong.
 *
 * The same look as the chart-type toggle and the aging preset picker.
 */
export function SegmentedControl<V extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  className,
}: SegmentedControlProps<V>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 overflow-hidden rounded-md border border-border bg-surface',
        size === 'sm' ? 'h-8' : 'h-10',
        className,
      )}
    >
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          aria-label={opt.ariaLabel}
          title={opt.ariaLabel}
          disabled={opt.disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            'inline-flex items-center justify-center gap-xxs whitespace-nowrap transition-colors',
            size === 'sm' ? 'px-sm text-label-sm' : 'px-md text-label-md',
            i > 0 && 'border-l border-border',
            value === opt.value
              ? 'bg-primary-tint text-primary'
              : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
            opt.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default SegmentedControl;
