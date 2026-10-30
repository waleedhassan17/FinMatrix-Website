// ═══════════════════════════════════════════════════════
// FinMatrix Web — Slices for a part-to-whole chart
// ═══════════════════════════════════════════════════════
// A donut can only show parts of a positive whole, and only a handful of them:
// the categorical palette has six hues, so a seventh category folds into a
// grey "Other" rather than borrowing a colour that already means something.

export interface SlicePoint {
  key: string;
  label: string;
  value: number;
  /** What the slice counts — items, documents — when there is something to count. */
  count?: number;
  /** The share of the whole as the server sent it (0–100), when it did. */
  sharePct?: number | null;
}

export const OTHER_KEY = '__other__';

/** How many named slices a donut carries before the rest fold into Other. */
export const MAX_SLICES = 6;

/**
 * Whether these figures can be drawn as parts of a whole. A negative part — a
 * credit among expenses, stock carried below zero — has no slice, so the page
 * shows bars instead, which can hang below zero.
 */
export const canDonut = (points: readonly SlicePoint[]): boolean =>
  points.length > 0 && points.every((p) => p.value >= 0) && points.some((p) => p.value > 0);

/**
 * The largest `max` points by value, then one "Other" holding the rest — its
 * value the sum of what it holds, its count theirs. Points already in order
 * keep it; ties keep their label order. Nothing folds when nothing has to.
 */
export const foldSlices = (
  points: readonly SlicePoint[],
  max = MAX_SLICES,
  otherLabel = 'Other',
): SlicePoint[] => {
  const ranked = [...points].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  if (ranked.length <= max) return ranked;
  const kept = ranked.slice(0, max);
  const rest = ranked.slice(max);
  const counted = rest.every((p) => p.count !== undefined);
  return [
    ...kept,
    {
      key: OTHER_KEY,
      label: `${otherLabel} (${rest.length})`,
      // In paisa, so a long tail of decimals adds up exactly.
      value: rest.reduce((t, p) => t + Math.round(p.value * 100), 0) / 100,
      ...(counted ? { count: rest.reduce((t, p) => t + (p.count ?? 0), 0) } : {}),
    },
  ];
};

/** A slice's share of the whole, 0–100: the server's when it sent one, else its part of what is shown. */
export const sliceShare = (slice: SlicePoint, total: number): number | null => {
  if (slice.sharePct !== undefined && slice.sharePct !== null) return slice.sharePct;
  return total > 0 ? (slice.value / total) * 100 : null;
};
