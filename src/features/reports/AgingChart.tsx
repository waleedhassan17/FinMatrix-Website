import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type XAxisTickContentProps,
} from 'recharts';

import { cn } from '@/lib/cn';
import { bucketTopParties, formatShare, type BucketRanking } from '@/models/reportAging';
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

/** The share line under each period label, a step quieter than the label. */
const SHARE_TICK = {
  fill: colors.textTertiary,
  fontSize: typography.caption.fontSize,
} as const;

/**
 * Past this many columns the amount over each bar and the share under each
 * label start to collide, so a labelled chart falls back to axis and tooltip.
 */
const LABELLED_MAX = 8;

/**
 * The rough width of one caption-size character. SVG text can neither wrap nor
 * be measured before it is drawn, so a labelled chart estimates, and picks a
 * form that fits: on a phone a column is about 50px wide, and "Rs 856K" or
 * "91 and over" at full length runs into its neighbour.
 */
const CHAR_PX = 6.6;
const fits = (text: string, room: number) => text.length * CHAR_PX <= room;

/** At most two lines, broken at the space that balances them best. */
const wrapLabel = (label: string, room: number): string[] => {
  const words = label.split(' ');
  if (fits(label, room) || words.length < 2) return [label];
  let best = [label];
  let bestGap = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const gap = Math.abs(a.length - b.length);
    if (gap < bestGap) {
      bestGap = gap;
      best = [a, b];
    }
  }
  return best;
};

/** The amount over a bar: with the currency where it fits, without where not. */
const barLabel = (value: number, room: number): string | null => {
  const full = compactMoney(value);
  if (fits(full, room)) return full;
  const bare = compactMoney(value, '');
  return fits(bare, room) ? bare : null;
};

/** How many parties a tooltip names before folding the rest into "+N more". */
const TOOLTIP_PARTY_LIMIT = 5;

/** Unselected bars keep their ramp step and lose contrast. See the docblock. */
const DIMMED = 0.35;

interface Datum {
  /** The stable bucket key. Two custom boundaries can share a label; keys cannot. */
  key: string;
  label: string;
  value: number;
  /** 0–1, of the report total. */
  share: number;
}

export interface AgingChartProps {
  /** Column order and headings, from the payload. */
  buckets: AgingBucketDef[];
  totals: AgingTotals;
  /**
   * The per-party rows behind those totals. Supplying them turns the tooltip
   * from "how much" into "how much, and who". Optional, as is everything
   * below: without them the chart is a plain, inert picture of the totals.
   */
  rows?: AgingRow[];
  selectedBucket?: string | null;
  /** Supplying this makes the bars a control. Omit it and the chart is inert. */
  onSelectBucket?: (key: string | null) => void;
  /**
   * Print each bar's amount above it and its share of the total under its
   * label, so the chart can be read without hovering. Dropped past eight
   * columns, where the figures would collide.
   */
  labelled?: boolean;
  /** Sizing. Defaults to a fixed 224px frame. */
  className?: string;
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
  labelled = false,
  className,
}: AgingChartProps) {
  const data: Datum[] = buckets.map(({ key, label }) => {
    const value = totals.amounts[key] ?? 0;
    return {
      key,
      label,
      value,
      share: totals.total > 0 ? value / totals.total : 0,
    };
  });

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
  const annotate = labelled && data.length <= LABELLED_MAX;

  return (
    <div className={cn('h-56', className, interactive && 'cursor-pointer')}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          // Headroom for the amounts printed above the bars.
          margin={{ top: annotate ? 24 : 8, right: 8, bottom: 0, left: 0 }}
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
            tickLine={false}
            // A baseline under a labelled chart, which prints its figures;
            // a plain one keeps a borderless frame.
            axisLine={labelled ? { stroke: colors.border } : false}
            interval={annotate ? 0 : undefined}
            height={annotate ? 40 : undefined}
            tick={
              annotate
                ? ({ x, y, index, width, visibleTicksCount }: XAxisTickContentProps) => {
                    const d = data[index];
                    if (!d) return <g />;
                    // Decided for the whole axis, not per column, so every
                    // column reads the same way: when any label would collide,
                    // labels wrap and the share line gives way to them (the
                    // tooltip still carries it).
                    const room = Number(width) / Math.max(1, visibleTicksCount) - 6;
                    const crowded = data.some((p) => !fits(p.label, room));
                    const lines = crowded ? wrapLabel(d.label, room) : [d.label];
                    return (
                      <g transform={`translate(${x},${y})`}>
                        {lines.map((line, i) => (
                          <text
                            key={i}
                            dy={12 + i * 15}
                            textAnchor="middle"
                            {...AXIS_TICK}
                            fill={colors.textSecondary}
                          >
                            {line}
                          </text>
                        ))}
                        {!crowded && (
                          <text dy={27} textAnchor="middle" {...SHARE_TICK}>
                            {formatShare(d.share)}
                          </text>
                        )}
                      </g>
                    );
                  }
                : AXIS_TICK
            }
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
                    {labelled && ` · ${formatShare(d.share)} of the total`}
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
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            maxBarSize={labelled ? 72 : undefined}
            // An amount that exists must be visible: beside a large "Current"
            // column a small overdue bucket would otherwise draw at 0px.
            minPointSize={(v) => (typeof v === 'number' && v > 0 ? 3 : 0)}
          >
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
            {annotate && (
              <LabelList
                dataKey="value"
                // Drawn by hand: the default label wraps to the bar's width,
                // which on a phone splits "Rs 856K" over two lines.
                content={({ x, y, width, value }) => {
                  if (typeof value !== 'number' || value <= 0) return null;
                  // A little wider than the bar; the gap either side is free.
                  const text = barLabel(value, Number(width) * 1.25);
                  if (!text) return null;
                  return (
                    <text
                      x={Number(x) + Number(width) / 2}
                      y={Number(y) - 6}
                      textAnchor="middle"
                      {...AXIS_TICK}
                      fill={colors.textPrimary}
                    >
                      {text}
                    </text>
                  );
                }}
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default AgingChart;
