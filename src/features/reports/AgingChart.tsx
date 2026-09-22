import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { cn } from '@/lib/cn';
import { bucketTopParties, type BucketRanking } from '@/models/reportAging';
import type {
  AgingBucketDef,
  AgingRow,
  AgingTotals,
} from '@/serializers/reportSerializers';
import { AGING_RAMP, colors, rampSteps, typography } from '@/theme/tokens';
import { compactMoney, formatMoney } from '@/utils/money';

// Hoisted because SVG <text> needs a numeric size, not a class — and reading it
// from the typography role is what keeps `fontSize: 12` out of the file, which the
// design-token gate bans outright.
const AXIS_TICK = {
  fill: colors.textTertiary,
  fontSize: typography.caption.fontSize,
} as const;

/** How many parties a tooltip names before folding the rest into "+N more". */
const TOOLTIP_PARTY_LIMIT = 5;

/** Unselected bars keep their ramp step and lose contrast. See the docblock. */
const DIMMED = 0.35;

interface Datum {
  /** The stable bucket key. Two custom boundaries can share a label; keys cannot. */
  key: string;
  label: string;
  value: number;
}

export interface AgingChartProps {
  /** Column order and headings, from the payload. */
  buckets: AgingBucketDef[];
  totals: AgingTotals;
  /**
   * The per-party rows behind those totals. Supplying them turns the tooltip
   * from "how much" into "how much, and who" — everything below is optional
   * because the analytics dashboard renders a fixed legacy snapshot that has no
   * rows in existence, and must keep compiling and rendering unchanged.
   */
  rows?: AgingRow[];
  selectedBucket?: string | null;
  /** Supplying this makes the bars a control. Omit it and the chart is inert. */
  onSelectBucket?: (key: string | null) => void;
}

/**
 * How much is owed, by how late it is.
 *
 * **Absolute amounts, one bar per bucket.** The app draws a stacked column
 * normalised to its own total, so every bar is full height and the chart shows the
 * MIX rather than the magnitude — two months with wildly different balances look
 * identical. For a single period that is worse than useless, because the question
 * being asked is "how much is badly overdue", not "what proportion".
 *
 * Colour is a SEQUENTIAL ramp, light to dark, so age reads off the chart without
 * consulting a legend. It used to be CHART_SERIES, which is categorical — five
 * hues chosen to be told APART, for series that have an identity. Aging buckets
 * do not have an identity, they have an ORDER: swapping "1–30" with "61–90"
 * would change the meaning, and that is what lightness encodes and hue cannot.
 *
 * The ramp is also what lets the chart scale. Buckets are configurable now and
 * run from five to fourteen; five fixed hues would have wrapped and painted two
 * different ages the same colour.
 *
 * **Selection dims, it never repaints.** A selected bucket keeps every bar on its
 * own ramp step and drops the others' opacity. Recolouring the survivors of a
 * filter would make colour follow the selection instead of the age it encodes,
 * and the reader would lose the one thing the ramp is for. The selection is also
 * stated in words above the table, so it is never carried by contrast alone —
 * and the table's column headers select the same buckets, which is the keyboard
 * route to a filter that a click on an SVG rectangle cannot offer.
 */
export function AgingChart({
  buckets,
  totals,
  rows,
  selectedBucket = null,
  onSelectBucket,
}: AgingChartProps) {
  const data: Datum[] = buckets.map(({ key, label }) => ({
    key,
    label,
    value: totals.amounts[key] ?? 0,
  }));

  // Ranked once per payload, not per pointer move: the tooltip's content
  // callback fires on every mousemove across the plot, and re-sorting every
  // party on each frame is work nobody asked for.
  const rankings = useMemo(() => {
    if (!rows?.length) return null;
    return new Map<string, BucketRanking>(
      buckets.map((b) => [
        b.key,
        bucketTopParties({ rows, bucketKey: b.key, limit: TOOLTIP_PARTY_LIMIT }),
      ]),
    );
  }, [rows, buckets]);

  const everythingZero = data.every((d) => d.value === 0);
  if (everythingZero) return null;

  const ramp = rampSteps(data.length, AGING_RAMP);
  const interactive = Boolean(onSelectBucket);

  return (
    <div className={cn('h-56', interactive && 'cursor-pointer')}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          // On the chart rather than the bar, so the whole category band is the
          // hit target. A 26px-wide rectangle in a 224px-tall frame is a mean
          // thing to ask anyone to hit, and the band is already what the
          // tooltip cursor highlights.
          onClick={
            onSelectBucket
              ? (state) => {
                  // Recharts types this as number | TooltipIndex | undefined,
                  // and TooltipIndex admits null — which `Number()` would turn
                  // into 0 and silently select the first bucket on a click that
                  // landed on nothing. Hence the explicit null guard.
                  const raw = state?.activeTooltipIndex;
                  if (raw === null || raw === undefined) return;
                  const i =
                    typeof raw === 'number'
                      ? raw
                      : Number.parseInt(String(raw), 10);
                  if (!Number.isInteger(i) || i < 0 || i >= data.length) return;
                  const key = data[i].key;
                  onSelectBucket(key === selectedBucket ? null : key);
                }
              : undefined
          }
        >
          <CartesianGrid vertical={false} stroke={colors.borderLight} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={(v: number) => compactMoney(v)}
          />
          <Tooltip
            cursor={interactive ? { fill: colors.neutral50 } : false}
            content={({ active, payload }) => {
              const d =
                active && payload?.[0]
                  ? (payload[0].payload as Datum)
                  : null;
              if (!d) return null;
              const ranked = rankings?.get(d.key);

              return (
                <div
                  className="max-w-[16rem] rounded-md bg-surface px-sm py-xs shadow-md"
                  style={{ border: `1px solid ${colors.border}` }}
                >
                  <p className="text-label-md text-text-primary">{d.label}</p>
                  <p className="text-caption tabular text-text-secondary">
                    {formatMoney(d.value)}
                  </p>

                  {ranked && ranked.parties.length > 0 && (
                    <>
                      <div className="my-xxs h-px bg-border-light" />
                      <ul className="flex flex-col gap-xxs">
                        {ranked.parties.map((p) => (
                          <li
                            key={p.id || p.name}
                            className="flex items-baseline justify-between gap-sm text-caption"
                          >
                            <span className="truncate text-text-secondary">
                              {p.name}
                            </span>
                            <span className="tabular shrink-0 text-text-primary">
                              {formatMoney(p.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {ranked.moreCount > 0 && (
                        <p className="mt-xxs text-caption tabular text-text-tertiary">
                          +{ranked.moreCount} more · {formatMoney(ranked.moreAmount)}
                        </p>
                      )}
                      {interactive && (
                        <p className="mt-xxs text-caption text-text-tertiary">
                          {d.key === selectedBucket
                            ? 'Click to clear the filter'
                            : 'Click to filter the table'}
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              // Sampled to the bucket count, so the palest and darkest steps
              // are always the first and last columns whatever the preset.
              // `fill` never varies with the selection — only opacity does.
              <Cell
                key={entry.key}
                fill={ramp[index]}
                fillOpacity={
                  selectedBucket && entry.key !== selectedBucket ? DIMMED : 1
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default AgingChart;
