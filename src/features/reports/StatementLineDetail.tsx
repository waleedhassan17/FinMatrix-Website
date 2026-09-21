import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { Skeleton } from '@/components/ui/Skeleton';
import type { ReportRange } from '@/models/reportPeriod';
import { getStatementLineEntries } from '@/networks/reports/profitLossNetwork';
import { formatShortDate } from '@/models/reportPeriod';
import { parenNegative } from '@/utils/money';

const PAGE_LIMIT = 50;

/**
 * Where the record behind a ledger row lives.
 *
 * Only sources that HAVE a page appear. A payment or a delivery leg leaves the
 * row as plain text rather than linking somewhere that cannot show it.
 */
const SOURCE_PATHS: Record<string, (id: string) => string> = {
  invoice: (id) => `/invoices/${id}`,
  invoice_void: (id) => `/invoices/${id}`,
  bill: (id) => `/bills/${id}`,
  bill_void: (id) => `/bills/${id}`,
  credit_memo: (id) => `/credit-memos/${id}`,
  credit_memo_void: (id) => `/credit-memos/${id}`,
  credit_memo_refund: (id) => `/credit-memos/${id}`,
  vendor_credit: (id) => `/vendor-credits/${id}`,
  vendor_credit_void: (id) => `/vendor-credits/${id}`,
  purchase_order: (id) => `/purchase-orders/${id}`,
  po_receipt: (id) => `/purchase-orders/${id}`,
  journal_entry: (id) => `/journal-entries/${id}`,
};

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
          {entries.map((e) => {
            const href = SOURCE_PATHS[e.sourceType]?.(e.sourceId);
            // The DOCUMENT leads, not the journal entry. Asked what is in Sales
            // Revenue, the answer is INV-2026-0001 for Acme Ltd — JE-005 names
            // the posting, which is not what anyone came for.
            const title = e.documentNumber || e.reference || e.sourceLabel;
            return (
              <tr key={e.id} className="align-top">
                <td className="py-xxs pr-sm text-caption whitespace-nowrap text-text-tertiary">
                  {formatShortDate(e.date)}
                </td>
                <td className="py-xxs pr-sm text-caption">
                  {href && e.sourceId ? (
                    <Link
                      to={href}
                      className="text-text-primary underline-offset-2 hover:text-primary hover:underline"
                    >
                      {title}
                    </Link>
                  ) : (
                    <span className="text-text-primary">{title}</span>
                  )}
                  {e.counterpartyName ? (
                    <span className="text-text-secondary"> · {e.counterpartyName}</span>
                  ) : null}
                  <span className="block text-overline text-text-tertiary">
                    {e.sourceLabel}
                    {e.memo ? ` · ${e.memo}` : ''}
                  </span>
                </td>
                <td className="py-xxs text-right tabular text-caption whitespace-nowrap text-text-primary">
                  {parenNegative(e.amount)}
                </td>
              </tr>
            );
          })}
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
