// ═══════════════════════════════════════════════════════
// FinMatrix Web — Pagination
// ═══════════════════════════════════════════════════════
// The arithmetic behind <Pagination>, kept apart so it is tested on its own.

/**
 * The page numbers to draw: the first, the last, the current one and its
 * neighbours, with a gap (null) wherever pages are skipped —
 * `1 … 4 5 6 … 12`. Never more than seven slots, so the bar does not grow
 * with the list.
 */
export const pageSlots = (page: number, pages: number): Array<number | null> => {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: Array<number | null> = [1];
  let from = Math.max(2, Math.min(page - 1, pages - 4));
  let to = Math.min(pages - 1, Math.max(page + 1, 5));
  // A gap standing in for a single page is no shorter than the page itself.
  if (from === 3) from = 2;
  if (to === pages - 2) to = pages - 1;
  if (from > 2) out.push(null);
  for (let p = from; p <= to; p++) out.push(p);
  if (to < pages - 1) out.push(null);
  out.push(pages);
  return out;
};
