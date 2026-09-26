import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { SidePanel } from '@/components/ui/SidePanel';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatQty } from '@/models/inventory';
import { formatShortDate, type ReportRange } from '@/models/reportPeriod';
import { ApiError } from '@/networks/network/apiHelpers';
import { getItemSalesEntries } from '@/networks/reports/inventoryValuationNetwork';
import type { ItemSalesEntry } from '@/serializers/reportSerializers';
import { formatMoney } from '@/utils/money';

const PAGE = 25;

const DOC: Record<ItemSalesEntry['docType'], { label: string; path: (id: string) => string }> = {
  invoice: { label: 'Invoice', path: (id) => `/invoices/${id}` },
  // A delivery is sold on the invoice its approval raised; that is the record.
  delivery: { label: 'Delivery', path: (id) => `/invoices/${id}` },
  credit_memo: { label: 'Return', path: (id) => `/credit-memos/${id}` },
};

const qty = (n: number) => (n < 0 ? `−${formatQty(-n)}` : formatQty(n));

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
/** "2026-07" → "July 2026". */
const longMonth = (period: string) => MONTH.format(new Date(`${period}-01T00:00:00`));

export interface ItemMonthPanelProps {
  itemId: string;
  itemName: string;
  /** The month open, or null when the panel is closed. */
  period: string | null;
  /** That month, clipped to the explorer's window. */
  range: ReportRange | null;
  onClose: () => void;
}

/**
 * The documents behind one month of one item, in a panel over the explorer.
 *
 * Every invoice, delivery and return line that makes up the month the reader
 * chose, newest first; each opens its record. The total at the foot is the
 * server's over the WHOLE month, not the lines loaded so far, so it matches
 * the chart even while only the first page is on screen. A server from before
 * this endpoint answers 404, and the panel says the detail is not available
 * rather than "nothing sold".
 */
export function ItemMonthPanel({ itemId, itemName, period, range, onClose }: ItemMonthPanelProps) {
  const open = period !== null && range !== null;
  const query = useInfiniteQuery({
    queryKey: ['reports', 'item-entries', itemId, range],
    queryFn: ({ pageParam }) => getItemSalesEntries(itemId, range!, pageParam, PAGE),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    enabled: open,
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
  });

  const pages = query.data?.pages ?? [];
  const entries = pages.flatMap((p) => p.entries);
  const first = pages[0];
  const unavailable = query.error instanceof ApiError && query.error.status === 404;
  const month = period ? longMonth(period) : '';

  return (
    <SidePanel
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={`${itemName} · ${month}`}
      description={
        first
          ? `${first.total} document line${first.total === 1 ? '' : 's'} · ${formatMoney(first.totals.revenue)} revenue`
          : range
            ? `${formatShortDate(range.startDate)} – ${formatShortDate(range.endDate)}`
            : undefined
      }
      footer={
        first && entries.length > 0 ? (
          <div className="flex items-baseline justify-between gap-md">
            <span className="text-label-md text-text-primary">
              {month} · {qty(first.totals.unitsSold)} units
            </span>
            <span className="text-right">
              <span className="block text-label-lg text-text-primary tabular">
                {formatMoney(first.totals.revenue)}
              </span>
              <span
                className={cn(
                  'block text-caption tabular',
                  first.totals.grossProfit < 0 ? 'text-danger' : 'text-text-secondary',
                )}
              >
                Gross profit {formatMoney(first.totals.grossProfit)}
              </span>
            </span>
          </div>
        ) : undefined
      }
    >
      {query.isLoading && (
        <div className="flex flex-col gap-sm p-lg">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {query.error && (
        <div className="p-lg">
          <p className="text-body-sm text-text-secondary">
            {unavailable
              ? 'The documents behind a month are not available from this server yet.'
              : 'The documents behind this month could not be loaded.'}
          </p>
          {!unavailable && (
            <Button variant="secondary" size="sm" className="mt-sm" onClick={() => query.refetch()}>
              Try again
            </Button>
          )}
        </div>
      )}

      {first && entries.length === 0 && (
        <p className="p-lg text-body-sm text-text-secondary">
          Nothing was sold or returned in {month}. Stock may still have moved — see Received and
          Issued in the monthly breakdown.
        </p>
      )}

      {entries.length > 0 && (
        <ul className="divide-y divide-border-light">
          {entries.map((e, i) => {
            const doc = DOC[e.docType];
            return (
              <li key={`${e.docId}-${i}`}>
                <Link
                  to={doc.path(e.docId)}
                  className="group flex items-center gap-md px-lg py-sm transition-colors hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-xs">
                      <span className="truncate text-label-md text-primary group-hover:underline">
                        {e.docNumber || doc.label}
                      </span>
                      <span className="shrink-0 rounded-xs border border-border px-[5px] text-caption text-text-tertiary">
                        {doc.label}
                      </span>
                    </p>
                    <p className="truncate text-caption text-text-secondary">
                      {formatShortDate(e.date)} · {e.customerName}
                    </p>
                    <p className="truncate text-caption text-text-tertiary tabular">
                      {qty(e.units)} × {formatMoney(e.unitPrice)}
                      {e.costBasis === 'apportioned' && ' · cost estimated'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        'text-label-md tabular',
                        e.revenue < 0 ? 'text-danger' : 'text-text-primary',
                      )}
                    >
                      {formatMoney(e.revenue)}
                    </p>
                    <p
                      className={cn(
                        'text-caption tabular',
                        e.grossProfit < 0 ? 'text-danger' : 'text-text-tertiary',
                      )}
                    >
                      GP {formatMoney(e.grossProfit)}
                      {e.marginPct !== null && ` · ${e.marginPct.toFixed(1)}%`}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {query.hasNextPage && (
        <div className="flex items-center justify-between gap-md border-t border-border-light px-lg py-sm">
          <p className="text-caption text-text-tertiary tabular">
            {entries.length} of {first?.total ?? entries.length}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? 'Loading…' : 'Show more'}
          </Button>
        </div>
      )}
    </SidePanel>
  );
}

export default ItemMonthPanel;
