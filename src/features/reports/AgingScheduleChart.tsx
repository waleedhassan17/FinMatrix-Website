import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { niceAxis } from '@/models/chartAxis';
import type { AgingScheduleSlice } from '@/serializers/reportSerializers';
import { colors, typography } from '@/theme/tokens';
import { compactMoney, formatMoney } from '@/utils/money';

const AXIS_TICK = {
  fill: colors.textTertiary,
  fontSize: typography.caption.fontSize,
} as const;

export interface AgingScheduleChartProps {
  schedule: AgingScheduleSlice[];
  /** "invoice" or "bill", for the tooltip's count. */
  documentNoun: string;
}

/**
 * When the open balance falls due, by due date from today — what to expect
 * in (receivables) or what must go out (payables), week by week.
 *
 * One hue, as the aging chart uses: these are slices of time, not series. The
 * overdue column is the one already late, so it takes the darkest step and the
 * future slices a lighter one — emphasis by weight, not by an alarm colour.
 */
export function AgingScheduleChart({ schedule, documentNoun }: AgingScheduleChartProps) {
  if (schedule.length === 0) {
    return <p className="py-lg text-center text-body-sm text-text-tertiary">Nothing is open.</p>;
  }
  const axis = niceAxis(schedule.map((s) => s.amount));
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={schedule} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={colors.borderLight} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: colors.border }} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            domain={axis.domain}
            ticks={axis.ticks}
            width={64}
            tickFormatter={(v: number) => compactMoney(v)}
          />
          <Tooltip
            cursor={{ fill: colors.neutral50 }}
            content={({ active, payload }) => {
              const s = active && payload?.[0] ? (payload[0].payload as AgingScheduleSlice) : null;
              if (!s) return null;
              return (
                <div
                  className="rounded-md bg-surface px-sm py-xs shadow-md"
                  style={{ border: `1px solid ${colors.border}` }}
                >
                  <p className="text-label-md text-text-primary">{s.label}</p>
                  <p className="text-caption tabular text-text-primary">{formatMoney(s.amount)}</p>
                  <p className="text-caption text-text-tertiary">
                    {s.count} {documentNoun}
                    {s.count === 1 ? '' : 's'}
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="amount" name="Amount" radius={[3, 3, 0, 0]} maxBarSize={44}>
            {schedule.map((s) => (
              <Cell key={s.key} fill={s.key === 'overdue' ? colors.navy700 : colors.navy300} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default AgingScheduleChart;
