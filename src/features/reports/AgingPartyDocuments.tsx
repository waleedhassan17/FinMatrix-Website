import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { Skeleton } from '@/components/ui/Skeleton';
import { latenessLabel } from '@/models/partySummary';
import { formatShortDate } from '@/models/reportPeriod';
import {
  getApAgingPartyDocuments,
  getArAgingPartyDocuments,
  type AgingDetailParams,
} from '@/networks/reports/agingNetwork';
import type { AgingPartyDocument } from '@/serializers/reportSerializers';
import { formatAmount } from '@/utils/money';

const PAGE_LIMIT = 50;

/**
 * Where the document behind an aging row lives.
 *
 * Only the two kinds an aging report can produce, because only invoices and
 * bills carry an open balance. Keyed on `documentType` exactly as the P&L
 * drill-down keys on `sourceType`.
 */
const DOCUMENT_PATHS: Record<string, (id: string) => string> = {
  invoice: (id) => `/invoices/${id}`,
  bill: (id) => `/bills/${id}`,
};

/**
 * The frame every state shares, so the panel does not jump as it loads: a
 * recessed band under the row, indented to the name it belongs to, with a rule
 * on the left tying it to that row.
 */
const FRAME = 'bg-surface-2 py-sm pl-[2.75rem] pr-md';

export interface AgingPartyDocumentsProps {
  partyId: string;
  partyType: 'customer' | 'vendor';
  /** The bucket spec the report is showing. Must be passed through. */
  params: AgingDetailParams;
  /**
   * The figure on the row this sits under — the row total, or that row's amount
   * in the selected bucket. For the dev-only reconcile check.
   */
  rowAmount?: number;
  /** Labels the empty state honestly. */
  bucketLabel?: string;
}

/**
 * The open documents behind one aging row, drawn underneath it.
 *
 * These figures are SHOWN, never summed back into the report — the client never
 * foots a column. What this does do is warn a developer, in dev only, when the
 * documents it was handed disagree with the row they sit under. That is a real
 * defect and an invisible one: the row would still be right and the detail
 * beneath it wrong, which is exactly how a drill-down loses people's trust in a
 * report that is actually correct.
 *
 * Fetched per party and cached by React Query, so reopening a row costs nothing.
 * The bucket spec is in the key, so changing preset refetches rather than
 * showing documents labelled with columns that are no longer on screen.
 */
export function AgingPartyDocuments({
  partyId,
  partyType,
  params,
  rowAmount,
  bucketLabel,
}: AgingPartyDocumentsProps) {
  // Paged: "Load more" fetches the next page. A party with more open
  // documents than one page used to end at "Showing 50 of N".
  const query = useInfiniteQuery({
    queryKey: ['reports', 'aging-party', partyType, partyId, params],
    queryFn: ({ pageParam }) =>
      partyType === 'vendor'
        ? getApAgingPartyDocuments(partyId, { ...params, limit: PAGE_LIMIT, page: pageParam })
        : getArAgingPartyDocuments(partyId, { ...params, limit: PAGE_LIMIT, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, all) =>
      all.reduce((n, p) => n + p.documents.length, 0) < last.total && last.documents.length > 0
        ? all.length + 1
        : undefined,
  });

  if (query.isLoading) {
    return (
      <div className={FRAME}>
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-xs h-4 w-1/2" />
      </div>
    );
  }

  if (query.error) {
    return (
      <div className={FRAME}>
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

  const data = query.data?.pages[0];
  const documents = query.data?.pages.flatMap((p) => p.documents) ?? [];
  const noun = partyType === 'vendor' ? 'bills' : 'invoices';

  if (documents.length === 0) {
    return (
      <div className={FRAME}>
        <p className="text-caption text-text-tertiary">
          {/* A filtered empty is a different fact from an unfiltered one, and
              conflating them reads as "this party owes nothing". */}
          {bucketLabel
            ? `Nothing in ${bucketLabel} for this ${partyType}.`
            : `No open ${noun}.`}
        </p>
      </div>
    );
  }

  if (import.meta.env.DEV && rowAmount !== undefined) {
    const shown = documents.reduce((t, d) => t + d.balance, 0);
    const complete = documents.length >= (data?.total ?? 0);
    if (complete && Math.abs(shown - rowAmount) > 0.01) {
      console.warn(
        `[reports] Aging drill-down ${partyType} ${partyId}: documents sum to ` +
          `${shown} but the row reports ${rowAmount}. Showing the server figure.`,
      );
    }
  }

  const docHeader = partyType === 'vendor' ? 'Bill' : 'Invoice';

  return (
    <div className={FRAME}>
      <table className="w-full border-collapse border-l-2 border-primary-200">
        <thead>
          <tr className="border-b border-border-light">
            <th className="py-xxs pl-sm pr-sm text-left text-overline text-text-tertiary">{docHeader}</th>
            <th className="py-xxs pr-sm text-left text-overline text-text-tertiary">Due</th>
            <th className="py-xxs pr-sm text-left text-overline text-text-tertiary">Period</th>
            <th className="py-xxs pr-sm text-left text-overline text-text-tertiary">Age</th>
            <th className="py-xxs text-right text-overline text-text-tertiary">Balance</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((d: AgingPartyDocument) => {
            const href = DOCUMENT_PATHS[d.documentType]?.(d.documentId);
            return (
              <tr key={d.documentId} className="align-baseline">
                <td className="py-xxs pl-sm pr-sm text-body-sm text-text-primary">
                  {href && d.documentId ? (
                    <Link
                      to={href}
                      className="text-label-md text-primary underline-offset-4 hover:underline"
                    >
                      {d.documentNumber || d.documentId}
                    </Link>
                  ) : (
                    <span>{d.documentNumber || '—'}</span>
                  )}
                </td>
                <td className="py-xxs pr-sm text-caption whitespace-nowrap text-text-secondary">
                  {formatShortDate(d.dueDate)}
                </td>
                <td className="py-xxs pr-sm text-caption whitespace-nowrap text-text-secondary">
                  {d.bucketLabel}
                </td>
                <td
                  className={`py-xxs pr-sm text-caption whitespace-nowrap ${
                    d.daysOverdue > 0 ? 'text-danger' : 'text-text-tertiary'
                  }`}
                >
                  {latenessLabel(d.daysOverdue)}
                </td>
                <td className="py-xxs text-right tabular text-body-sm whitespace-nowrap text-text-primary">
                  {formatAmount(d.balance)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Said out loud. A list that silently stops reads as complete, and
          the reader would conclude the balance is smaller than it is. */}
      {query.hasNextPage && (
        <div className="mt-xxs flex items-center gap-sm pl-sm">
          <p className="text-caption text-text-tertiary tabular">
            Showing {documents.length} of {data?.total} open {noun}.
          </p>
          <button
            type="button"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="text-label-sm text-primary hover:underline disabled:opacity-50"
          >
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}

export default AgingPartyDocuments;
