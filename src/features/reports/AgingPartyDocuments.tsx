import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { Skeleton } from '@/components/ui/Skeleton';
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

/** The frame every state shares, so the panel does not jump as it loads. */
const FRAME = 'ml-xl border-l-2 border-border-light py-xs pl-md';

/**
 * How late, in words.
 *
 * `daysOverdue` arrives signed, so a document not yet due is negative and one
 * due today is zero. Saying "0 days overdue" for a document due this afternoon
 * is the kind of true-but-wrong that makes a report feel careless.
 */
const lateness = (days: number): string => {
  if (days < 0) return `Due in ${-days} day${days === -1 ? '' : 's'}`;
  if (days === 0) return 'Due today';
  return `${days} day${days === 1 ? '' : 's'} overdue`;
};

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
  const query = useQuery({
    queryKey: ['reports', 'aging-party', partyType, partyId, params],
    queryFn: () =>
      partyType === 'vendor'
        ? getApAgingPartyDocuments(partyId, { ...params, limit: PAGE_LIMIT })
        : getArAgingPartyDocuments(partyId, { ...params, limit: PAGE_LIMIT }),
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

  const data = query.data;
  const documents = data?.documents ?? [];
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

  const truncated = (data?.total ?? 0) > documents.length;

  return (
    <div className={FRAME}>
      <table className="w-full border-collapse">
        <tbody>
          {documents.map((d: AgingPartyDocument) => {
            const href = DOCUMENT_PATHS[d.documentType]?.(d.documentId);
            return (
              <tr key={d.documentId} className="align-baseline">
                <td className="py-xxs pr-sm text-caption whitespace-nowrap text-text-tertiary">
                  {formatShortDate(d.dueDate)}
                </td>
                <td className="py-xxs pr-sm text-body-sm text-text-primary">
                  {href && d.documentId ? (
                    <Link
                      to={href}
                      className="text-text-primary underline-offset-2 hover:text-primary hover:underline"
                    >
                      {d.documentNumber || d.documentId}
                    </Link>
                  ) : (
                    <span>{d.documentNumber || '—'}</span>
                  )}
                </td>
                <td className="py-xxs pr-sm text-caption whitespace-nowrap text-text-secondary">
                  {d.bucketLabel}
                </td>
                <td
                  className={`py-xxs pr-sm text-caption whitespace-nowrap ${
                    d.daysOverdue > 0 ? 'text-danger' : 'text-text-tertiary'
                  }`}
                >
                  {lateness(d.daysOverdue)}
                </td>
                <td className="py-xxs text-right tabular text-body-sm whitespace-nowrap text-text-primary">
                  {formatAmount(d.balance)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {truncated && (
        <p className="mt-xxs text-caption text-text-tertiary">
          {/* Said out loud. A list that silently stops reads as complete, and
              the reader would conclude the balance is smaller than it is. */}
          Showing {documents.length} of {data?.total} open {noun}.
        </p>
      )}
    </div>
  );
}

export default AgingPartyDocuments;
