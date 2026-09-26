import { useInfiniteQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatQty } from '@/models/inventory';
import { formatShortDate, type ReportRange } from '@/models/reportPeriod';
import { ApiError } from '@/networks/network/apiHelpers';
import { getItemSalesEntries } from '@/networks/reports/inventoryValuationNetwork';
import type { ItemSalesEntry } from '@/serializers/reportSerializers';
import { formatAmount, formatMoney } from '@/utils/money';

const PAGE = 25;

const DOC: Record<ItemSalesEntry['docType'], { label: string; path: (id: string) => string }> = {
  invoice: { label: 'Invoice', path: (id) => `/invoices/${id}` },
  // A delivery is sold on the invoice its approval raised; that is the record.
  delivery: { label: 'Delivery', path: (id) => `/invoices/${id}` },
  credit_memo: { label: 'Return', path: (id) => `/credit-memos/${id}` },
};

const qty = (n: number) => (n < 0 ? `−${formatQty(-n)}` : formatQty(n));

export interface ItemSalesEntriesProps {
  itemId: string;
  /** The month, clipped to the explorer's window. */
  range: ReportRange;
  /** "Mar 26", for the heading. */
  label: string;
  onClose: () => void;
}

/**
 * The documents behind one month of one item: every invoice, delivery and
 * return line that makes up the figures above, newest first.
 *
 * The totals row is the server's, over the WHOLE month, not the rows loaded so
 * far — so it matches the month in the chart and the table even while only
 * the first page is on screen. A server from before this endpoint answers 404,
 * and the panel says the detail is not available rather than "nothing sold".
 */
