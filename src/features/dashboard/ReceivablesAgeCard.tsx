import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { PanelHeader, PanelLink } from '@/features/dashboard/PanelHeader';
import {
  LEGACY_AGING_BUCKETS,
  legacyAgingTotals,
  type AgingBucketDef,
  type AgingTrendPoint,
} from '@/serializers/reportSerializers';
import { rampSteps } from '@/theme/tokens';
import { compactMoney, formatMoney } from '@/utils/money';

/** `1–30 days`, `91+ days` — the bucket as a span of lateness. */
const bucketLabel = (b: AgingBucketDef): string => {
  if (b.minDays <= 0) return b.label;
  if (b.maxDays === null) return `${b.minDays}+ days`;
  return `${b.label} days`;
};

/**
 * How much customers owe, by how late it is — the question a dashboard asks of
 * receivables, where the headline figure only says how much.
 *
 * One stacked bar and a ledger of the same five buckets under it. The bar gives
 * the shape at a glance; the rows give the amounts, which is what anyone
 * chasing payment actually needs. Colour is the sequential aging ramp, light to
 * dark, so age reads without a legend — the same encoding as the full report.
 *
 * Built from the analytics payload's fixed classic buckets, which is why it
 * uses LEGACY_AGING_BUCKETS rather than the report's configurable ones.
 */
export function ReceivablesAgeCard({
  aging,
  loading,
  failed,
  onRetry,
}: {
  aging: AgingTrendPoint | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const buckets = LEGACY_AGING_BUCKETS;
  const ramp = rampSteps(buckets.length);

  const amounts = aging
    ? legacyAgingTotals({
        ...aging,
        total: 0,
      }).amounts
    : {};
  const values = buckets.map((b) => Math.max(0, amounts[b.key] ?? 0));
  const total = values.reduce((t, v) => t + v, 0);
  const overdue = total - values[0];

  let body;
  if (loading) {
    body = (
      <div className="flex flex-col gap-sm px-lg py-md">
        <Skeleton className="h-2.5 w-full rounded-full" />
        {buckets.map((b) => (
          <Skeleton key={b.key} className="h-4 w-full" />
        ))}
      </div>
    );
  } else if (failed) {
    body = (
      <div className="flex flex-col items-center gap-xs px-lg py-lg text-center">
        <p className="text-body-sm text-text-secondary">
          Receivables are unavailable right now.
        </p>
        <Button variant="text" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  } else if (total <= 0) {
    body = (
      <p className="px-lg py-md text-body-sm text-text-tertiary">
        No receivables outstanding.
      </p>
    );
  } else {
    body = (
      <div className="px-lg py-md">
        <div
          role="img"
          aria-label={`Receivables by age: ${buckets
            .map((b, i) => `${bucketLabel(b)} ${formatMoney(values[i])}`)
            .join(', ')}`}
          className="flex h-2.5 gap-px overflow-hidden rounded-full bg-neutral-100"
        >
          {values.map((v, i) =>
            v > 0 ? (
              <span
                key={buckets[i].key}
                className="h-full"
                // Width and colour are runtime values, so neither can be a class.
                style={{ width: `${(v / total) * 100}%`, backgroundColor: ramp[i] }}
              />
            ) : null,
          )}
        </div>

        <ul className="mt-md flex flex-col gap-xs">
          {buckets.map((b, i) => (
            <li key={b.key} className="flex items-center gap-xs">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: ramp[i] }}
              />
              <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">
                {bucketLabel(b)}
              </span>
              <span className="text-label-md tabular text-text-primary">
                {formatMoney(values[i])}
              </span>
              <span className="w-10 text-right text-caption tabular text-text-tertiary">
                {Math.round((values[i] / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <PanelHeader
        title="Receivables by age"
        description={
          !loading && !failed && total > 0
            ? `${compactMoney(total)} outstanding · ${compactMoney(overdue)} overdue`
            : undefined
        }
        action={<PanelLink to="/reports/ar-aging">Aging report</PanelLink>}
      />
      {body}
    </Card>
  );
}

export default ReceivablesAgeCard;
