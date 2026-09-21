import { useQuery } from '@tanstack/react-query';

import { Skeleton } from '@/components/ui/Skeleton';
import type { ReportRange } from '@/models/reportPeriod';
import { getStatementLineEntries } from '@/networks/reports/profitLossNetwork';
import { formatShortDate } from '@/models/reportPeriod';
import { parenNegative } from '@/utils/money';

const PAGE_LIMIT = 50;

export interface StatementLineDetailProps {
  accountCode: string;
  range: ReportRange;
  /** The statement figure this line shows, for the dev-only reconcile check. */
  lineAmount?: number;
}

/**
 * The transactions behind one statement line, drawn underneath it.
 *
 * These figures are SHOWN, never summed back into the statement — the same rule
 * the rest of the reports follow: the client never foots a column. What this
 * does do is warn a developer, in dev only, when the rows it was handed
 * disagree with the line they sit under. That is a real defect and an
 * invisible one: the total would still be right and the detail beneath it
 * wrong.
 *
 * Fetched per line and cached by React Query, so reopening a row costs nothing
 * and switching period refetches (the range is in the key).
 */
export function StatementLineDetail({
  accountCode,
  range,
  lineAmount,
}: StatementLineDetailProps) {
  const query = useQuery({
    queryKey: ['reports', 'pl-line', accountCode, range],
    queryFn: () => getStatementLineEntries(accountCode, range, PAGE_LIMIT),
  });

  if (query.isLoading) {
    return (
      <div className="ml-xl border-l-2 border-border-light py-sm pl-md">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-xs h-4 w-1/2" />
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="ml-xl border-l-2 border-border-light py-sm pl-md">
        <p className="text-caption text-danger">{query.error.message}</p>
        <button
          type="button"
          onClick={() => query.refetch()}
          className="mt-xxs text-label-sm text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const data = query.data;
  const entries = data?.entries ?? [];

  if (entries.length === 0) {
    return (
      <div className="ml-xl border-l-2 border-border-light py-sm pl-md">
        <p className="text-caption text-text-tertiary">
          No transactions in this period.
        </p>
      </div>
    );
  }

  if (import.meta.env.DEV && lineAmount !== undefined) {
    const shown = entries.reduce((t, e) => t + e.amount, 0);
    const complete = entries.length >= (data?.total ?? 0);
    if (complete && Math.abs(shown - lineAmount) > 0.01) {
      console.warn(
        `[reports] P&L drill-down ${accountCode}: entries sum to ${shown} but ` +
          `the line reports ${lineAmount}. Showing the server figure.`,
      );
    }
  }

  const truncated = (data?.total ?? 0) > entries.length;

  return (
    <div className="ml-xl border-l-2 border-border-light py-xs pl-md">
      <table className="w-full border-collapse">
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="py-xxs pr-sm text-caption whitespace-nowrap text-text-tertiary">
                {formatShortDate(e.date)}
              </td>
              <td className="py-xxs pr-sm text-caption text-text-secondary">
                {e.sourceLabel}
                {e.reference ? ` · ${e.reference}` : ''}
                {e.memo ? (
                  <span className="text-text-tertiary"> · {e.memo}</span>
                ) : null}
              </td>
              <td className="py-xxs text-right tabular text-caption whitespace-nowrap text-text-primary">
                {parenNegative(e.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {truncated && (
        // Saying so beats an unqualified list that reads as complete.
        <p className="pt-xs text-overline text-text-tertiary">
          Showing the first {PAGE_LIMIT} of {data?.total} transactions.
        </p>
      )}
    </div>
  );
}

export default StatementLineDetail;
