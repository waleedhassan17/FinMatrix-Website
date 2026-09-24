import { describe, expect, it } from 'vitest';

import {
  AGING_SORT_OPTIONS,
  NO_PARTY_NAME,
  agingPartyLabel,
  bucketShares,
  bucketTopParties,
  canDrillParty,
  defaultAgingSort,
  formatShare,
  overduePartyCount,
  resolveSelectedBucket,
  topAgingParties,
  visibleAgingRows,
} from '@/models/reportAging';
import type { AgingBucketDef, AgingRow } from '@/serializers/reportSerializers';

/** The classic monthly set, oldest last — the order the server sends. */
const BUCKETS: AgingBucketDef[] = [
  { key: 'current', label: 'Current', minDays: 0, maxDays: 0 },
  { key: 'd1to30', label: '1–30', minDays: 1, maxDays: 30 },
  { key: 'd31to60', label: '31–60', minDays: 31, maxDays: 60 },
  { key: 'd61plus', label: '61 and over', minDays: 61, maxDays: null },
];

const row = (
  id: string,
  name: string,
  amounts: Record<string, number>,
): AgingRow => ({
  customerId: id,
  customerName: name,
  amounts,
  total: Object.values(amounts).reduce((t, v) => t + v, 0),
  current: 0,
  bucket1to30: 0,
  bucket31to60: 0,
  bucket61to90: 0,
  bucket90Plus: 0,
});

// Allama is the biggest debtor; Sukoon holds the oldest money. That divergence
// is the entire reason the sort control exists, so every fixture keeps it.
const ALLAMA = row('c1', 'Allama Traders', { current: 500, d1to30: 300 });
const METRO = row('c2', 'Metro Foods', { d1to30: 200, d31to60: 150 });
const SUKOON = row('c3', 'Sukoon Mart', { d61plus: 90 });
const ROWS = [ALLAMA, METRO, SUKOON];

describe('defaultAgingSort', () => {
  it('triages by age once a bucket is picked, and by size otherwise', () => {
    expect(defaultAgingSort('d31to60')).toBe('oldest');
    expect(defaultAgingSort(null)).toBe('total');
  });
});

describe('resolveSelectedBucket', () => {
  it('keeps a key the payload still describes', () => {
    expect(resolveSelectedBucket('d31to60', BUCKETS)).toBe('d31to60');
  });

  it('drops a key the payload no longer describes', () => {
    // Switching preset from monthly to days3 retires `d31to60`. Left in place it
    // would filter the table to nothing under a chip naming a missing column.
    expect(resolveSelectedBucket('d31to60', [BUCKETS[0]])).toBeNull();
  });

  it('passes null through', () => {
    expect(resolveSelectedBucket(null, BUCKETS)).toBeNull();
  });
});

describe('agingPartyLabel / canDrillParty', () => {
  it('never renders a blank name', () => {
    expect(agingPartyLabel(row('c9', '', {}))).toBe(NO_PARTY_NAME);
    expect(agingPartyLabel(row('c9', '   ', {}))).toBe(NO_PARTY_NAME);
    expect(agingPartyLabel(ALLAMA)).toBe('Allama Traders');
  });

  it('refuses to offer a drill-down with no party id to address', () => {
    expect(canDrillParty(ALLAMA)).toBe(true);
    expect(canDrillParty(row('', 'Ghost', { d1to30: 10 }))).toBe(false);
  });
});

describe('bucketTopParties', () => {
  it('ranks the parties holding the bucket, biggest share first', () => {
    const { parties, moreCount, moreAmount } = bucketTopParties({
      rows: ROWS,
      bucketKey: 'd1to30',
      limit: 5,
    });
    expect(parties.map((p) => p.name)).toEqual(['Allama Traders', 'Metro Foods']);
    expect(parties.map((p) => p.amount)).toEqual([300, 200]);
    expect(moreCount).toBe(0);
    expect(moreAmount).toBe(0);
  });

  it('excludes parties with nothing in the bucket', () => {
    const { parties } = bucketTopParties({
      rows: ROWS,
      bucketKey: 'd61plus',
      limit: 5,
    });
    expect(parties.map((p) => p.name)).toEqual(['Sukoon Mart']);
  });

  it('folds the tail and accounts for every party it hides', () => {
    // A tooltip showing 2 of 5 without saying so reads as the whole answer.
    const many = [
      row('a', 'A', { d1to30: 50 }),
      row('b', 'B', { d1to30: 40 }),
      row('c', 'C', { d1to30: 30 }),
      row('d', 'D', { d1to30: 20 }),
      row('e', 'E', { d1to30: 10 }),
    ];
    const { parties, moreCount, moreAmount } = bucketTopParties({
      rows: many,
      bucketKey: 'd1to30',
      limit: 2,
    });
    expect(parties.map((p) => p.name)).toEqual(['A', 'B']);
    expect(moreCount).toBe(3);
    expect(moreAmount).toBe(60);
    // The ranking accounts for the bucket in full: shown + folded == the column.
    const shown = parties.reduce((t, p) => t + p.amount, 0);
    expect(shown + moreAmount).toBe(150);
  });

  it('is empty for a bucket nobody holds', () => {
    expect(
      bucketTopParties({ rows: ROWS, bucketKey: 'current', limit: 5 }).parties,
    ).toHaveLength(1);
    expect(
      bucketTopParties({ rows: [SUKOON], bucketKey: 'current', limit: 5 }),
    ).toEqual({ parties: [], moreCount: 0, moreAmount: 0 });
  });
});

