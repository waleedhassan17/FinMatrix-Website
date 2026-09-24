import { useMemo } from 'react';

import { Figure, FigureStrip } from '@/features/reports/FigureStrip';
import { bucketShares, formatShare, overduePartyCount } from '@/models/reportAging';
import type {
  AgingBucketDef,
  AgingRow,
  AgingTotals,
} from '@/serializers/reportSerializers';

export interface AgingSummaryProps {
  buckets: AgingBucketDef[];
  totals: AgingTotals;
  rows: AgingRow[];
  /** Not-yet-due and overdue, from the serializer helpers. */
  notDue: number;
  overdue: number;
  /** "customer" or "vendor", for the counts. */
  partyNoun: string;
}

/**
 * What the report adds up to, above the charts and the matrix that prove it.
 *
 * Four figures in one strip, divided by hairlines — the total, what is not yet
 * due, what is overdue, and what sits in the oldest bucket. Colour is kept for
 * the two figures where it is a fact (overdue, and badly overdue).
 */
export function AgingSummary({
  buckets,
  totals,
  rows,
  notDue,
  overdue,
  partyNoun,
}: AgingSummaryProps) {
  const shares = useMemo(() => bucketShares(buckets, totals), [buckets, totals]);

  const total = totals.total;
  const oldest = shares[shares.length - 1];
  const lateParties = overduePartyCount(rows, buckets);
  const plural = (n: number) => `${n} ${partyNoun}${n === 1 ? '' : 's'}`;

  return (
    <FigureStrip>
      <Figure label="Total outstanding" value={total} caption={plural(rows.length)} />
      <Figure
        label="Not yet due"
        value={notDue}
        caption={`${formatShare(total > 0 ? notDue / total : 0)} of the total`}
      />
      <Figure
        label="Overdue"
        value={overdue}
        tone={overdue > 0 ? 'warning' : 'default'}
        caption={`${formatShare(total > 0 ? overdue / total : 0)} · ${lateParties} of ${plural(rows.length)}`}
      />
      <Figure
        label="Most overdue"
        value={oldest?.amount ?? 0}
        tone={(oldest?.amount ?? 0) > 0 ? 'danger' : 'default'}
        caption={oldest ? `${oldest.label} · ${formatShare(oldest.share)}` : '—'}
      />
    </FigureStrip>
  );
}

export default AgingSummary;
