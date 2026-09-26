import { ChartColumn, ChartLine } from 'lucide-react';
import { useId } from 'react';

import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import {
  EXPLORER_METRICS,
  METRIC_GROUPS,
  type ExplorerMetricKey,
} from '@/models/itemExplorer';
import type { ChartType } from '@/features/reports/MetricChart';

/**
 * Columns or a line — the reader's choice, for every metric.
 *
 * A segmented pair in the same bordered, 40px style as the aging report's
 * "Age by" control, so a toolbar of them reads as one row of controls.
 */
export function ChartTypeToggle({
  value,
  onChange,
  className,
}: {
  value: ChartType;
  onChange: (type: ChartType) => void;
  className?: string;
}) {
  const options: { key: ChartType; label: string; Icon: typeof ChartColumn }[] = [
    { key: 'bar', label: 'Bar', Icon: ChartColumn },
    { key: 'line', label: 'Line', Icon: ChartLine },
  ];
  return (
    <div
      role="group"
      aria-label="Chart type"
      className={cn('flex h-9 shrink-0 overflow-hidden rounded-md border border-border bg-surface', className)}
    >
      {options.map(({ key, label, Icon }, i) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            'inline-flex items-center gap-xxs px-sm text-label-md transition-colors',
            i > 0 && 'border-l border-border',
            value === key
              ? 'bg-primary-tint text-primary'
              : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Which metric the chart draws, grouped as the table below it is.
 *
 * Every choice is visible on a wide screen — the point of an explorer is that
 * the alternatives are in view. On a phone ten pills wrap into a wall, so the
 * same choices become one select.
 */
export function MetricPicker({
  value,
  onChange,
  disabled = [],
  className,
}: {
  value: ExplorerMetricKey;
  onChange: (key: ExplorerMetricKey) => void;
  /** Metrics with nothing to draw — shown, but not choosable. */
  disabled?: readonly ExplorerMetricKey[];
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <Select<ExplorerMetricKey>
        compact
        label={<span className="sr-only">Metric</span>}
        value={value}
        onChange={onChange}
        options={EXPLORER_METRICS.filter((m) => !disabled.includes(m.key)).map((m) => ({
          value: m.key,
          label: `${METRIC_GROUPS.find((g) => g.key === m.group)?.label} · ${m.label}`,
        }))}
        containerClassName="sm:hidden"
      />

      <div className="hidden flex-col gap-xs sm:flex">
        {METRIC_GROUPS.map((g) => (
          <div key={g.key} className="flex flex-wrap items-center gap-xs" role="group" aria-labelledby={`${id}-${g.key}`}>
            <span id={`${id}-${g.key}`} className="w-12 shrink-0 text-overline text-text-tertiary">
              {g.label}
            </span>
            {EXPLORER_METRICS.filter((m) => m.group === g.key).map((m) => {
              const off = disabled.includes(m.key);
              return (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={value === m.key}
                  disabled={off}
                  title={off ? 'Nothing recorded for this item in the period' : undefined}
                  onClick={() => onChange(m.key)}
                  className={cn(
                    'rounded-full border px-md py-xxs text-label-md transition-colors',
                    value === m.key
                      ? 'border-primary bg-primary text-text-inverse'
                      : 'border-border bg-surface text-text-secondary hover:border-primary hover:text-primary',
                    off && 'cursor-not-allowed opacity-50 hover:border-border hover:text-text-secondary',
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
