import { useInfiniteQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { LoadMore } from '@/components/ui/LoadMore';
import { Skeleton } from '@/components/ui/Skeleton';
import { documentHref } from '@/features/reports/documentRoutes';
import { formatShortDate, type ReportRange } from '@/models/reportPeriod';
import { getCashFlowLineEntries } from '@/networks/reports/cashFlowNetwork';
import { parenNegative } from '@/utils/money';

const PAGE = 50;

export interface CashFlowLineViewProps {
  lineKey: string;
  range: ReportRange;
  /** The figure on the cash-flow line. */
  lineAmount: number;
}

/**
 * The cash postings classified into one cash-flow line. A payment split across
 * lines — a bill payment allocated over the accounts of the bills it paid —
 * shows its share and the percentage it was allocated at, and the allocated
 * amounts add up to the line.
 */
export function CashFlowLineView({ lineKey, range, lineAmount }: CashFlowLineViewProps) {
  const query = useInfiniteQuery({
    queryKey: ['reports', 'cash-flow-line', lineKey, range.startDate, range.endDate],
    queryFn: ({ pageParam }) => getCashFlowLineEntries(lineKey, range, pageParam, PAGE),
    initialPageParam: 1,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.entries.length, 0);
      return loaded < last.total ? all.length + 1 : undefined;
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-xs p-lg" aria-busy="true">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="p-lg">
        <p className="text-body-sm text-text-secondary">
          {(query.error as Error | null)?.message ?? 'These entries could not be loaded.'}
        </p>
        <Button variant="secondary" size="sm" className="mt-sm" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const first = query.data.pages[0];
  const entries = query.data.pages.flatMap((p) => p.entries);
  const ties = first.lineAmount === null ? null : Math.abs(first.lineAmount - lineAmount) < 0.005;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-sm border-b border-border-light px-lg py-md">
        <div>
          <p className="text-caption text-text-tertiary">On the statement</p>
          <p className="text-h4 tabular text-text-primary">{parenNegative(lineAmount)}</p>
        </div>
        {ties && (
          <span className="inline-flex items-center gap-[3px] text-label-sm text-text-secondary">
            <Check className="size-3.5 text-success" aria-hidden="true" />
            Ties to statement
          </span>
        )}
        {ties === false && (
          <span role="status" className="text-label-sm text-danger">
            The entries do not add up to the line
          </span>
        )}
      </div>
      <ul className="divide-y divide-border-light">
        {entries.map((e) => {
          const href = documentHref(e.sourceType, e.sourceId);
          const title = e.documentNumber || e.reference || e.sourceLabel;
          const split = e.allocationPct !== null && e.allocationPct < 99.995;
          return (
            <li key={`${e.id}-${e.allocatedAmount}`} className="flex items-start justify-between gap-md px-lg py-xs">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-xs text-body-sm">
                  <span className="tabular text-text-secondary">{formatShortDate(e.date)}</span>
                  {href ? (
                    <Link to={href} className="text-label-md text-text-link hover:underline">
                      {title}
                    </Link>
                  ) : (
                    <span className="text-label-md text-text-primary">{title}</span>
                  )}
                  {e.counterpartyName && <span className="text-text-primary">· {e.counterpartyName}</span>}
                </div>
                <p className="text-caption text-text-tertiary">
                  {[e.sourceLabel, e.memo].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-body-sm tabular text-text-primary">{parenNegative(e.allocatedAmount, '')}</p>
                {split && (
                  <p className="text-caption tabular text-text-tertiary">
                    {e.allocationPct?.toFixed(1)}% of {parenNegative(e.amount, '')}
                  </p>
                )}
              </div>
            </li>
          );
        })}
        {entries.length === 0 && (
          <li className="px-lg py-md text-body-sm text-text-tertiary">No cash moved on this line in the period.</li>
        )}
      </ul>
      <div className="px-lg py-md">
        <LoadMore
          shown={entries.length}
          total={first.total}
          hasMore={!!query.hasNextPage}
          loading={query.isFetchingNextPage}
          onMore={() => query.fetchNextPage()}
        />
      </div>
    </div>
  );
}

export default CashFlowLineView;