export function ItemSalesEntries({ itemId, range, label, onClose }: ItemSalesEntriesProps) {
  const query = useInfiniteQuery({
    queryKey: ['reports', 'item-entries', itemId, range],
    queryFn: ({ pageParam }) => getItemSalesEntries(itemId, range, pageParam, PAGE),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
  });

  const pages = query.data?.pages ?? [];
  const entries = pages.flatMap((p) => p.entries);
  const first = pages[0];
  const unavailable = query.error instanceof ApiError && query.error.status === 404;

  return (
    <Card className="overflow-hidden" aria-live="polite">
      <div className="flex items-start justify-between gap-md border-b border-border-light px-lg py-sm">
        <div className="min-w-0">
          <h3 className="text-h5 text-text-primary">What&rsquo;s behind {label}</h3>
          <p className="text-caption text-text-tertiary">
            {first
              ? `${first.total} document line${first.total === 1 ? '' : 's'} · ${formatShortDate(range.startDate)} – ${formatShortDate(range.endDate)}`
              : `${formatShortDate(range.startDate)} – ${formatShortDate(range.endDate)}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close the documents behind ${label}`}
          className="rounded-sm p-xxs text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {query.isLoading && (
        <div className="flex flex-col gap-xs p-lg">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-10/12" />
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
        <p className="p-lg text-body-sm text-text-tertiary">
          Nothing was sold or returned in {label}. Stock may still have moved — see
          Received and Issued in the table below.
        </p>
      )}

      {entries.length > 0 && first && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-lg py-sm text-left text-overline text-text-secondary">Date</th>
                <th className="px-md py-sm text-left text-overline text-text-secondary">Document</th>
                <th className="px-md py-sm text-left text-overline text-text-secondary">Customer</th>
                <th className="px-md py-sm text-right text-overline text-text-secondary">Qty</th>
                <th className="hidden px-md py-sm text-right text-overline whitespace-nowrap text-text-secondary sm:table-cell xl:hidden 2xl:table-cell">
                  Unit price
                </th>
                <th className="px-md py-sm text-right text-overline text-text-secondary">Revenue</th>
                <th className="hidden px-md py-sm text-right text-overline text-text-secondary md:table-cell">
                  Cost
                </th>
                <th className="px-md py-sm text-right text-overline whitespace-nowrap text-text-secondary">
                  Gross profit
                </th>
                <th className="hidden px-lg py-sm text-right text-overline text-text-secondary sm:table-cell xl:hidden 2xl:table-cell">
                  Margin
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const doc = DOC[e.docType];
                return (
                  <tr key={`${e.docId}-${i}`} className="border-b border-border-light hover:bg-surface-2">
                    <td className="px-lg py-sm text-body-sm whitespace-nowrap text-text-secondary">
                      {formatShortDate(e.date)}
                    </td>
                    <td className="px-md py-sm whitespace-nowrap">
                      <Link to={doc.path(e.docId)} className="block text-body-sm text-primary hover:underline">
                        {e.docNumber || doc.label}
                      </Link>
                      <span className="block text-caption text-text-tertiary">{doc.label}</span>
                    </td>
                    <td className="max-w-[11rem] truncate px-md py-sm text-body-sm text-text-primary">
                      {e.customerId ? (
                        <Link to={`/customers/${e.customerId}`} className="hover:text-primary hover:underline">
                          {e.customerName}
                        </Link>
                      ) : (
                        e.customerName
                      )}
                    </td>
                    <td
                      className={cn(
                        'px-md py-sm text-right tabular text-body-sm whitespace-nowrap',
                        e.units < 0 ? 'text-danger' : 'text-text-primary',
                      )}
                    >
                      {qty(e.units)}
                    </td>
                    <td className="hidden px-md py-sm text-right tabular text-body-sm whitespace-nowrap text-text-primary sm:table-cell xl:hidden 2xl:table-cell">
                      {formatAmount(e.unitPrice)}
                    </td>
                    <td
                      className={cn(
                        'px-md py-sm text-right tabular text-body-sm whitespace-nowrap',
                        e.revenue < 0 ? 'text-danger' : 'text-text-primary',
                      )}
                    >
                      {formatAmount(e.revenue)}
                    </td>
                    <td className="hidden px-md py-sm text-right tabular text-body-sm whitespace-nowrap text-text-primary md:table-cell">
                      {e.costKnown ? formatAmount(e.cogs) : '—'}
                      {e.costBasis === 'apportioned' && (
                        <span
                          className="ml-[2px] text-caption text-text-tertiary"
                          title="This invoice's cost is exact; its split across the items on it is an estimate."
                        >
                          est.
                        </span>
                      )}
                    </td>
                    <td
                      className={cn(
                        'px-md py-sm text-right tabular text-body-sm whitespace-nowrap',
                        e.grossProfit < 0 ? 'text-danger' : 'text-text-primary',
                      )}
                    >
                      {formatAmount(e.grossProfit)}
                    </td>
                    <td className="hidden px-lg py-sm text-right tabular text-body-sm whitespace-nowrap text-text-secondary sm:table-cell xl:hidden 2xl:table-cell">
                      {e.marginPct === null ? '—' : `${e.marginPct.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-text-primary bg-surface-2">
                <td className="px-lg py-sm text-label-md text-text-primary" colSpan={3}>
                  {label} total
                </td>
                <td className="px-md py-sm text-right tabular text-label-md whitespace-nowrap text-text-primary">
                  {qty(first.totals.unitsSold)}
                </td>
                <td className="hidden sm:table-cell xl:hidden 2xl:table-cell" />
                <td className="px-md py-sm text-right tabular text-label-md whitespace-nowrap text-text-primary">
                  {formatAmount(first.totals.revenue)}
                </td>
                <td className="hidden px-md py-sm text-right tabular text-label-md whitespace-nowrap text-text-primary md:table-cell">
                  {formatAmount(first.totals.cogs)}
                </td>
                <td
                  className={cn(
                    'px-md py-sm text-right tabular text-label-md whitespace-nowrap',
                    first.totals.grossProfit < 0 ? 'text-danger' : 'text-text-primary',
                  )}
                >
                  {formatAmount(first.totals.grossProfit)}
                </td>
                <td className="hidden sm:table-cell xl:hidden 2xl:table-cell" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {query.hasNextPage && (
        <div className="flex items-center justify-between gap-md border-t border-border-light px-lg py-sm">
          <p className="text-caption text-text-tertiary">
            Showing {entries.length} of {first?.total ?? entries.length} ·{' '}
            {formatMoney(first?.totals.revenue ?? 0)} in the month
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
    </Card>
  );
}

export default ItemSalesEntries;
