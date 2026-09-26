import { useEffect, useRef } from 'react';

import { cn } from '@/lib/cn';
import {
  EXPLORER_METRICS,
  METRIC_GROUPS,
  formatMetricCell,
  periodValue,
  type ExplorerMetricKey,
  type ExplorerMonth,
} from '@/models/itemExplorer';

export interface MetricTableProps {
  months: readonly ExplorerMonth[];
  metric: ExplorerMetricKey;
  onMetric: (key: ExplorerMetricKey) => void;
  selectedPeriod?: string | null;
  onPeriod?: (period: string | null) => void;
  /** Metrics with no series at all (an older server) are left out. */
  hidden?: readonly ExplorerMetricKey[];
  className?: string;
}

/**
 * Every metric, every month — the figures behind the chart, laid out the way
 * a financial data terminal lays out a company: metrics down the side, periods
 * across, the period's figure at the end.
 *
 * Clicking a metric charts it; clicking a month opens the documents behind
 * it. Both are buttons, so the table works from a keyboard, and the chart
 * above has a text equivalent a screen reader can walk.
 *
 * Opens scrolled to the newest month: the question is nearly always "how is
 * it doing now", and on a phone the oldest months would otherwise fill the
 * screen.
 */
export function MetricTable({
  months,
  metric,
  onMetric,
  selectedPeriod = null,
  onPeriod,
  hidden = [],
  className,
}: MetricTableProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const spine = months.map((m) => m.period).join(',');

  // Keep the newest month in view as the table lays out — fonts, the rail
  // beside it and the data can all widen it after the first paint — until
  // the reader scrolls it themselves. A new window starts over.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    touched.current = false;
    const toEnd = () => {
      if (!touched.current) el.scrollLeft = el.scrollWidth;
    };
    toEnd();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(toEnd);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [spine]);

  const markTouched = () => {
    touched.current = true;
  };

  const cellTone = (v: number | null) =>
    v === null ? 'text-text-tertiary' : v < 0 ? 'text-danger' : 'text-text-primary';

  return (
    <div
      ref={scroller}
      onPointerDown={markTouched}
      onWheel={markTouched}
      onKeyDown={markTouched}
      onTouchStart={markTouched}
      className={cn('overflow-x-auto', className)}
    >
      <table className="w-full border-collapse">
        <caption className="sr-only">
          Monthly figures. Choose a metric to chart it, or a month to see the documents behind it.
        </caption>
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th
              scope="col"
              className="sticky left-0 z-10 min-w-[8rem] bg-surface-2 sm:min-w-[10.5rem] px-md py-sm text-left text-overline text-text-secondary shadow-[inset_-1px_0_0_var(--color-border),6px_0_8px_-6px_color-mix(in_srgb,var(--color-neutral-900)_16%,transparent)]"
            >
              Metric
            </th>
            {months.map((m) => {
              const on = m.period === selectedPeriod;
              return (
                <th
                  key={m.period}
                  scope="col"
                  className={cn('px-xs py-xxs text-right', on && 'bg-primary-tint')}
                >
                  {onPeriod ? (
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => onPeriod(on ? null : m.period)}
                      className={cn(
                        'w-full rounded-sm px-xs py-xxs text-right text-overline whitespace-nowrap transition-colors',
                        on ? 'text-primary' : 'text-text-secondary hover:text-primary',
                      )}
                    >
                      {m.label}
                    </button>
                  ) : (
                    <span className="px-xs text-overline whitespace-nowrap text-text-secondary">
                      {m.label}
                    </span>
                  )}
                </th>
              );
            })}
            <th
              scope="col"
              title="Sums for flows; margin and price recomputed from the period's totals; the latest month for stock levels."
              className="sticky right-0 z-10 border-l border-border bg-surface-2 px-md py-sm text-right text-overline whitespace-nowrap text-text-secondary shadow-[-6px_0_8px_-6px_color-mix(in_srgb,var(--color-neutral-900)_16%,transparent)]"
            >
              Period
            </th>
          </tr>
        </thead>
        <tbody>
          {METRIC_GROUPS.map((g) => {
            const rows = EXPLORER_METRICS.filter((m) => m.group === g.key && !hidden.includes(m.key));
            if (rows.length === 0) return null;
            return [
              // The label sits in the pinned first column, not across the row:
              // a heading spanning the table scrolls away with the months.
              <tr key={`group-${g.key}`} className="border-b border-border-light">
                <th
                  scope="rowgroup"
                  className="sticky left-0 z-10 bg-surface px-md pt-md pb-xxs text-left text-overline text-text-tertiary shadow-[inset_-1px_0_0_var(--color-border),6px_0_8px_-6px_color-mix(in_srgb,var(--color-neutral-900)_16%,transparent)]"
                >
                  {g.label}
                </th>
                <td colSpan={months.length} />
                <td className="sticky right-0 border-l border-border bg-surface" />
              </tr>,
              ...rows.map((m) => {
                const on = m.key === metric;
                const total = periodValue(months, m.key);
                return (
                  <tr
                    key={m.key}
                    className={cn(
                      'border-b border-border-light',
                      on ? 'bg-primary-tint' : 'hover:bg-surface-2',
                    )}
                  >
                    <th
                      scope="row"
                      className={cn(
                        'sticky left-0 z-10 p-0 text-left shadow-[inset_-1px_0_0_var(--color-border),6px_0_8px_-6px_color-mix(in_srgb,var(--color-neutral-900)_16%,transparent)]',
                        on ? 'bg-primary-tint' : 'bg-surface',
                      )}
                    >
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => onMetric(m.key)}
                        className={cn(
                          'flex w-full items-center gap-xs border-l-2 px-md py-sm text-left text-body-sm whitespace-nowrap transition-colors',
                          on
                            ? 'border-primary text-primary'
                            : 'border-transparent text-text-primary hover:text-primary',
                        )}
                      >
                        {m.label}
                        {m.unit === 'percent' && <span className="text-caption text-text-tertiary">%</span>}
                      </button>
                    </th>
                    {months.map((mo) => {
                      const v = mo.values[m.key];
                      return (
                        <td
                          key={mo.period}
                          className={cn(
                            'px-sm py-sm text-right tabular text-body-sm whitespace-nowrap',
                            cellTone(v),
                            mo.period === selectedPeriod && !on && 'bg-surface-2',
                          )}
                        >
                          {formatMetricCell(m.key, v)}
                        </td>
                      );
                    })}
                    <td
                      className={cn(
                        'sticky right-0 border-l border-border px-md py-sm text-right tabular text-label-md whitespace-nowrap shadow-[-6px_0_8px_-6px_color-mix(in_srgb,var(--color-neutral-900)_16%,transparent)]',
                        on ? 'bg-primary-tint' : 'bg-surface',
                        cellTone(total),
                      )}
                    >
                      {formatMetricCell(m.key, total)}
                    </td>
                  </tr>
                );
              }),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

export default MetricTable;
