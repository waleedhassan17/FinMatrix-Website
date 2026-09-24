import { useMemo } from 'react';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { topAgingParties, type TopAgingParty } from '@/models/reportAging';
import type { AgingBucketDef, AgingRow } from '@/serializers/reportSerializers';
import { AGING_RAMP, rampSteps } from '@/theme/tokens';
import { formatAmount, formatMoney } from '@/utils/money';

/** How many parties get a bar before the rest fold into one line. */
const PARTY_LIMIT = 10;

export interface AgingTopPartiesProps {
  buckets: AgingBucketDef[];
  rows: AgingRow[];
  selectedBucket: string | null;
  /** "customer" or "vendor". */
  partyNoun: string;
  /** Show this party in the table below. */
  onFindParty: (party: TopAgingParty) => void;
  className?: string;
}

/**
 * Who holds the most, and how old it is.
 *
 * One horizontal bar per party, largest first, stacked by bucket in the same
 * sequential ramp as the period chart beside it — so a bar that ends dark is a
 * party whose money is old, and the eye finds it without reading a figure. The
 * period chart answers "how late is the book"; this answers "who is it", which
 * is the question a collections call starts from.
 *
 * Drawn in HTML rather than an SVG chart: every row is a real button (select one
 * and the table narrows to that party with its documents open), names truncate
 * cleanly at any width, and nothing has to be measured before it can render.
 *
 * With a period selected the ranking follows it, and each bar is that period's
 * amount alone — the chart agrees with the filtered table instead of arguing.
 */
export function AgingTopParties({
  buckets,
  rows,
  selectedBucket,
  partyNoun,
  onFindParty,
  className,
}: AgingTopPartiesProps) {
  const top = useMemo(
    () => topAgingParties({ rows, buckets, selectedBucket, limit: PARTY_LIMIT }),
    [rows, buckets, selectedBucket],
  );

  const ramp = rampSteps(buckets.length, AGING_RAMP);
  const colourOf = new Map(buckets.map((b, i) => [b.key, ramp[i]]));
  const labelOf = new Map(buckets.map((b) => [b.key, b.label]));
  const selectedLabel = selectedBucket ? labelOf.get(selectedBucket) : undefined;

  // Bars share one scale: the longest bar is the largest party's drawn length.
  const extent = (p: TopAgingParty) => p.segments.reduce((t, s) => t + s.amount, 0);
  const scale = Math.max(0, ...top.parties.map(extent));
  const width = (amount: number) => `${scale > 0 ? (amount / scale) * 100 : 0}%`;

  const plural = `${partyNoun}s`;

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="items-center">
        <div className="min-w-0">
          <CardTitle className="text-h5">
            Top {plural}
            {selectedLabel && <span className="text-text-tertiary"> · {selectedLabel}</span>}
          </CardTitle>
          <CardDescription className="mt-[2px] text-caption text-text-tertiary">
            {selectedLabel
              ? `Largest amounts in ${selectedLabel}`
              : 'Largest balances, split by age'}
          </CardDescription>
        </div>
      </CardHeader>

      {top.parties.length === 0 ? (
        <p className="flex-1 px-lg py-lg text-body-sm text-text-tertiary">
          No {partyNoun} has anything in {selectedLabel ?? 'this report'}.
        </p>
      ) : (
        <ol className="flex flex-1 flex-col px-sm py-xs">
          {top.parties.map((p) => (
            <li key={p.id || p.name} className="relative">
              <button
                type="button"
                onClick={() => onFindParty(p)}
                aria-label={`${p.name}, ${formatMoney(p.amount)}. Show in the table`}
                className="group grid w-full grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_auto] items-center gap-sm rounded-md px-sm py-[7px] text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto]"
              >
                <span className="truncate text-body-sm text-text-primary">{p.name}</span>

                <span aria-hidden="true" className="flex h-3 min-w-0">
                  {p.segments.map((s) => (
                    <span
                      key={s.key}
                      // A hairline in the card colour between segments, so two
                      // neighbouring steps of the ramp still read as two.
                      className="h-full min-w-[2px] border-r border-surface first:rounded-l-[2px] last:rounded-r-[2px] last:border-r-0"
                      style={{ width: width(s.amount), backgroundColor: colourOf.get(s.key) }}
                    />
                  ))}
                </span>

                <span className="text-label-md tabular text-text-primary">
                  {formatAmount(p.amount)}
                </span>

                {/* The split, on hover or keyboard focus. Decorative to
                    assistive tech: the table row carries the same figures. */}
                {!selectedBucket && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-sm top-full z-30 mt-[-2px] hidden w-60 rounded-md border border-border bg-surface p-sm shadow-md group-hover:block group-focus-visible:block"
                  >
                    <span className="block truncate text-label-sm text-text-primary">{p.name}</span>
                    <span className="my-xxs block h-px bg-border-light" />
                    {p.segments.map((s) => (
                      <span
                        key={s.key}
                        className="flex items-center justify-between gap-sm text-caption"
                      >
                        <span className="flex min-w-0 items-center gap-xs text-text-secondary">
                          <span
                            className="size-2 shrink-0 rounded-[2px]"
                            style={{ backgroundColor: colourOf.get(s.key) }}
                          />
                          <span className="truncate">{labelOf.get(s.key)}</span>
                        </span>
                        <span className="shrink-0 tabular text-text-primary">
                          {formatAmount(s.amount)}
                        </span>
                      </span>
                    ))}
                    <span className="mt-xxs block text-caption text-text-tertiary">
                      Select to show in the table
                    </span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-md gap-y-xs border-t border-border-light px-lg py-sm">
        <span className="text-caption tabular text-text-tertiary">
          {top.moreCount > 0
            ? `+${top.moreCount} more ${top.moreCount === 1 ? partyNoun : plural} · ${formatAmount(top.moreAmount)}`
            : top.parties.length > 0
              ? `${top.parties.length} ${top.parties.length === 1 ? partyNoun : plural}${
                  selectedLabel ? ` in ${selectedLabel}` : ' with a balance'
                }`
              : ''}
        </span>

        {/* The key: the ramp runs newest to oldest. */}
        {buckets.length > 1 && (
          <span className="flex items-center gap-xs text-caption text-text-tertiary">
            {buckets[0].label}
            <span aria-hidden="true" className="flex h-2 w-16 overflow-hidden rounded-full">
              {ramp.map((c, i) => (
                <span key={i} className="h-full flex-1" style={{ backgroundColor: c }} />
              ))}
            </span>
            {buckets[buckets.length - 1].label}
          </span>
        )}
      </div>
    </Card>
  );
}

export default AgingTopParties;
