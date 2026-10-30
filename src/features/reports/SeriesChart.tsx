import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { cn } from '@/lib/cn';
import { niceAxis } from '@/models/chartAxis';
import { colors, typography } from '@/theme/tokens';
import { compactMoney, formatMoney } from '@/utils/money';

// SVG <text> needs a numeric size; reading it from the typography role keeps a
// literal font size — which the token gate bans — out of this file.
const AXIS_TICK = {
  fill: colors.textTertiary,
  fontSize: typography.caption.fontSize,
} as const;

export interface ChartSeries {
  key: string;
  label: string;
  kind: 'bar' | 'line';
  color: string;
  /** A column that runs below zero (an outflow): rounded at its data end, the bottom. */
  negative?: boolean;
}

export interface SeriesChartProps<T extends { label: string }> {
  data: T[];
  series: ChartSeries[];
  /** What the chart shows, for screen readers and the empty state. */
  title: string;
  className?: string;
  emptyLabel?: string;
}

/** The key, in HTML so it wraps on a phone. A single series needs none — the title names it. */
export function SeriesLegend({ series, className }: { series: ChartSeries[]; className?: string }) {
  if (series.length < 2) return null;
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-md gap-y-xxs', className)}>
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-xs text-caption text-text-secondary">
          <span
            aria-hidden="true"
            className={s.kind === 'line' ? 'h-0.5 w-3.5 rounded-full' : 'size-2.5 rounded-[2px]'}
            style={{ backgroundColor: s.color }}
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Monthly figures as columns, with at most one line through them — all on ONE
 * money axis (never two scales). Columns because each value is a month's
 * total; a line only for a level carried through the months (ending cash), and
 * straight between points because smoothing would invent values.
 *
 * Negative values hang below a zero line, so an outflow drawn as a negative
 * column reads as money leaving without a second colour having to say so.
 */
export function SeriesChart<T extends { label: string }>({
  data,
  series,
  title,
  className,
  emptyLabel = 'Nothing to chart for this period.',
}: SeriesChartProps<T>) {
  if (data.length === 0) {
    return <p className="py-lg text-center text-body-sm text-text-tertiary">{emptyLabel}</p>;
  }
  const values = data.flatMap((row) =>
    series.map((s) => (row as unknown as Record<string, number>)[s.key]),
  );
  const axis = niceAxis(values);
  const belowZero = values.some((v) => typeof v === 'number' && v < 0);

  return (
    <figure className={cn('flex flex-col gap-sm', className)} aria-label={title}>
      <SeriesLegend series={series} />
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barGap={2}
            barCategoryGap="22%"
            stackOffset="sign"
          >
            <CartesianGrid vertical={false} stroke={colors.borderLight} />
            <XAxis
              dataKey="label"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: colors.border }}
              minTickGap={8}
            />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              domain={axis.domain}
              ticks={axis.ticks}
              width={axis.ticks[0] < 0 ? 76 : 64}
              tickFormatter={(v: number) => compactMoney(v)}
            />
            {belowZero && <ReferenceLine y={0} stroke={colors.borderStrong} />}
            <Tooltip
              cursor={{ fill: colors.neutral50 }}
              content={({ active, payload }) => {
                const row = active && payload?.[0] ? (payload[0].payload as Record<string, number | string>) : null;
                if (!row) return null;
                return (
                  <div
                    className="min-w-[13rem] rounded-md bg-surface px-sm py-xs shadow-md"
                    style={{ border: `1px solid ${colors.border}` }}
                  >
                    <p className="mb-xxs text-label-md text-text-primary">{String(row.label)}</p>
                    {series.map((s) => (
                      <p key={s.key} className="flex items-center justify-between gap-md text-caption">
                        <span className="flex items-center gap-xs text-text-secondary">
                          <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ backgroundColor: s.color }} />
                          {s.label}
                        </span>
                        <span className="tabular text-text-primary">{formatMoney(Number(row[s.key] ?? 0))}</span>
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            {series
              .filter((s) => s.kind === 'bar')
              .map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  radius={s.negative ? [0, 0, 3, 3] : [3, 3, 0, 0]}
                  maxBarSize={28}
                />
              ))}
            {series
              .filter((s) => s.kind === 'line')
              .map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  type="linear"
                  stroke={s.color}
                  strokeWidth={2}
                  dot={{ r: 3, fill: colors.surface, stroke: s.color, strokeWidth: 2 }}
                  activeDot={{ r: 4 }}
                />
              ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export default SeriesChart;
