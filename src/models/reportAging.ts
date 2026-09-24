// ═══════════════════════════════════════════════════════
// FinMatrix Web — Aging report interaction logic
// ═══════════════════════════════════════════════════════
// Which parties a bucket contains, which rows a selection shows, and what order
// they go in. All of it pure, none of it in a component: a Recharts tooltip
// callback fires on every pointer move, and a jsdom test of a chart that renders
// nothing at zero size proves nothing. These functions carry the behaviour and
// are tested directly.
//
// THE CLIENT STILL NEVER FOOTS A COLUMN (see reportStatement.ts). Nothing here
// adds up money for display. `bucketTopParties` sums only the tail it folds away,
// which is a count-and-label concern, not a reported total. The table's footer
// keeps printing the server's figures — and it stays correct under a bucket
// filter for a reason worth stating plainly:
//
//   Filtering rows on `amounts[k] > 0` is TOTAL-PRESERVING for column k.
//   Every row it excludes contributes exactly 0 to that column, so the server's
//   `totals.amounts[k]` already IS the sum of the visible column.
//
// That is why selecting a bucket needs no recomputation, and why the other
// columns' footers must be relabelled rather than recalculated.

import type { AgingBucketDef, AgingRow } from '@/serializers/reportSerializers';

/**
 * How the party list is ordered.
 *
 * `oldest` is the collections order and the reason this control exists: the
 * server sorts by total descending, but the biggest debtor and the most urgent
 * debtor are rarely the same party. Money that has been outstanding longest is
 * the money at risk.
 */
export type AgingSort = 'oldest' | 'total' | 'name';

export const AGING_SORT_OPTIONS: readonly { value: AgingSort; label: string }[] = [
  { value: 'oldest', label: 'Oldest first' },
  { value: 'total', label: 'Largest first' },
  { value: 'name', label: 'Name (A–Z)' },
];

/**
 * What to sort by when the user has not said.
 *
 * Picking a bucket is an act of triage — the question just became "who is in
 * here", and within one bucket the useful order is by how much of it each party
 * holds. With no bucket picked the report is a summary again, and the largest
 * balance leads.
 */
export const defaultAgingSort = (selectedBucket: string | null): AgingSort =>
  selectedBucket ? 'oldest' : 'total';

/**
 * Drop a selected bucket that the current payload no longer describes.
 *
 * Bucket sets are configurable, so `d31to60` exists under `monthly` and does not
 * exist under `days3`. Without this guard, changing the preset while a bucket is
 * selected filters the table to zero rows underneath a chip naming a column that
 * is not on screen — the table looks empty and the report looks broken.
 */
export const resolveSelectedBucket = (
  selected: string | null,
  buckets: AgingBucketDef[],
): string | null =>
  selected && buckets.some((b) => b.key === selected) ? selected : null;

/** A counterparty's share of one bucket. */
export interface BucketParty {
  id: string;
  name: string;
  amount: number;
}

export interface BucketRanking {
  parties: BucketParty[];
  /** Parties past the limit. 0 when everything fitted. */
  moreCount: number;
  /** What those folded parties hold between them. */
  moreAmount: number;
}

/** Displayed when the server sends a party with no name. Never render blank. */
export const NO_PARTY_NAME = '(no name)';

/** The label for a party row. */
export const agingPartyLabel = (row: AgingRow): string =>
  row.customerName?.trim() || NO_PARTY_NAME;

/**
 * Can this row be drilled into?
 *
 * A party id is what the detail endpoint is addressed by, so a row without one
 * must not offer an expand affordance that could only fail. Rows like this are
 * not expected — the aging queries inner-join the party table — but the mobile
 * table already defends against a falsy id, so the possibility is real enough to
 * handle rather than assume away.
 */
export const canDrillParty = (row: AgingRow): boolean => Boolean(row.customerId);

/**
 * Who is in this bucket, biggest share first, with the tail folded.
 *
 * The fold is not cosmetic. A tooltip listing 3 of 40 parties without saying so
 * reads as the complete answer, and the reader would conclude the bucket is
 * three customers deep. `moreCount`/`moreAmount` keep it honest — same reasoning
 * as RankedBars' "Other (n)" row.
 */