describe('visibleAgingRows', () => {
  it('shows every row when no bucket is selected', () => {
    const out = visibleAgingRows({
      rows: ROWS,
      buckets: BUCKETS,
      selectedBucket: null,
      sort: 'total',
    });
    expect(out).toHaveLength(3);
  });

  it('filters to the parties holding the selected bucket', () => {
    const out = visibleAgingRows({
      rows: ROWS,
      buckets: BUCKETS,
      selectedBucket: 'd31to60',
      sort: 'total',
    });
    // Allama's money is all newer; Sukoon's is all older. Only Metro is in 31–60.
    expect(out.map((r) => r.customerName)).toEqual(['Metro Foods']);
  });

  it('is total-preserving for the selected column', () => {
    // The invariant the table footer depends on: the rows it hides contribute
    // exactly 0 to that column, so the server's total is still the visible sum.
    const key = 'd1to30';
    const all = ROWS.reduce((t, r) => t + (r.amounts[key] ?? 0), 0);
    const shown = visibleAgingRows({
      rows: ROWS,
      buckets: BUCKETS,
      selectedBucket: key,
      sort: 'total',
    }).reduce((t, r) => t + (r.amounts[key] ?? 0), 0);
    expect(shown).toBe(all);
  });

  it('ranks by the oldest bucket when nothing is selected', () => {
    const out = visibleAgingRows({
      rows: ROWS,
      buckets: BUCKETS,
      selectedBucket: null,
      sort: 'oldest',
    });
    // Sukoon leads on age despite being the smallest balance — the whole point.
    expect(out.map((r) => r.customerName)).toEqual([
      'Sukoon Mart',
      'Allama Traders',
      'Metro Foods',
    ]);
  });

  it('ranks by the SELECTED bucket when one is selected', () => {
    const out = visibleAgingRows({
      rows: ROWS,
      buckets: BUCKETS,
      selectedBucket: 'd1to30',
      sort: 'oldest',
    });
    expect(out.map((r) => r.customerName)).toEqual([
      'Allama Traders',
      'Metro Foods',
    ]);
  });

  it('ranks by total, largest first', () => {
    const out = visibleAgingRows({
      rows: ROWS,
      buckets: BUCKETS,
      selectedBucket: null,
      sort: 'total',
    });
    expect(out.map((r) => r.customerName)).toEqual([
      'Allama Traders',
      'Metro Foods',
      'Sukoon Mart',
    ]);
  });

  it('ranks by name', () => {
    const out = visibleAgingRows({
      rows: [SUKOON, ALLAMA, METRO],
      buckets: BUCKETS,
      selectedBucket: null,
      sort: 'name',
    });
    expect(out.map((r) => r.customerName)).toEqual([
      'Allama Traders',
      'Metro Foods',
      'Sukoon Mart',
    ]);
  });

  it('breaks ties deterministically rather than trusting input order', () => {
    // Equal totals, given in reverse alphabetical order. Relying on the server's
    // ordering would pass today and break silently if it ever changed.
    const tied = [
      row('z', 'Zeta', { d1to30: 100 }),
      row('a', 'Alpha', { d1to30: 100 }),
    ];
    expect(
      visibleAgingRows({
        rows: tied,
        buckets: BUCKETS,
        selectedBucket: null,
        sort: 'total',
      }).map((r) => r.customerName),
    ).toEqual(['Alpha', 'Zeta']);
    expect(
      visibleAgingRows({
        rows: tied,
        buckets: BUCKETS,
        selectedBucket: 'd1to30',
        sort: 'oldest',
      }).map((r) => r.customerName),
    ).toEqual(['Alpha', 'Zeta']);
  });

  it('does not mutate the callers array', () => {
    // `rows` belongs to the query cache; sorting in place would reorder it for
    // every other consumer of that cache entry.
    const input = [SUKOON, ALLAMA, METRO];
    const before = [...input];
    visibleAgingRows({
      rows: input,
      buckets: BUCKETS,
      selectedBucket: null,
      sort: 'name',
    });
    expect(input).toEqual(before);
  });

  it('survives an empty bucket spec', () => {
    const out = visibleAgingRows({
      rows: ROWS,
      buckets: [],
      selectedBucket: null,
      sort: 'oldest',
    });
    expect(out).toHaveLength(3);
  });
});

