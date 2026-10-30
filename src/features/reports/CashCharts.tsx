import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { cn } from '@/lib/cn';
import { niceAxis } from '@/models/chartAxis';
import { CATEGORY_PALETTE, colors, typography } from '@/theme/tokens';
import { compactMoney, formatMoney } from '@/utils/money';

const AXIS_TICK = { fill: colors.textTertiary, fontSize: typography.caption.fontSize } as const;

/**
 * Cash in wears the brand's teal and cash out its navy — the same pair in the
 * app, everywhere money moves in and out. The balance line is the navy.
 */
export const CASH_IN_COLOR = CATEGORY_PALETTE[1];
export const CASH_OUT_COLOR = CATEGORY_PALETTE[0];
const BALANCE_COLOR = CATEGORY_PALETTE[0];

/**
 * The y-axis is the same width on both cash charts, so their months line up
 * when one sits above the other.
 */
const AXIS_WIDTH = 72;

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; swatch?: string }[] }) {
  return (
    <div className="min-w-[12rem] rounded-md bg-surface px-sm py-xs shadow-md" style={{ border: `1px solid ${colors.border}` }}>
      <p className="mb-xxs text-label-md text-text-primary">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-md text-caption">
          <span className="flex items-center gap-xs text-text-secondary">
            {r.swatch && <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ backgroundColor: r.swatch }} />}
            {r.label}
          </span>
          <span className="tabular text-text-primary">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export interface CashBalancePoint {
  label: string;
  endingCash: number | null;
}

/**
 * Cash and bank at each month end, as a line over a pale area — a level
 * carried through time, so a line, straight between points because a curve
 * would invent the days between.
 */
export function CashBalanceChart({
  points,
  title,
  className,
  compact = false,
}: {
  points: readonly CashBalancePoint[];
  title: string;
  className?: string;
  /** A small version for a card: fewer ticks, no grid. */
  compact?: boolean;
}) {
  if (!points.some((p) => p.endingCash !== null)) {
    return <p className="py-lg text-center text-body-sm text-text-tertiary">No month-end balances for this period.</p>;
  }
  const axis = niceAxis(points.map((p) => p.endingCash), { tickCount: compact ? 2 : 4 });
  const belowZero = points.some((p) => (p.endingCash ?? 0) < 0);
  return (
    <figure aria-label={title} className={cn(compact ? 'h-32' : 'h-56', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={[...points]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {!compact && <CartesianGrid vertical={false} stroke={colors.borderLight} />}
          {/* Draws nothing: it puts each month in the middle of a band, as the
              columns of the cash in/out chart are, so the two line up. */}
          <Bar dataKey="__band" legendType="none" isAnimationActive={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: colors.border }}
            minTickGap={compact ? 24 : 8}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            domain={axis.domain}
            ticks={axis.ticks}
            width={compact ? 56 : AXIS_WIDTH}
            tickFormatter={(v: number) => compactMoney(v)}
          />
          {belowZero && <ReferenceLine y={0} stroke={colors.borderStrong} />}
          <Tooltip
            cursor={{ stroke: colors.borderStrong, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = active && payload?.[0] ? (payload[0].payload as CashBalancePoint) : null;
              if (!p) return null;
              return (
                <TooltipBox
                  title={p.label}
                  rows={[{ label: 'Cash and bank', value: p.endingCash === null ? '—' : formatMoney(p.endingCash), swatch: BALANCE_COLOR }]}
                />
              );
            }}
          />
          <Area
            dataKey="endingCash"
            name="Cash and bank"
            type="linear"
            stroke={BALANCE_COLOR}
            strokeWidth={2}
            fill={BALANCE_COLOR}
            fillOpacity={0.08}
            connectNulls={false}
            dot={compact ? false : { r: 3, fill: colors.surface, stroke: BALANCE_COLOR, strokeWidth: 2 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  );
}

export interface CashInOutPoint {
  label: string;
  inflow: number;
  outflow: number;
  net: number;
}

/**
 * Each month's cash in (up) and cash out (down) from one zero line, on the
 * same money axis — so a month that took in Rs 400K and paid out Rs 380K
 * reads as two big columns, not as a sliver of net. The net is in the tooltip.
 */
export function CashInOutChart({
  points,
  title,
  className,
}: {
  points: readonly CashInOutPoint[];
  title: string;
  className?: string;
}) {
  const data = points.map((p) => ({ ...p, out: -p.outflow }));
  if (!data.some((p) => p.inflow !== 0 || p.outflow !== 0)) {
    return <p className="py-lg text-center text-body-sm text-text-tertiary">No cash moved in this period.</p>;
  }
  const axis = niceAxis(data.flatMap((p) => [p.inflow, p.out]));
  return (
    <figure aria-label={title} className={cn('h-56', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          stackOffset="sign"
          barCategoryGap="28%"
        >
          <CartesianGrid vertical={false} stroke={colors.borderLight} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={8} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            domain={axis.domain}
            ticks={axis.ticks}
            width={AXIS_WIDTH}
            tickFormatter={(v: number) => compactMoney(v)}
          />
          <ReferenceLine y={0} stroke={colors.borderStrong} />
          <Tooltip
            cursor={{ fill: colors.neutral50 }}
            content={({ active, payload }) => {
              const p = active && payload?.[0] ? (payload[0].payload as CashInOutPoint) : null;
              if (!p) return null;
              return (
                <TooltipBox
                  title={p.label}
                  rows={[
                    { label: 'Cash in', value: formatMoney(p.inflow), swatch: CASH_IN_COLOR },
                    { label: 'Cash out', value: formatMoney(p.outflow), swatch: CASH_OUT_COLOR },
                    { label: 'Net', value: formatMoney(p.net) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="inflow" name="Cash in" stackId="cash" fill={CASH_IN_COLOR} radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
          <Bar dataKey="out" name="Cash out" stackId="cash" fill={CASH_OUT_COLOR} radius={[0, 0, 3, 3]} maxBarSize={26} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
