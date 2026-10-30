// ═══════════════════════════════════════════════════════
// FinMatrix Web — The inventory report's stock picture
// ═══════════════════════════════════════════════════════
// Which chart the stock composition card draws, and how it cuts the stock.
// Kept in the URL (`chart`, `by`), so a link opens the same picture.

export type CompositionView = 'pie' | 'bar' | 'line';
export type CompositionDimension = 'category' | 'location' | 'age';

export const COMPOSITION_VIEWS: readonly CompositionView[] = ['pie', 'bar', 'line'];
export const COMPOSITION_DIMENSIONS: readonly CompositionDimension[] = ['category', 'location', 'age'];
