import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatShortDate } from '@/models/reportPeriod';
import { getRetainedEarnings } from '@/networks/reports/balanceSheetNetwork';
import { parenNegative } from '@/utils/money';

export interface RetainedEarningsViewProps {
  asOfDate: string;
  /** The Retained Earnings line on the balance sheet. */
  lineAmount: number;
}

/**
 * What Retained Earnings is made of: anything posted to 3100 directly, then
 * each closed fiscal year's net income. The total is the balance-sheet line;
 * each year opens its own Profit & Loss.
 */
export function RetainedEarningsView({ asOfDate, lineAmount }: RetainedEarningsViewProps) {
  const query = useQuery({
    queryKey: ['reports', 'retained-earnings', asOfDate],
    queryFn: () => getRetainedEarnings(asOfDate),
  });

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-xs p-lg" aria-busy="true">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="p-lg">
        <p className="text-body-sm text-text-secondary">
          {(query.error as Error | null)?.message ?? 'The rollforward could not be loaded.'}
        </p>
        <Button variant="secondary" size="sm" className="mt-sm" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const re = query.data;
  const ties = Math.abs(re.total - lineAmount) < 0.005;
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-sm border-b border-border-light px-lg py-md">
        <div>
          <p className="text-caption text-text-tertiary">Retained Earnings on the balance sheet</p>
          <p className="text-h4 tabular text-text-primary">{parenNegative(lineAmount)}</p>
        </div>
        {ties ? (
          <span className="inline-flex items-center gap-[3px] text-label-sm text-text-secondary">
            <Check className="size-3.5 text-success" aria-hidden="true" />
            Ties to statement
          </span>
        ) : (
          <span role="status" className="text-label-sm text-danger">
            The rollforward totals {parenNegative(re.total)}
          </span>
        )}
      </div>
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">Retained earnings rollforward</caption>
        <tbody>
          <tr className="border-b border-border-light">
            <th scope="row" className="px-lg py-xs text-left font-normal text-text-primary">
              Posted to 3100 Retained Earnings
            </th>
            <td className="px-lg py-xs text-right tabular">{parenNegative(re.postedTo3100, '')}</td>
          </tr>
          {re.byFiscalYear.map((y) => (
            <tr key={y.fiscalYear} className="border-b border-border-light">
              <th scope="row" className="px-lg py-xs text-left font-normal">
                <Link
                  to={`/reports/profit-loss?from=${y.startDate}&to=${y.endDate}`}
                  className="group inline-flex items-center gap-xxs text-text-link hover:underline"
                >
                  Net income, {y.fiscalYear}
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </Link>
                <span className="block text-caption text-text-tertiary">
                  {formatShortDate(y.startDate)} – {formatShortDate(y.endDate)}
                </span>
              </th>
              <td className="px-lg py-xs text-right tabular">{parenNegative(y.netIncome, '')}</td>
            </tr>
          ))}
          <tr className="border-t border-text-primary bg-surface-2">
            <th scope="row" className="px-lg py-xs text-left text-label-md">Retained Earnings</th>
            <td className="px-lg py-xs text-right tabular text-label-md">{parenNegative(re.total, '')}</td>
          </tr>
        </tbody>
      </table>
      <p className="px-lg py-md text-caption text-text-tertiary">
        The current fiscal year (from {formatShortDate(re.fiscalYearStart)}) is shown separately on the
        balance sheet as Net Income (current fiscal year).
      </p>
    </div>
  );
}

export default RetainedEarningsView;