describe('AGING_SORT_OPTIONS', () => {
  it('offers exactly the three sorts the type allows', () => {
    expect(AGING_SORT_OPTIONS.map((o) => o.value)).toEqual([
      'oldest',
      'total',
      'name',
    ]);
  });
});

describe('visibleAgingRows — finding a party by name', () => {
  const find = (search: string, selectedBucket: string | null = null) =>
    visibleAgingRows({ rows: ROWS, buckets: BUCKETS, selectedBucket, sort: 'name', search })
      .map((r) => r.customerId);

  it('matches any part of the name, whatever the case', () => {
    expect(find('foods')).toEqual(['c2']);
    expect(find('  MART ')).toEqual(['c3']);
  });

  it('shows everyone for a blank search', () => {
    expect(find('')).toEqual(['c1', 'c2', 'c3']);
  });

  it('combines with a bucket filter rather than replacing it', () => {
    // Allama and Metro both hold 1–30; only Metro is a "Foods".
    expect(find('foods', 'd1to30')).toEqual(['c2']);
    expect(find('allama', 'd31to60')).toEqual([]);
  });
});

describe('bucketShares', () => {
  it('gives each bucket its share of the server total, in column order', () => {
    const shares = bucketShares(BUCKETS, {
      amounts: { current: 500, d1to30: 500, d31to60: 0, d61plus: 0 },
      total: 1000,
    });
    expect(shares.map((s) => [s.key, s.amount, s.share])).toEqual([
      ['current', 500, 0.5],
      ['d1to30', 500, 0.5],
      ['d31to60', 0, 0],
      ['d61plus', 0, 0],
    ]);
  });

  it('reads 0 rather than dividing by a zero total', () => {
    expect(bucketShares(BUCKETS, { amounts: {}, total: 0 }).every((s) => s.share === 0)).toBe(
      true,
    );
  });
});

describe('formatShare', () => {
  it('never prints 0% beside an amount that is not zero', () => {
    expect(formatShare(0.001)).toBe('<1%');
    expect(formatShare(0)).toBe('0%');
    expect(formatShare(0.524)).toBe('52%');
    expect(formatShare(1)).toBe('100%');
  });
});

describe('overduePartyCount', () => {
  it('counts parties holding anything past its due date', () => {
    // Allama and Metro hold 1–30 or later; Sukoon holds 61+. All three.
    expect(overduePartyCount(ROWS, BUCKETS)).toBe(3);
    expect(overduePartyCount([row('c9', 'Early Bird', { current: 10 })], BUCKETS)).toBe(0);
  });
});

describe('topAgingParties', () => {
  it('ranks by total and stacks every positive bucket, in column order', () => {
    const top = topAgingParties({ rows: ROWS, buckets: BUCKETS, selectedBucket: null, limit: 10 });
    expect(top.parties.map((p) => p.name)).toEqual(['Allama Traders', 'Metro Foods', 'Sukoon Mart']);
    expect(top.parties[0]).toEqual({
      id: 'c1',
      name: 'Allama Traders',
      amount: 800,
      segments: [
        { key: 'current', amount: 500 },
        { key: 'd1to30', amount: 300 },
      ],
    });
    expect(top.moreCount).toBe(0);
  });

  it('follows a selected bucket: ranks by it, draws only it, drops who holds none', () => {
    const top = topAgingParties({ rows: ROWS, buckets: BUCKETS, selectedBucket: 'd1to30', limit: 10 });
    expect(top.parties.map((p) => [p.name, p.amount])).toEqual([
      ['Allama Traders', 300],
      ['Metro Foods', 200],
    ]);
    expect(top.parties[1].segments).toEqual([{ key: 'd1to30', amount: 200 }]);
  });

  it('folds the tail instead of dropping it', () => {
    const top = topAgingParties({ rows: ROWS, buckets: BUCKETS, selectedBucket: null, limit: 1 });
    expect(top.parties).toHaveLength(1);
    expect(top.moreCount).toBe(2);
    expect(top.moreAmount).toBe(350 + 90);
  });

  it('leaves out a credit balance, which has no length to draw', () => {
    const credit = row('c8', 'Refund Due', { current: -40 });
    const top = topAgingParties({ rows: [credit, SUKOON], buckets: BUCKETS, selectedBucket: null, limit: 10 });
    expect(top.parties.map((p) => p.name)).toEqual(['Sukoon Mart']);
  });
});
