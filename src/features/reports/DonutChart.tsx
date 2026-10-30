import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { cn } from '@/lib/cn';
import { OTHER_KEY, sliceShare, type SlicePoint } from '@/models/chartSlices';
import { CATEGORY_OTHER, colors } from '@/theme/tokens';
import { compactMoney, formatMoney } from '@/utils/money';

export interface DonutChartProps {
  /** What the chart shows: "Stock value by category". Names the figure and the table. */
  title: string;
  /** Already folded to at most six plus Other (see foldSlices), largest first. */
  slices: readonly SlicePoint[];
  /**
   * One colour per named slice, in order: CATEGORY_PALETTE for things with an
   * identity, a ramp (rampSteps) for ordered ones like age. Other is always grey.
   */
  palette: readonly string[];
  /** The whole, for the centre — the server's total when there is one. */
  total?: number;
  /** Under the centre figure: "Stock value". */
  centerLabel: string;
  /** The column heading for the slices: "Category". */
  labelHeader: string;
  valueHeader?: string;
  format?: (value: number) => string;
  formatCenter?: (value: number) => string;
  /** "12 items" — what a slice's count is of. */
  countLabel?: (count: number) => string;
  /** A chosen slice: the others fade, and the centre reads it. */
  selectedKey?: string | null;
  /** Choosing a slice or its row (a filter on the view below). Other is not a choice. */
  onSelect?: (key: string) => void;
  /** What choosing does, for a screen reader: "List the items in". */
  selectVerb?: string;
  /**
   * Where a slice's row leads — a customer's record. Only the rows link: a
   * ring's slice is too easy to hit by mistake to send the reader off the
   * page, so it only lights its row. Null for a slice with nowhere to go.
   */
  hrefFor?: (key: string) => string | null;
  className?: string;
}

const fmtShare = (pct: number | null) => (pct === null ? '—' : `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`);

/**
 * A part-to-whole picture: a ring of at most six slices plus a grey Other,
 * the whole in its centre, and beside it a table of every slice — its value,
 * its share and what it counts — which is also how a keyboard or a screen
 * reader uses the chart. Hovering a row lights its slice, and the reverse.
 *
 * Colour is never the only key: every slice is named in the table, with its
 * swatch, value and share.
 */
