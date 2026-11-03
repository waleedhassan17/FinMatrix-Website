import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type XAxisTickContentProps,
} from 'recharts';

import { cn } from '@/lib/cn';
import { monthChange } from '@/models/dashboard';
import { colors, typography } from '@/theme/tokens';

// SVG <text> needs a numeric size, and reading it from the typography role is
// what keeps a literal `fontSize: 12` — which the token gate bans — out of this
// file. Same hoist as AgingChart and AnalyticsPage.
const AXIS_TICK = {
  fill: colors.textTertiary,
  fontSize: typography.caption.fontSize,
} as const;

/**
 * The rough width of one caption-size character. SVG text can neither wrap nor
 * be measured before it is drawn, so a label that would run into its neighbour
 * on a phone is left to the tooltip instead. Same estimate as AgingChart.
 */
const CHAR_PX = 6.6;

/**
 * Bar to gap. The gap is taken on BOTH sides of a bar, so 20% leaves the bar
 * 60% of its column: wider than the space between bars, which reads as one
 * series rather than a row of posts. The cap stops a wide card drawing slabs,
 * and matches the labelled aging chart, so bars are one width across reports.
 */
const BAR_GAP = '20%';
const MAX_BAR = 72;
const Y_AXIS_WIDTH = 64;

export interface MonthlySeriesPoint {
  /** Stable key; the label repeats across years. */
  period: string;
  label: string;
  /** `Aug 2026` — for the tooltip. Falls back to `label`. */
  fullLabel?: string;
  /** null is a GAP, not a zero. */
  value: number | null;
}

export interface MonthlySeriesChartProps {
  points: MonthlySeriesPoint[];
  /** Full value, for the tooltip. */
  format: (value: number) => string;
  /** Short form, for the axis and the figure over each bar. */
  compact: (value: number) => string;
  /** Every bar's fill when `fills` is not given. */
  color?: string;
  /** One fill per point, in order — e.g. a ramp stepping by recency. */
  fills?: readonly string[];
  /**
   * A period still accruing. Its tick carries a second line, "MTD", so it is
   * not misread as a bad month, and its tooltip says so rather than comparing a
   * part-month against a whole one.
   */
  inProgress?: string;
  /** A dashed line across the bars, labelled in the right margin. */
  reference?: { value: number; label: string };
  /**
   * Print each figure over its bar and drop the y-axis, which only restated
   * them. Decided for the whole chart: when any figure would run into its
   * neighbour (a phone), none is printed and the axis comes back, so the chart
   * never shows some months' figures and not others.
   */
  valueLabels?: boolean;
  emptyLabel?: string;
}

/** `▲ 52%`, or null when there is nothing to compare against. */
const changeText = (pct: number | null): string | null => {
  if (pct === null) return null;
  if (Math.abs(pct) < 0.5) return 'No change';
  const size = Math.abs(pct) >= 1000 ? '999+' : Math.round(Math.abs(pct)).toString();
  return `${pct > 0 ? '▲' : '▼'} ${size}%`;
};

/**
 * One measure over a fixed window of months.
 *
 * **One series per chart, deliberately.** Quantity and value do not share a
 * scale, so drawing them together would be a dual-axis chart — two y-scales on
 * one frame, where the point at which the lines cross is an artefact of the
 * scales rather than anything in the data. They are drawn as two charts
 * instead, stacked, sharing an x-axis by construction.
 *
 * A `null` month renders as an absent bar rather than a zero one. On an item's
 * stock history null means "did not exist yet" and 0 means "existed and was out
 * of stock"; a chart that cannot tell them apart invents a stockout. A zero is
 * drawn as a 3px stub, so it still reads as a month on the axis.
 */
