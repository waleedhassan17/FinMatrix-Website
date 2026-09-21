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

import { colors, typography } from '@/theme/tokens';

// SVG <text> needs a numeric size, and reading it from the typography role is
// what keeps a literal `fontSize: 12` — which the token gate bans — out of this
// file. Same hoist as AgingChart and AnalyticsPage.
const AXIS_TICK = {
  fill: colors.textTertiary,
  fontSize: typography.caption.fontSize,
} as const;

export interface MonthlySeriesPoint {
  /** Stable key; the label repeats across years. */
  period: string;
  label: string;
  /** null is a GAP, not a zero. */
  value: number | null;
}

export interface MonthlySeriesChartProps {
  points: MonthlySeriesPoint[];
  /** Full value, for the tooltip. */
  format: (value: number) => string;
  /** Short form, for the axis. */
  compact: (value: number) => string;
  color?: string;
  emptyLabel?: string;
}

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
 * of stock"; a chart that cannot tell them apart invents a stockout.
 */
export function MonthlySeriesChart({
  points,
  format,
  compact,
  color = colors.primary,
  emptyLabel = 'Nothing recorded in this period.',
}: MonthlySeriesChartProps) {
  const known = points.filter((p) => p.value !== null);
  if (known.length === 0) {
    return <p className="text-caption text-text-tertiary">{emptyLabel}</p>;
  }

  // Recharts skips a null datum, which is exactly the gap we want.
  const data = points.map((p) => ({ label: p.label, value: p.value }));

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={colors.borderLight} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={(v: number) => compact(v)}
          />
          <Tooltip
            formatter={(v) => format(v as number)}
            contentStyle={{
              borderRadius: 10,
              border: `1px solid ${colors.border}`,
            }}
          />
          {/* One series, so one hue and no legend — the section title names it. */}
          <Bar dataKey="value" radius={[4, 4, 0, 0]} fill={color}>
            {data.map((d) => (
              <Cell key={d.label} fill={color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default MonthlySeriesChart;
