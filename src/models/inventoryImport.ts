// ═══════════════════════════════════════════════════════
// FinMatrix Web — Inventory import
// ═══════════════════════════════════════════════════════
// The result of previewing or committing an item spreadsheet, and the pure
// helpers the import page renders from. The server decides every rule
// (matching by SKU, the unit-cost lock, who may record opening stock); these
// only arrange its answer. Mirrors the app's models/inventoryImportModel.ts.

export type ImportAction = 'create' | 'update' | 'unchanged' | 'error';

export interface ImportFieldChange {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
}

export interface ImportOpeningStock {
  quantity: number;
  unitCost: number;
  value: number;
}

export interface ImportRow {
  rowNumber: number;
  sku: string;
  name: string;
  action: ImportAction;
  itemId: string | null;
  changes: ImportFieldChange[];
  openingStock: ImportOpeningStock | null;
  errors: string[];
  warnings: string[];
}

export interface ImportSummary {
  totalRows: number;
  create: number;
  update: number;
  unchanged: number;
  error: number;
  withWarnings: number;
  openingStock: {
    items: number;
    quantity: number;
    value: number;
    /** The value exactly as the server computed it — sent back on commit as
     *  the owner's confirmation, so it never round-trips through a float. */
    confirmValue: string;
  };
}

export interface ImportApplied {
  created: number;
  updated: number;
  openingStockItems: number;
  openingStockValue: number;
  openingStockDate: string | null;
  journalReference: string | null;
}

export interface ImportResult {
  fileName: string;
  recognizedColumns: string[];
  ignoredColumns: string[];
  openingStockAllowed: boolean;
  booksLockedUntil: string | null;
  summary: ImportSummary;
  rows: ImportRow[];
  /** Present only on a commit's answer. */
  applied: ImportApplied | null;
}

export type ImportTab = 'all' | 'create' | 'update' | 'unchanged' | 'error';

/** What the file input offers. The server decides by the file's bytes. */
export const IMPORT_ACCEPT =
  '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/** Why a chosen file cannot be sent, or null when it can. */
export const importFileError = (file: { name: string; size: number }): string | null => {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls')) {
    return 'This is an old Excel 97–2003 file. Open it in Excel, choose Save As → Excel Workbook (.xlsx), and upload that.';
  }
  if (!name.endsWith('.xlsx') && !name.endsWith('.csv')) return 'Choose an Excel (.xlsx) or CSV file.';
  if (file.size > IMPORT_MAX_BYTES) return 'This file is larger than 5 MB. Split it into smaller files.';
  return null;
};

/** The filter tabs over the preview, with their counts. Empty ones are hidden. */
export const importTabs = (
  summary: ImportSummary,
): Array<{ key: ImportTab; label: string; count: number }> =>
  (
    [
      { key: 'all', label: 'All', count: summary.totalRows },
      { key: 'create', label: 'New', count: summary.create },
      { key: 'update', label: 'Updates', count: summary.update },
      { key: 'unchanged', label: 'Unchanged', count: summary.unchanged },
      { key: 'error', label: 'Problems', count: summary.error },
    ] as const
  ).filter((t) => t.key === 'all' || t.count > 0);

export const rowsForTab = (rows: ImportRow[], tab: ImportTab): ImportRow[] =>
  tab === 'all' ? rows : rows.filter((r) => r.action === tab);

/** Rows the commit would write. Zero means there is nothing to import. */
export const rowsToApply = (summary: ImportSummary): number => summary.create + summary.update;

export const commitLabel = (summary: ImportSummary): string => {
  const n = rowsToApply(summary);
  return `Import ${n} item${n === 1 ? '' : 's'}`;
};

/**
 * Why the chosen opening-stock date cannot be used, or null when it can.
 * Mirrors the server: not in the future, and after the closed-books date.
 */
export const openingStockDateError = (
  date: string,
  today: string,
  booksLockedUntil: string | null,
): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Choose a date.';
  if (date > today) return 'Opening stock cannot be dated in the future.';
  if (booksLockedUntil && date <= booksLockedUntil) {
    return `The books are closed through ${booksLockedUntil}. Choose a later date.`;
  }
  return null;
};

export const appliedSummary = (applied: ImportApplied): string => {
  const parts: string[] = [];
  if (applied.created) parts.push(`${applied.created} added`);
  if (applied.updated) parts.push(`${applied.updated} updated`);
  return parts.length ? parts.join(', ') : 'Nothing needed changing';
};