export function MonthlySeriesChart({
  points,
  format,
  compact,
  color = colors.primary,
  fills,
  inProgress,
  reference,
  valueLabels = false,
  emptyLabel = 'Nothing recorded in this period.',
}: MonthlySeriesChartProps) {
  const [chartWidth, setChartWidth] = useState(0);
  const known = points.filter((p) => p.value !== null);
  if (known.length === 0) {
    return <p className="text-caption text-text-tertiary">{emptyLabel}</p>;
  }

  // Recharts skips a null datum, which is exactly the gap we want.
  const data = points.map((p, index) => ({
    index,
    period: p.period,
    label: p.label,
    fullLabel: p.fullLabel ?? p.label,
    value: p.value,
  }));
  type Datum = (typeof data)[number];

  const marked = inProgress !== undefined && data.some((d) => d.period === inProgress);

  const margin = {
    top: 8,
    // Room for the reference label, which sits outside the bars so it never
    // lands on one.
    right: reference ? 32 : 8,
    bottom: 0,
    left: 8,
  };
  const printed = (d: Datum) =>
    d.value !== null && (d.value > 0 || d.period === inProgress);
  const column = (chartWidth - margin.left - margin.right) / Math.max(1, data.length);
  const labelled =
    valueLabels &&
    chartWidth > 0 &&
    data.every((d) => !printed(d) || compact(d.value ?? 0).length * CHAR_PX <= column - 8);

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%" onResize={(w) => setChartWidth(w)}>
        <BarChart
          data={data}
          barCategoryGap={BAR_GAP}
          margin={{ ...margin, top: labelled ? 20 : 8, left: labelled ? 8 : 0 }}
        >
          {!labelled && <CartesianGrid vertical={false} stroke={colors.borderLight} />}
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: colors.border }}
            interval={0}
            height={marked ? 36 : 30}
            tick={({ x, y, index }: XAxisTickContentProps) => {
              const d = data[index];
              if (!d) return <g />;
              const current = d.period === inProgress;
              return (
                <g transform={`translate(${x},${y})`}>
                  <text
                    dy={12}
                    textAnchor="middle"
                    {...AXIS_TICK}
                    fill={current ? colors.textPrimary : colors.textSecondary}
                    fontWeight={current ? typography.labelMd.fontWeight : undefined}
                  >
                    {d.label}
                  </text>
                  {current && (
                    <text
                      dy={26}
                      textAnchor="middle"
                      {...AXIS_TICK}
                      fontSize={typography.overline.fontSize}
                      letterSpacing={typography.overline.letterSpacing}
                    >
                      MTD
                    </text>
                  )}
                </g>
              );
            }}
          />
          <YAxis
            hide={labelled}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={Y_AXIS_WIDTH}
            tickFormatter={(v: number) => compact(v)}
          />
          {reference && (
            <ReferenceLine
              y={reference.value}
              stroke={colors.neutral400}
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{ value: reference.label, position: 'right', ...AXIS_TICK }}
            />
          )}
          <Tooltip
            cursor={{ fill: colors.navy50 }}
            content={({ active, payload }) => {
              const d = active && payload?.[0] ? (payload[0].payload as Datum) : null;
              if (!d) return null;
              const current = d.period === inProgress;
              const prior = d.index > 0 ? data[d.index - 1] : null;
              // A part-month against a whole one is always "down", so the
              // month still accruing is not compared at all.
              const pct =
                !current && prior && d.value !== null ? monthChange(prior.value, d.value) : null;
              const change = changeText(pct);
              return (
                <div
                  className="min-w-[10rem] rounded-md bg-surface px-sm py-xs shadow-md"
                  style={{ border: `1px solid ${colors.border}` }}
                >
                  <p className="text-caption text-text-tertiary">
                    {d.fullLabel}
                    {current && ' · month to date'}
                  </p>
                  <p className="text-label-lg tabular text-text-primary">
                    {d.value === null ? 'No figure' : format(d.value)}
                  </p>
                  {change && prior && (
                    <p className="mt-[2px] text-caption text-text-tertiary">
                      <span
                        className={cn(
                          'tabular',
                          pct !== null && pct >= 0.5 && 'text-success',
                          pct !== null && pct <= -0.5 && 'text-danger',
                        )}
                      >
                        {change}
                      </span>{' '}
                      vs {prior.label}
                    </p>
                  )}
                </div>
              );
            }}
          />
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            maxBarSize={MAX_BAR}
            // A month that exists must be visible, even at zero: it is a stub
            // on the axis rather than a hole in it. A gap stays a gap.
            minPointSize={(v) => (typeof v === 'number' ? 3 : 0)}
            fill={color}
          >
            {data.map((d) => (
              <Cell key={d.period} fill={fills?.[d.index] ?? color} />
            ))}
            {labelled && (
              <LabelList
                dataKey="value"
                // Drawn by hand: the default label wraps to the bar's width,
                // which on a phone splits "Rs 98K" over two lines.
                content={({ x, y, width, value, index }) => {
                  const d = data[Number(index)];
                  // Empty months stay quiet; the month to date says "Rs 0",
                  // because "nothing yet" is what the owner is asking.
                  if (typeof value !== 'number' || !d || !printed(d)) return null;
                  return (
                    <text
                      x={Number(x) + Number(width) / 2}
                      y={Number(y) - 6}
                      textAnchor="middle"
                      {...AXIS_TICK}
                      fill={colors.textSecondary}
                      // A halo in the card colour, so the dashed reference line
                      // breaks behind a figure instead of striking through it.
                      stroke={colors.surface}
                      strokeWidth={4}
                      strokeLinejoin="round"
                      paintOrder="stroke"
                    >
                      {compact(value)}
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

export default MonthlySeriesChart;