export function DonutChart({
  title,
  slices,
  palette,
  total,
  centerLabel,
  labelHeader,
  valueHeader = 'Value',
  format = (v) => formatMoney(v),
  formatCenter = (v) => compactMoney(v),
  countLabel,
  selectedKey = null,
  onSelect,
  selectVerb = 'Show',
  hrefFor,
  className,
}: DonutChartProps) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const whole = total ?? slices.reduce((t, s) => t + s.value, 0);
  const drawn = slices.filter((s) => s.value > 0);
  if (whole <= 0 || drawn.length === 0) {
    return <p className="py-lg text-center text-body-sm text-text-tertiary">Nothing to show for this view.</p>;
  }

  let named = 0;
  const colorOf = new Map<string, string>();
  for (const s of slices) {
    colorOf.set(s.key, s.key === OTHER_KEY ? CATEGORY_OTHER : (palette[named++] ?? CATEGORY_OTHER));
  }
  const focusKey = hoverKey ?? selectedKey;
  const focus = focusKey ? slices.find((s) => s.key === focusKey) : undefined;
  const choosable = (s: SlicePoint) => !!onSelect && s.key !== OTHER_KEY;

  return (
    <figure
      aria-label={title}
      className={cn('grid items-center gap-lg sm:grid-cols-[minmax(9rem,13rem)_minmax(0,1fr)]', className)}
    >
      <div className="relative mx-auto aspect-square w-full max-w-[13rem]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer={false}>
            <Pie
              data={drawn}
              dataKey="value"
              nameKey="label"
              innerRadius="64%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke={colors.surface}
              strokeWidth={2}
              isAnimationActive={false}
              onMouseEnter={(_, i) => setHoverKey(drawn[i]?.key ?? null)}
              onMouseLeave={() => setHoverKey(null)}
              onClick={(_, i) => {
                const s = drawn[i];
                if (s && choosable(s)) onSelect?.(s.key);
              }}
            >
              {drawn.map((s) => (
                <Cell
                  key={s.key}
                  fill={colorOf.get(s.key)}
                  opacity={focusKey && focusKey !== s.key ? 0.3 : 1}
                  style={{ cursor: choosable(s) ? 'pointer' : 'default', outline: 'none' }}
                />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                const s = active && payload?.[0] ? (payload[0].payload as SlicePoint) : null;
                if (!s) return null;
                return (
                  <div
                    className="min-w-[11rem] rounded-md bg-surface px-sm py-xs shadow-md"
                    style={{ border: `1px solid ${colors.border}` }}
                  >
                    <p className="text-label-md text-text-primary">{s.label}</p>
                    <p className="mt-[2px] flex justify-between gap-md text-caption">
                      <span className="tabular text-text-primary">{format(s.value)}</span>
                      <span className="tabular text-text-secondary">{fmtShare(sliceShare(s, whole))}</span>
                    </p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* The whole, or the slice in focus. Text, not SVG: it wraps and scales with the type. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-lg text-center">
          <p className="max-w-full truncate text-h4 tabular text-text-primary">
            {formatCenter(focus ? focus.value : whole)}
          </p>
          <p className="line-clamp-2 text-caption text-text-tertiary">
            {focus ? `${focus.label} · ${fmtShare(sliceShare(focus, whole))}` : centerLabel}
          </p>
        </div>
      </div>

      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="border-b border-border-light text-overline text-text-tertiary">
            <th scope="col" className="py-xxs text-left font-normal">
              {labelHeader}
            </th>
            <th scope="col" className="py-xxs pl-sm text-right font-normal">
              {valueHeader}
            </th>
            <th scope="col" className="w-14 py-xxs pl-sm text-right font-normal">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {slices.map((s) => {
            const selected = selectedKey === s.key;
            const href = s.key !== OTHER_KEY ? (hrefFor?.(s.key) ?? null) : null;
            const swatch = (
              <span
                aria-hidden="true"
                className="mt-[3px] size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: colorOf.get(s.key) }}
              />
            );
            const name = (
              <span className="min-w-0">
                <span className="block truncate text-text-primary">{s.label}</span>
                {countLabel && s.count !== undefined && (
                  <span className="block text-caption text-text-tertiary">{countLabel(s.count)}</span>
                )}
              </span>
            );
            return (
              <tr
                key={s.key}
                onMouseEnter={() => setHoverKey(s.key)}
                onMouseLeave={() => setHoverKey(null)}
                className={cn(
                  'border-b border-border-light last:border-b-0',
                  selected && 'bg-primary-tint',
                  focusKey && focusKey !== s.key && 'text-text-tertiary',
                )}
              >
                <th scope="row" className="py-xs text-left font-normal">
                  {href ? (
                    <Link
                      to={href}
                      aria-label={`Open ${s.label}`}
                      onFocus={() => setHoverKey(s.key)}
                      onBlur={() => setHoverKey(null)}
                      className="group flex w-full min-w-0 items-start gap-xs rounded-xs text-left focus-visible:outline-2 focus-visible:outline-border-focus"
                    >
                      {swatch}
                      <span className="min-w-0 group-hover:underline">{name}</span>
                      <ChevronRight className="mt-[2px] size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                    </Link>
                  ) : choosable(s) ? (
                    <button
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${selectVerb} ${s.label}`}
                      onClick={() => onSelect?.(s.key)}
                      onFocus={() => setHoverKey(s.key)}
                      onBlur={() => setHoverKey(null)}
                      className="flex w-full min-w-0 items-start gap-xs rounded-xs text-left hover:underline focus-visible:outline-2 focus-visible:outline-border-focus"
                    >
                      {swatch}
                      {name}
                    </button>
                  ) : (
                    <span className="flex min-w-0 items-start gap-xs">
                      {swatch}
                      {name}
                    </span>
                  )}
                </th>
                <td className="py-xs pl-sm text-right align-top tabular whitespace-nowrap text-text-primary">
                  {format(s.value)}
                </td>
                <td className="py-xs pl-sm text-right align-top tabular text-text-secondary">
                  {fmtShare(sliceShare(s, whole))}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border">
            <th scope="row" className="py-xs text-left text-label-md text-text-primary">
              Total
            </th>
            <td className="py-xs pl-sm text-right tabular whitespace-nowrap text-label-md text-text-primary">
              {format(whole)}
            </td>
            <td className="py-xs pl-sm text-right tabular text-text-secondary">100%</td>
          </tr>
        </tfoot>
      </table>
    </figure>
  );
}

export default DonutChart;
