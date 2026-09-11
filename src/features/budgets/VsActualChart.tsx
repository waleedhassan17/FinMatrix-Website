import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { varianceLabel, type VsActualRow } from '@/models/budget';
import { colors, typography } from '@/theme/tokens';
import { compactMoney, formatMoney } from '@/utils/money';

const AXIS_TICK = { fill: colors.textTertiary, fontSize: typography.caption.fontSize } as const;
const LABEL_TICK = { fill: colors.textSecondary, fontSize: typography.caption.fontSize } as const;

/** Rows past this go to the table; a chart of forty accounts reads as texture. */
const MAX_ROWS = 10;

interface Datum {
  label: string;
  actual: number;
  budgeted: number;
  row: VsActualRow;
}

/**
 * Actual against budget for one kind of account — a bullet chart.
 *
 * One hue: the ACTUAL is the bar (the accent), the BUDGET is a dark tick across
 * it (a reference mark in ink, not a second series colour). The product's navy
 * fails the categorical-palette checks as a series colour, and a two-hue pair
 * from its tokens fails colour-blind separation — the bullet form needs neither.
 * Over/under is deliberately NOT coloured red/green here: status colours are
 * reserved, and the table beside it states favourable or unfavourable in words.
 *
 * Revenue and spending are separate charts, never one: "above budget" means
 * opposite things for the two.
 */
export function VsActualChart({ rows, title }: { rows: VsActualRow[]; title: string }) {
  const data: Datum[] = [...rows]
    .sort((a, b) => Math.max(b.budgeted, b.actual) - Math.max(a.budgeted, a.actual))
    .slice(0, MAX_ROWS)
    .map((r) => ({
      label: `${r.accountCode} ${r.accountName}`,
      actual: r.actual,
      budgeted: r.budgeted,
      row: r,
    }));

  if (data.length === 0) return null;

  // Bar band 28px, capped mark thickness per the spec; the axis band is extra.
  const height = data.length * 36 + 40;

  return (
    <figure className="flex flex-col gap-sm">
      <figcaption className="flex flex-wrap items-center justify-between gap-sm">
        <span className="text-label-lg text-text-primary">{title}</span>
        <span className="flex items-center gap-md text-caption text-text-secondary">
          <span className="flex items-center gap-xxs">
            <span className="inline-block h-3 w-4 rounded-xs" style={{ backgroundColor: colors.info }} />
            Actual
          </span>
          <span className="flex items-center gap-xxs">
            <span className="inline-block h-3 w-[3px] rounded-xs" style={{ backgroundColor: colors.textPrimary }} />
            Budget
          </span>
          {rows.length > MAX_ROWS && <span>Top {MAX_ROWS} of {rows.length} — all in the table</span>}
        </span>
      </figcaption>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
            barCategoryGap={8}
            barGap={-20}
          >
            <CartesianGrid horizontal={false} stroke={colors.borderLight} />
            <XAxis
              type="number"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => compactMoney(v)}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={LABEL_TICK}
              tickLine={false}
              axisLine={false}
              width={170}
            />
            <Tooltip
              cursor={{ fill: colors.neutral50 }}
              content={({ active, payload }) => {
                const d = active && payload?.[0] ? (payload[0].payload as Datum) : null;
                if (!d) return null;
                return (
                  <div
                    className="rounded-md bg-surface px-sm py-xs shadow-md"
                    style={{ border: `1px solid ${colors.border}` }}
                  >
                    <p className="text-label-md text-text-primary">{d.label}</p>
                    <p className="text-caption text-text-secondary tabular">Actual {formatMoney(d.actual)}</p>
                    <p className="text-caption text-text-secondary tabular">Budget {formatMoney(d.budgeted)}</p>
                    <p className="mt-xxs text-caption text-text-primary">{varianceLabel(d.row, formatMoney)}</p>
                  </div>
                );
              }}
            />
            {/* The actual: a thin bar, square at the baseline, 4px round end. */}
            <Bar dataKey="actual" fill={colors.info} barSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false} />
            {/* The budget: a 3px ink tick at the budgeted value, drawn over the bar. */}
            <Bar
              dataKey="budgeted"
              barSize={20}
              isAnimationActive={false}
              shape={(props: unknown) => {
                const { x, y, width, height } = props as { x: number; y: number; width: number; height: number };
                if (!Number.isFinite(width) || width <= 0) return <g />;
                return (
                  <rect
                    x={x + width - 1.5}
                    y={y - 4}
                    width={3}
                    height={height + 8}
                    rx={1.5}
                    fill={colors.textPrimary}
                  />
                );
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export default VsActualChart;
