import { Check, ChartColumn, ChartLine, ChevronDown } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { cn } from '@/lib/cn';
import { explorerMetric, type ExplorerMetricKey } from '@/models/itemExplorer';
import type { ChartType } from '@/features/reports/MetricChart';

/**
 * Columns or a line — two icons in one bordered pair. Icon-only to keep the
 * chart's header quiet; the names are there for a screen reader and on hover.
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
    { key: 'bar', label: 'Bar chart', Icon: ChartColumn },
    { key: 'line', label: 'Line chart', Icon: ChartLine },
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
          aria-label={label}
          title={label}
          onClick={() => onChange(key)}
          className={cn(
            'inline-flex w-9 items-center justify-center transition-colors',
            i > 0 && 'border-l border-border',
            value === key
              ? 'bg-primary-tint text-primary'
              : 'text-text-tertiary hover:bg-surface-2 hover:text-text-primary',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/**
 * The metrics that are not headline figures, one menu away.
 *
 * Names the chosen one when it came from here, so the chart's header always
 * says what is drawn; otherwise it reads "More metrics".
 */
export function MoreMetricsMenu({
  metrics,
  value,
  onChange,
  disabled = [],
}: {
  metrics: readonly ExplorerMetricKey[];
  value: ExplorerMetricKey;
  onChange: (key: ExplorerMetricKey) => void;
  /** Metrics with nothing to draw — listed, not choosable. */
  disabled?: readonly ExplorerMetricKey[];
}) {
  const current = metrics.includes(value) ? explorerMetric(value).label : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-9 items-center gap-xs rounded-md border px-sm text-label-md transition-colors',
            current
              ? 'border-primary bg-primary-tint text-primary'
              : 'border-border bg-surface text-text-secondary hover:bg-surface-2 hover:text-text-primary',
          )}
        >
          {current ?? 'More metrics'}
          <ChevronDown className="size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {metrics.map((key) => {
          const m = explorerMetric(key);
          const on = key === value;
          return (
            <DropdownMenuItem
              key={key}
              disabled={disabled.includes(key)}
              onSelect={() => onChange(key)}
              className={on ? 'text-primary' : undefined}
            >
              <span className="flex-1">
                {m.label}
                <span className="block text-caption text-text-tertiary">
                  {m.group === 'stock' ? 'Stock' : 'Sales'}
                </span>
              </span>
              {on && <Check className="text-primary" aria-hidden="true" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
