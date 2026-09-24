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
import { analyticsAxis, formatChange, type AnalyticsMonth } from '@/models/analytics';
import { CHART_SERIES, colors, typography } from '@/theme/tokens';
import { compactMoney, formatMoney } from '@/utils/money';

// SVG <text> needs a numeric size; reading it from the typography role keeps a
// literal font size — which the token gate bans — out of this file.
const AXIS_TICK = {
  fill: colors.textTertiary,
  fontSize: typography.caption.fontSize,
} as const;

/**
 * The three series. Invoiced and billed are two readings of the same thing —
 * documents raised — so they share a hue at two strengths; the net between them
 * is a different kind of figure and takes a contrasting colour and a line.
 */
const ANALYTICS_SERIES = {
  invoiced: { label: 'Invoiced', color: colors.primary },
  billed: { label: 'Billed', color: colors.navy200 },
  net: { label: 'Invoiced less billed', color: CHART_SERIES[3] },
} as const;

/** The key, drawn in HTML so it wraps on a phone instead of clipping. */
export function AnalyticsLegend({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-md gap-y-xxs', className)}>
      {(['invoiced', 'billed'] as const).map((k) => (
        <li key={k} className="flex items-center gap-xs text-caption text-text-secondary">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[2px]"
            style={{ backgroundColor: ANALYTICS_SERIES[k].color }}
          />
          {ANALYTICS_SERIES[k].label}
        </li>
      ))}
      <li className="flex items-center gap-xs text-caption text-text-secondary">
        <span
          aria-hidden="true"
          className="h-0.5 w-3.5 rounded-full"
          style={{ backgroundColor: ANALYTICS_SERIES.net.color }}
        />
        {ANALYTICS_SERIES.net.label}
      </li>
    </ul>
  );
}

function Row({
  swatch,
  label,
  value,
  danger,
}: {
  swatch: string;
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <p className="flex items-center justify-between gap-md text-caption">
      <span className="flex items-center gap-xs text-text-secondary">
        <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ backgroundColor: swatch }} />
        {label}
      </span>
      <span className={cn('tabular', danger ? 'text-danger' : 'text-text-primary')}>
        {formatMoney(value)}
      </span>
    </p>
  );
}

/**
 * What was invoiced and billed each month, and the difference.
 *
 * It replaces two charts: a gradient area of revenue, and a lone line of "net
 * cash" that was really invoiced less billed, drawn with nothing to show what
 * it was the difference OF. Side-by-side columns put both halves on one scale,
 * and the line through them is the gap — so a bad month reads as a tall pale
 * column, not as a dip in an unexplained line.
 *
 * Columns, not an area: each value is a month's total, not a reading along a
 * continuous curve. The line is straight between points for the same reason —
 * smoothing would invent values between months.
 */
export function AnalyticsMonthlyChart({
  months,
  className,
}: {
  months: AnalyticsMonth[];
  className?: string;
}) {
  const dipsBelowZero = months.some((m) => m.net < 0);
  const axis = analyticsAxis(months);

  return (
    <div className={cn('h-72', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={months}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          barGap={2}
          barCategoryGap="22%"
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
            // Wide enough for "−Rs 500K" on one line, when a deep dip puts a
            // negative tick on this axis.
            width={axis.ticks[0] < 0 ? 76 : 64}
            tickFormatter={(v: number) => compactMoney(v)}
          />
          {/* A loss-making month needs a floor to read against. */}
          {dipsBelowZero && <ReferenceLine y={0} stroke={colors.borderStrong} />}
          <Tooltip
            cursor={{ fill: colors.neutral50 }}
            content={({ active, payload }) => {
              const m = active && payload?.[0] ? (payload[0].payload as AnalyticsMonth) : null;
              if (!m) return null;
              const change = formatChange(m.change);
              return (
                <div
                  className="min-w-[14rem] rounded-md bg-surface px-sm py-xs shadow-md"
                  style={{ border: `1px solid ${colors.border}` }}
                >
                  <p className="mb-xxs text-label-md text-text-primary">{m.label}</p>
                  <Row swatch={ANALYTICS_SERIES.invoiced.color} label="Invoiced" value={m.invoiced} />
                  <Row swatch={ANALYTICS_SERIES.billed.color} label="Billed" value={m.billed} />
                  <div className="my-xxs h-px bg-border-light" />
                  <Row
                    swatch={ANALYTICS_SERIES.net.color}
                    label="Difference"
                    value={m.net}
                    danger={m.net < 0}
                  />
                  {change && (
                    <p className="mt-xxs text-caption text-text-tertiary">
                      Invoiced {change} on the month before
                    </p>
                  )}
                </div>
              );
            }}
          />
          <Bar
            dataKey="invoiced"
            name={ANALYTICS_SERIES.invoiced.label}
            fill={ANALYTICS_SERIES.invoiced.color}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            dataKey="billed"
            name={ANALYTICS_SERIES.billed.label}
            fill={ANALYTICS_SERIES.billed.color}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
          <Line
            dataKey="net"
            name={ANALYTICS_SERIES.net.label}
            type="linear"
            stroke={ANALYTICS_SERIES.net.color}
            strokeWidth={2}
            dot={{ r: 3, fill: colors.surface, stroke: ANALYTICS_SERIES.net.color, strokeWidth: 2 }}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default AnalyticsMonthlyChart;
