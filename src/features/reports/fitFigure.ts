/**
 * A CSS font-size that fits a one-line figure to the width of its container.
 *
 * Headline tiles sit in `minmax(0, 1fr)` grid tracks, so a figure wider than its
 * tile had nowhere to go: it was cut off while the tile clipped its overflow, and
 * would otherwise run out of the card — "Rs 123,545,423,399.52" at text-h3 in a
 * four-up row, or a ten-million figure in the tax page's four-up row at 1024px,
 * where a tile has about 130px inside. A rule on length alone cannot be right for both, so the
 * size follows the tile: `100cqi` is the width of the nearest `@container`, and
 * a tabular figure runs about 0.49em a character (measured, Inter at text-h3),
 * taken as 0.52 for margin. The result never exceeds `max` — a figure that fits
 * keeps its headline size — and never drops below 12px.
 *
 * Without container-query support the declaration is invalid and the class's
 * own font-size applies, which is the behaviour this replaces.
 */
export const fitFigureFontSize = (text: string, max = 'var(--text-h3, 19px)'): string => {
  const ems = Math.max(1, text.length) * 0.52;
  return `clamp(12px, calc(100cqi / ${ems.toFixed(2)}), ${max})`;
};
