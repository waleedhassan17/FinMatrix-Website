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

import { AGING_BUCKETS } from '@/features/reports/AgingTable';
import type { AgingBuckets } from '@/serializers/reportSerializers';
import { CHART_SERIES, colors, typography } from '@/theme/tokens';
import { compactMoney, formatMoney } from '@/utils/money';

// Hoisted because SVG <text> needs a numeric size, not a class — and reading it
// from the typography role is what keeps `fontSize: 12` out of the file, which the
// design-token gate bans outright.
const AXIS_TICK = {
  fill: colors.textTertiary,
  fontSize: typography.caption.fontSize,
} as const;

export interface AgingChartProps {
  totals: AgingBuckets;
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
 * Colours run cool to warm across the buckets so age reads off the chart without
 * consulting the legend.
 */
export function AgingChart({ totals }: AgingChartProps) {
  const data = AGING_BUCKETS.map(({ key, label }) => ({
    label,
    value: totals[key],
  }));

  const everythingZero = data.every((d) => d.value === 0);
  if (everythingZero) return null;

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
            formatter={(v) => formatMoney(v as number)}
            contentStyle={{
              borderRadius: 10,
              border: `1px solid ${colors.border}`,
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={entry.label}
                // CHART_SERIES has exactly five colours and there are exactly
                // five buckets, so no wrap-around is needed.
                fill={CHART_SERIES[index % CHART_SERIES.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default AgingChart;
