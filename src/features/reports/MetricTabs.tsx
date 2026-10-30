import type { ReactNode } from 'react';

import { Change } from '@/features/reports/FigureStrip';
import { Sparkline } from '@/features/reports/Sparkline';
import { cn } from '@/lib/cn';
import { colors } from '@/theme/tokens';

export interface MetricTab<K extends string = string> {
  key: K;
  label: string;
  /** The figure, formatted. */
  value: string;
  /**
   * Its move against the window before — "+12.4%" — and whether that is good
   * news. The comparison itself is named once, beside the window, not here.
   */
  change?: { text: string; tone: 'good' | 'bad' | null } | null;
  /** One line under it, when there is no change to show — "No sales in this window". */
  caption?: ReactNode;
  /** The figure month by month, oldest first: its shape, under the figure. */
  trend?: readonly (number | null)[];
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
 * Every tile has the same parts in the same places — figure, change, shape —
 * so a row of four reads evenly whether or not there is a change to show.
 * The shapes are drawn grey except the chosen figure's, so the colour points
 * at what the chart below is drawing.
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
              'relative flex min-w-0 flex-col bg-surface px-lg pt-md pb-sm text-left transition-colors',
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
            {/* Always a line, so the shapes below line up across the row. */}
            <span className="mt-xxs line-clamp-2 min-h-[1lh] text-caption text-text-tertiary">
              {it.change ? (
                it.change.tone ? (
                  <Change text={it.change.text} good={it.change.tone === 'good'} />
                ) : (
                  <span className="tabular text-text-secondary">{it.change.text}</span>
                )
              ) : (
                (it.caption ?? ' ')
              )}
            </span>
            {it.trend && (
              <span className="mt-auto block pt-xs">
                <Sparkline
                  decorative
                  values={it.trend}
                  label={`${it.label} by month`}
                  color={on ? colors.primary : colors.neutral400}
                  className="h-7"
                />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default MetricTabs;
