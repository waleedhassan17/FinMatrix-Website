import {
  Bar,
  CartesianGrid,
  Cell,
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
import {
  changeTone,
  explorerMetric,
  formatChange,
  formatMetric,
  formatMetricCompact,
  metricChange,
  type ExplorerMetricKey,
} from '@/models/itemExplorer';
import { colors, typography } from '@/theme/tokens';

// SVG <text> needs a numeric size; reading it from the typography role keeps a
// literal font size — which the token gate bans — out of this file.
const AXIS_TICK = {
  fill: colors.textTertiary,
  fontSize: typography.caption.fontSize,
} as const;

export type ChartType = 'bar' | 'line';

export interface MetricChartPoint {
  period: string;
  label: string;
  /** Null is a GAP — no reading — never a zero. */
  value: number | null;
}

export interface MetricChartProps {
  metric: ExplorerMetricKey;
  points: MetricChartPoint[];
  type: ChartType;
  /** A month to pick out; the others recede to context. */
  selected?: string | null;
  /** Clicking a month. Clicking the selected one again clears it. */
  onSelect?: (period: string | null) => void;
  /** Drawn as a dashed reference line, when given; the caller names it. */
  average?: number | null;
  className?: string;
}

interface Datum extends MetricChartPoint {
  index: number;
}

/**
 * One metric over the months, as columns or a line.
 *
 * **One series, one scale.** The explorer charts one metric at a time and the
 * table beneath it carries the rest; two metrics on one frame would need two
 * axes, and where their lines cross would be an artefact of the scales.
 *
 * **Columns for totals, a line for a trend.** The toggle is the reader's, but
 * both draw the same numbers: the line is straight between months (smoothing
 * would invent values between them) and breaks at a month with no reading
 * rather than bridging it.
 *
 * A negative month — a loss, a return-heavy month, stock sold before it was
 * dated in — is drawn below a zero line in the danger colour: it is the one
 * month worth being interrupted by.
 */
export function MetricChart({
  metric,
  points,
  type,
  selected = null,
  onSelect,
  average = null,
  className,
}: MetricChartProps) {
  const def = explorerMetric(metric);
  const data: Datum[] = points.map((p, index) => ({ ...p, index }));
  const values = points.map((p) => p.value);
  const axis = niceAxis([...values, average], { integer: def.unit === 'qty' });
  const dipsBelowZero = values.some((v) => v !== null && v < 0);
  const hasSelection = selected !== null && points.some((p) => p.period === selected);

  const barFill = (d: Datum) => {
    if (d.value !== null && d.value < 0) {
      return hasSelection && d.period !== selected ? colors.dangerLight : colors.danger;
    }
    return hasSelection && d.period !== selected ? colors.navy200 : colors.primary;
  };

  const pick = (raw: unknown) => {
    if (!onSelect || raw === null || raw === undefined) return;
    const i = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
    if (!Number.isInteger(i) || i < 0 || i >= data.length) return;
    const period = data[i].period;
    onSelect(period === selected ? null : period);
  };

  const widest = Math.max(...axis.ticks.map((t) => formatMetricCompact(metric, t).length));

  return (
    <div className={cn('h-72', className, onSelect && 'cursor-pointer')}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
          barCategoryGap="24%"
          onClick={onSelect ? (state) => pick(state?.activeTooltipIndex) : undefined}
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
            // Room for the widest tick label, so "−Rs 12K" never clips.
            width={Math.max(44, widest * 7 + 8)}
            tickFormatter={(v: number) => formatMetricCompact(metric, v)}
          />
          {dipsBelowZero && <ReferenceLine y={0} stroke={colors.borderStrong} />}
          {/* Unlabelled: a label on the line sits on whichever bar reaches it.
              The summary under the chart names the figure. */}
          {average !== null && (
            <ReferenceLine y={average} stroke={colors.neutral400} strokeDasharray="4 4" />
          )}
          <Tooltip
            cursor={type === 'bar' ? { fill: colors.neutral50 } : { stroke: colors.border }}
            content={({ active, payload }) => {
              const d = active && payload?.[0] ? (payload[0].payload as Datum) : null;
              if (!d) return null;
              const prior = d.index > 0 ? data[d.index - 1] : null;
              const change = prior ? metricChange(metric, d.value, prior.value) : null;
              const changeText = formatChange(metric, change);
              const tone = changeTone(metric, change);
              return (
                <div
                  className="min-w-[11rem] rounded-md bg-surface px-sm py-xs shadow-md"
                  style={{ border: `1px solid ${colors.border}` }}
                >
                  <p className="text-caption text-text-tertiary">{d.label}</p>
                  <p
                    className={cn(
                      'text-label-lg tabular',
                      d.value !== null && d.value < 0 ? 'text-danger' : 'text-text-primary',
                    )}
                  >
                    {d.value === null ? 'No reading' : formatMetric(metric, d.value)}
                  </p>
                  {changeText && prior && (
                    <p className="mt-[2px] text-caption text-text-tertiary">
                      <span
                        className={cn(
                          'tabular',
                          tone === 'good' && 'text-success',
                          tone === 'bad' && 'text-danger',
                        )}
                      >
                        {changeText}
                      </span>{' '}
                      on {prior.label}
                    </p>
                  )}
                  {onSelect && (
                    <p className="mt-[2px] text-caption text-text-tertiary">
                      {d.period === selected ? 'Click to clear' : 'Click for the documents'}
                    </p>
                  )}
                </div>
              );
            }}
          />
          {type === 'bar' ? (
            <Bar dataKey="value" name={def.label} radius={[3, 3, 0, 0]} maxBarSize={36}>
              {data.map((d) => (
                <Cell key={d.period} fill={barFill(d)} />
              ))}
            </Bar>
          ) : (
            <Line
              dataKey="value"
              name={def.label}
              type="linear"
              connectNulls={false}
              stroke={colors.primary}
              strokeWidth={2}
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; payload?: Datum; index?: number }) => {
                const { cx, cy, payload } = props;
                if (cx === undefined || cy === undefined || !payload || payload.value === null) {
                  return <g key={`dot-${props.index}`} />;
                }
                const on = payload.period === selected;
                const negative = payload.value < 0;
                return (
                  <circle
                    key={`dot-${payload.period}`}
                    cx={cx}
                    cy={cy}
                    r={on ? 5 : 3}
                    fill={on ? (negative ? colors.danger : colors.primary) : colors.surface}
                    stroke={negative ? colors.danger : colors.primary}
                    strokeWidth={2}
                  />
                );
              }}
              activeDot={{ r: 5 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default MetricChart;
