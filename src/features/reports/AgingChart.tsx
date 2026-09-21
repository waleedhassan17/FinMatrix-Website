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

import type {
  AgingBucketDef,
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

export interface AgingChartProps {
  /** Column order and headings, from the payload. */
  buckets: AgingBucketDef[];
  totals: AgingTotals;
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
 */
export function AgingChart({ buckets, totals }: AgingChartProps) {
  const data = buckets.map(({ key, label }) => ({
    label,
    value: totals.amounts[key] ?? 0,
  }));

  const everythingZero = data.every((d) => d.value === 0);
  if (everythingZero) return null;

  const ramp = rampSteps(data.length, AGING_RAMP);

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
              // Sampled to the bucket count, so the palest and darkest steps
              // are always the first and last columns whatever the preset.
              <Cell key={entry.label} fill={ramp[index]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default AgingChart;
