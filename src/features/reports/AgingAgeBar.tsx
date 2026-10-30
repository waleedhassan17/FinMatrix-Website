import { bucketShares, formatShare } from '@/models/reportAging';
import type { AgingBucketDef, AgingTotals } from '@/serializers/reportSerializers';
import { AGING_RAMP, rampSteps } from '@/theme/tokens';

/**
 * The whole book in one bar: each age bucket's share of what is outstanding,
 * youngest to oldest on the same navy ramp as the charts — so a bar that ends
 * in a long dark run is a book of old money. The figures are in the chart and
 * the table; this is the shape at a glance.
 */
export function AgingAgeBar({ buckets, totals }: { buckets: AgingBucketDef[]; totals: AgingTotals }) {
  const shares = bucketShares(buckets, totals);
  if (totals.total <= 0) return null;
  const ramp = rampSteps(buckets.length, AGING_RAMP);
  const first = buckets[0]?.label;
  const last = buckets[buckets.length - 1]?.label;
  return (
    <div>
      <div
        role="img"
        aria-label={`By age: ${shares.map((s) => `${s.label} ${formatShare(s.share)}`).join(', ')}`}
        className="flex h-2 gap-[2px] overflow-hidden rounded-full"
      >
        {shares.map((s, i) =>
          s.share > 0 ? (
            <span
              key={s.key}
              title={`${s.label}: ${formatShare(s.share)}`}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${s.share * 100}%`, backgroundColor: ramp[i] }}
            />
          ) : null,
        )}
      </div>
      <p className="mt-[3px] flex justify-between text-caption text-text-tertiary" aria-hidden="true">
        <span>{first}</span>
        <span>{last}</span>
      </p>
    </div>
  );
}

export default AgingAgeBar;