export const bucketTopParties = ({
  rows,
  bucketKey,
  limit,
}: {
  rows: AgingRow[];
  bucketKey: string;
  limit: number;
}): BucketRanking => {
  const held = rows
    .map((row) => ({
      id: row.customerId,
      name: agingPartyLabel(row),
      amount: row.amounts[bucketKey] ?? 0,
    }))
    .filter((p) => p.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

  const parties = held.slice(0, limit);
  const tail = held.slice(limit);

  return {
    parties,
    moreCount: tail.length,
    moreAmount: tail.reduce((sum, p) => sum + p.amount, 0),
  };
};

/**
 * The sort key `oldest` ranks by.
 *
 * With a bucket selected it is that bucket — the user is inside one column and
 * wants it ordered. With none selected it is the genuinely oldest bucket, the
 * last one the server describes, because that is where the money at risk sits.
 * One comparator, two readings, no second sort name.
 */
const oldestSortKey = (
  buckets: AgingBucketDef[],
  selectedBucket: string | null,
): string | undefined =>
  selectedBucket ?? buckets[buckets.length - 1]?.key;

/**
 * The rows to show, filtered by the selected bucket and ordered by `sort`.
 *
 * Ties break explicitly rather than falling back to the order the server sent.
 * The server does sort by total descending today, so leaning on input order
 * would work — and would break silently, with no test failing, the first time
 * anything upstream reordered. An explicit comparator cannot drift.
 */
export const visibleAgingRows = ({
  rows,
  buckets,
  selectedBucket,
  sort,
  search = '',
}: {
  rows: AgingRow[];
  buckets: AgingBucketDef[];
  selectedBucket: string | null;
  sort: AgingSort;
  /** Narrows by party name, case-insensitively. Blank shows everyone. */
  search?: string;
}): AgingRow[] => {
  const term = search.trim().toLowerCase();
  const shown = rows.filter(
    (row) =>
      (!selectedBucket || (row.amounts[selectedBucket] ?? 0) > 0) &&
      (!term || agingPartyLabel(row).toLowerCase().includes(term)),
  );

  const byName = (a: AgingRow, b: AgingRow) =>
    agingPartyLabel(a).localeCompare(agingPartyLabel(b));
  const byTotal = (a: AgingRow, b: AgingRow) => b.total - a.total;

  const compare = (a: AgingRow, b: AgingRow): number => {
    if (sort === 'name') return byName(a, b) || byTotal(a, b);
    if (sort === 'total') return byTotal(a, b) || byName(a, b);

    const key = oldestSortKey(buckets, selectedBucket);
    const held = key
      ? (b.amounts[key] ?? 0) - (a.amounts[key] ?? 0)
      : 0;
    return held || byTotal(a, b) || byName(a, b);
  };

  // Copied before sorting: `rows` belongs to the query cache, and sorting it in
  // place would reorder what every other consumer of that cache entry sees.
  return [...shown].sort(compare);
};

// ─── The summary above the table ────────────────────────────────────────────
// Shares and counts for display. None of it foots a column: every amount here
// is one the server sent, and a share is that amount over the server's total.

/** One bucket's slice of the report. */
export interface BucketShare {
  key: string;
  label: string;
  amount: number;
  /** 0–1, of the report total. */
  share: number;
}

/** Every bucket with its share of the total, in the report's column order. */
export const bucketShares = (
  buckets: AgingBucketDef[],
  totals: { amounts: Record<string, number>; total: number },
): BucketShare[] =>
  buckets.map((b) => {
    const amount = totals.amounts[b.key] ?? 0;
    return {
      key: b.key,
      label: b.label,
      amount,
      share: totals.total > 0 ? amount / totals.total : 0,
    };
  });

/**
 * A share as the page prints it. A sliver that rounds to 0% is said as "<1%":
 * printing "0%" beside an amount that is not zero reads as a contradiction.
 */
export const formatShare = (share: number): string => {
  if (!(share > 0)) return '0%';
  if (share < 0.005) return '<1%';
  return `${Math.round(share * 100)}%`;
};

/** One bar of the top-parties chart. */
export interface TopAgingParty {
  id: string;
  name: string;
  /** The row's total, or its amount in the selected bucket. A server figure either way. */
  amount: number;
  /** The positive bucket amounts, in column order — what the bar is stacked from. */
  segments: { key: string; amount: number }[];
}

export interface TopAgingParties {
  parties: TopAgingParty[];
  /** Parties past the limit. 0 when everything fitted. */
  moreCount: number;
  /** What those folded parties hold between them. */
  moreAmount: number;
}

/**
 * The parties holding the most, each split by how late its money is.
 *
 * With no bucket selected this ranks by the row total and stacks every bucket,
 * so the bar answers "who owes the most, and how old is it". With one selected
 * it ranks by that bucket alone and draws only that segment: the chart follows
 * the table's filter instead of contradicting it, and bar length stays in step
 * with the figure beside it. The tail is folded, not dropped, for the reason
 * `bucketTopParties` gives.
 *
 * Only positive amounts become segments. A credit sitting in one bucket has no
 * length to draw; the figure printed beside the bar is still the server's total.
 */
export const topAgingParties = ({
  rows,
  buckets,
  selectedBucket,
  limit,
}: {
  rows: AgingRow[];
  buckets: AgingBucketDef[];
  selectedBucket: string | null;
  limit: number;
}): TopAgingParties => {
  const keys = selectedBucket ? [selectedBucket] : buckets.map((b) => b.key);

  const held = rows
    .map((row) => ({
      id: row.customerId,
      name: agingPartyLabel(row),
      amount: selectedBucket ? (row.amounts[selectedBucket] ?? 0) : row.total,
      segments: keys
        .map((key) => ({ key, amount: row.amounts[key] ?? 0 }))
        .filter((s) => s.amount > 0),
    }))
    .filter((p) => p.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

  const tail = held.slice(limit);
  return {
    parties: held.slice(0, limit),
    moreCount: tail.length,
    moreAmount: tail.reduce((sum, p) => sum + p.amount, 0),
  };
};

/**
 * How many parties hold anything past its due date — a count of rows, never a
 * sum. "Overdue" follows the bucket spec (every bucket starting at day 1 or
 * later), exactly as `overdueTotal` does, so the two cannot disagree.
 */
export const overduePartyCount = (rows: AgingRow[], buckets: AgingBucketDef[]): number => {
  const late = buckets.filter((b) => b.minDays > 0).map((b) => b.key);
  return rows.filter((row) => late.some((k) => (row.amounts[k] ?? 0) > 0)).length;
};
