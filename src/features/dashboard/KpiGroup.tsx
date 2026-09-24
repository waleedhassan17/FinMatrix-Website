import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { compactMoney, formatMoney } from '@/utils/money';

export interface KpiCell {
  key: string;
  label: string;
  value: number;
  /** One line of context: what the figure counts. */
  caption: string;
  /** The report the figure is a summary of. */
  to: string;
  /** `danger` for the one figure whose sign is news — a loss. */
  tone?: 'default' | 'danger';
}

/**
 * A row of headline figures under one heading, divided by hairlines.
 *
 * Grouped because the five dashboard figures are two different kinds of number.
 * Revenue, expenses and net income are FLOWS over the month; receivables and
 * payables are BALANCES at a moment. Side by side as five identical tiles they
 * read as one series, and "Rs 2.1M receivables" looks like it belongs to the
 * month the tile next to it measures.
 *
 * No colour rail. The tiles this replaces each wore a different one — green,
 * blue, amber, navy — which said nothing, because none of them was a status.
 * Ink figures on one surface; colour only for a negative net.
 */
export function KpiGroup({
  title,
  cells,
  loading,
  unavailable = false,
  className,
}: {
  title: string;
  cells: KpiCell[];
  loading: boolean;
  /** The figures failed to load. A dash, never a zero that reads as real. */
  unavailable?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn('flex flex-col overflow-hidden', className)}>
      <div className="border-b border-border-light px-lg py-sm">
        <h2 className="text-overline text-text-secondary">{title}</h2>
      </div>
      <div
        className={cn(
          'grid flex-1 divide-y divide-border-light sm:divide-x sm:divide-y-0',
          cells.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
        )}
      >
        {cells.map((cell) => (
          <Link
            key={cell.key}
            to={cell.to}
            className="group flex min-w-0 flex-col px-lg py-md transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
          >
            <span className="flex items-center justify-between gap-xs">
              <span className="truncate text-label-md text-text-secondary">
                {cell.label}
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              />
            </span>
            {loading ? (
              <Skeleton className="mt-xs h-7 w-28" />
            ) : unavailable ? (
              <span className="mt-xxs text-h2 text-text-tertiary">—</span>
            ) : (
              // Compact because a cell is not wide enough for Rs 12,345,678.00 at
              // this size; the exact figure is in the title for anyone who
              // needs it, and one click away in the report.
              <span
                className={cn(
                  'mt-xxs text-h2 tabular',
                  cell.tone === 'danger' ? 'text-danger' : 'text-text-primary',
                )}
                title={formatMoney(cell.value)}
              >
                {compactMoney(cell.value)}
              </span>
            )}
            <span className="mt-xxs truncate text-caption text-text-tertiary">
              {cell.caption}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

export default KpiGroup;
