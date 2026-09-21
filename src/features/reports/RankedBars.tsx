import { colors } from '@/theme/tokens';

export interface RankedPoint {
  key: string;
  label: string;
  value: number;
  /** Shown under the label — units, margin, whatever qualifies the bar. */
  hint?: string;
}

export interface RankedBarsProps {
  points: RankedPoint[];
  /** How many bars before the tail folds into one "Other". */
  limit?: number;
  format: (value: number) => string;
  emptyLabel?: string;
}

/**
 * A ranked comparison — "which items earn the most" — not a time series.
 *
 * Lifted out of AnalyticsPage, where it was a local helper capped at five, so
 * the inventory report can reuse it rather than grow a second one. Two things
 * changed on the way:
 *
 * **One hue, not one per bar.** The original cycled CHART_SERIES, which is a
 * categorical palette: it spends the identity channel re-encoding what bar
 * length already says, and it runs out once a warehouse has more than five
 * items. Bar length carries the comparison here.
 *
 * **Negative values render.** The original computed `(value / max) * 100`,
 * which gives a NEGATIVE width on a loss-making row — the bar vanishes, and
 * that is precisely the row worth seeing. Scaling on magnitude and colouring
 * the bar with the danger token puts it back: an item sold below cost is a
 * status, not a series, and it is the most important thing this chart can say.
 */
export function RankedBars({
  points,
  limit = 10,
  format,
  emptyLabel = 'Nothing to rank yet.',
}: RankedBarsProps) {
  if (points.length === 0) {
    return <p className="text-body-sm text-text-tertiary">{emptyLabel}</p>;
  }

  const head = points.slice(0, limit);
  const tail = points.slice(limit);
  // Folded rather than dropped, so the bars still add up to the total above
  // them — otherwise the chart quietly disagrees with the table.
  const rows: RankedPoint[] = tail.length
    ? [
        ...head,
        {
          key: '__other__',
          label: `Other (${tail.length})`,
          value: tail.reduce((t, p) => t + p.value, 0),
        },
      ]
    : head;

  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0);

  return (
    <ul className="flex flex-col gap-sm">
      {rows.map((r) => {
        const negative = r.value < 0;
        const pct = max > 0 ? Math.max(2, (Math.abs(r.value) / max) * 100) : 2;
        return (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-sm">
              <span className="truncate text-body-sm text-text-primary">
                {r.label}
              </span>
              <span
                className={`shrink-0 tabular text-label-md ${
                  negative ? 'text-danger' : 'text-text-primary'
                }`}
              >
                {format(r.value)}
              </span>
            </div>
            <div className="mt-xxs h-[6px] overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full"
                // Width and colour are runtime values, so neither can be a
                // Tailwind class.
                style={{
                  width: `${pct}%`,
                  backgroundColor: negative ? colors.danger : colors.navy500,
                }}
              />
            </div>
            {r.hint && (
              <p className="mt-xxs text-overline text-text-tertiary">{r.hint}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default RankedBars;
