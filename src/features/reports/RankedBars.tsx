import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/cn';
import { colors } from '@/theme/tokens';

export interface RankedPoint {
  key: string;
  label: string;
  value: number;
  /** Shown under the label — units, margin, whatever qualifies the bar. */
  hint?: string;
}

export interface RankedBarsProps {
  points: RankedPoint[];
  /** How many bars before the tail folds into one "Other". */
  limit?: number;
  format: (value: number) => string;
  emptyLabel?: string;
  /**
   * Where a bar leads — the row becomes a link. The folded "Other" row never
   * does: it is not one thing to open.
   */
  hrefFor?: (key: string) => string | null;
  /** Or what clicking a bar does — the row becomes a button. */
  onSelect?: (key: string) => void;
  /** A bar to mark as chosen (a filter it applies, say). */
  activeKey?: string | null;
  /**
   * Scale bars on magnitude from zero (the default), or not at all — a share
   * list of percentages reads its own figure and needs no further scaling.
   */
  max?: number;
}

/**
 * A ranked comparison — "which items earn the most" — not a time series.
 *
 * Lifted out of AnalyticsPage, where it was a local helper capped at five, so
 * the inventory report can reuse it rather than grow a second one. Two things
 * changed on the way:
 *
 * **One hue, not one per bar.** The original cycled CHART_SERIES, which is a
 * categorical palette: it spends the identity channel re-encoding what bar
 * length already says, and it runs out once a warehouse has more than five
 * items. Bar length carries the comparison here.
 *
 * **Negative values render.** The original computed `(value / max) * 100`,
 * which gives a NEGATIVE width on a loss-making row — the bar vanishes, and
 * that is precisely the row worth seeing. Scaling on magnitude and colouring
 * the bar with the danger token puts it back: an item sold below cost is a
 * status, not a series, and it is the most important thing this chart can say.
 */
export function RankedBars({
  points,
  limit = 10,
  format,
  emptyLabel = 'Nothing to rank yet.',
  hrefFor,
  onSelect,
  activeKey = null,
  max: maxOverride,
}: RankedBarsProps) {
  if (points.length === 0) {
    return <p className="text-body-sm text-text-tertiary">{emptyLabel}</p>;
  }

  const head = points.slice(0, limit);
  const tail = points.slice(limit);
  // Folded rather than dropped, so the bars still add up to the total above
  // them — otherwise the chart quietly disagrees with the table.
  const rows: RankedPoint[] = tail.length
    ? [
        ...head,
        {
          key: '__other__',
          label: `Other (${tail.length})`,
          value: tail.reduce((t, p) => t + p.value, 0),
        },
      ]
    : head;

  const max = maxOverride ?? Math.max(...rows.map((r) => Math.abs(r.value)), 0);
  const interactive = Boolean(hrefFor || onSelect);

  return (
    <ul className={cn('flex flex-col', interactive ? 'gap-xxs' : 'gap-sm')}>
      {rows.map((r) => {
        const negative = r.value < 0;
        const pct = max > 0 ? Math.max(2, (Math.abs(r.value) / max) * 100) : 2;
        const href = r.key !== '__other__' && hrefFor ? hrefFor(r.key) : null;
        const clickable = r.key !== '__other__' && (href !== null || !!onSelect);
        const active = activeKey !== null && r.key === activeKey;
        const body: ReactNode = (
          <>
            <div className="flex items-baseline justify-between gap-sm">
              <span
                className={cn(
                  'truncate text-body-sm',
                  active ? 'text-primary' : 'text-text-primary',
                  clickable && 'group-hover:text-primary',
                )}
              >
                {r.label}
              </span>
              <span
                className={`shrink-0 tabular text-label-md ${
                  negative ? 'text-danger' : 'text-text-primary'
                }`}
              >
                {format(r.value)}
              </span>
            </div>
            <div className="mt-xxs h-[6px] overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full"
                // Width and colour are runtime values, so neither can be a
                // Tailwind class.
                style={{
                  width: `${pct}%`,
                  backgroundColor: negative ? colors.danger : colors.navy500,
                }}
              />
            </div>
            {r.hint && (
              <p className="mt-xxs text-caption text-text-tertiary">{r.hint}</p>
            )}
          </>
        );
        const rowClass = cn(
          'group flex w-full items-center gap-xs rounded-md px-xs py-xxs text-left transition-colors hover:bg-surface-2',
          active && 'bg-primary-tint hover:bg-primary-tint',
        );
        const chevron = (
          <ChevronRight
            className="size-4 shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            aria-hidden="true"
          />
        );
        return (
          // Widened by the row's own padding, so an interactive list's labels
          // and bars line up with the card's edges like a static one's do.
          <li key={r.key} className={interactive ? '-mx-xs' : undefined}>
            {clickable && href !== null ? (
              <Link to={href} className={rowClass}>
                <div className="min-w-0 flex-1">{body}</div>
                {chevron}
              </Link>
            ) : clickable && onSelect ? (
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(r.key)}
                className={rowClass}
              >
                <div className="min-w-0 flex-1">{body}</div>
              </button>
            ) : (
              <div className={interactive ? 'flex items-center gap-xs px-xs py-xxs' : undefined}>
                <div className="min-w-0 flex-1">{body}</div>
                {/* Room for the chevron the linked rows carry, so every bar
                    in the list ends at the same edge. */}
                {href === null && hrefFor && <span className="size-4 shrink-0" aria-hidden="true" />}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default RankedBars;
