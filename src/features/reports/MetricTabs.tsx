import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface MetricTab<K extends string = string> {
  key: K;
  label: string;
  /** The figure, formatted. */
  value: string;
  /** One line under it — the change against the window before. */
  caption?: ReactNode;
  tone?: 'default' | 'danger';
}

/**
 * Headline figures that are also the chart's tabs.
 *
 * The explorer used to show the same four figures twice: once as a strip of
 * figures and again as pills to pick what the chart draws. Here they are one
 * control — choose a figure, and the chart below draws it month by month —
 * which is how a reader already expects a dashboard to behave. The chosen one
 * carries a top rule in the brand colour; the rest read as plain figures.
 *
 * `selected` may name none of them (a metric chosen from "More metrics"), in
 * which case every figure reads as unselected.
 */
export function MetricTabs<K extends string>({
  items,
  selected,
  onSelect,
  label = 'Chart',
  className,
}: {
  items: readonly MetricTab<K>[];
  selected: K | null;
  onSelect: (key: K) => void;
  /** What the tabs control, for assistive tech. */
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('grid grid-cols-2 gap-px bg-border-light lg:grid-cols-4', className)}
    >
      {items.map((it) => {
        const on = it.key === selected;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(it.key)}
            className={cn(
              'relative min-w-0 bg-surface px-lg py-md text-left transition-colors',
              on ? 'bg-surface' : 'hover:bg-surface-2',
            )}
          >
            {/* The rule marks the chosen figure without colouring the number. */}
            <span
              aria-hidden="true"
              className={cn('absolute inset-x-0 top-0 h-[3px]', on ? 'bg-primary' : 'bg-transparent')}
            />
            <span className={cn('block truncate text-label-md', on ? 'text-primary' : 'text-text-secondary')}>
              {it.label}
            </span>
            <span
              className={cn(
                'mt-xxs block truncate text-h3 tabular',
                it.tone === 'danger' ? 'text-danger' : 'text-text-primary',
              )}
            >
              {it.value}
            </span>
            {it.caption !== undefined && (
              <span className="mt-xxs line-clamp-2 text-caption text-text-tertiary">{it.caption}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default MetricTabs;
