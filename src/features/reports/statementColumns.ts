// ═══════════════════════════════════════════════════════
// FinMatrix Web — Statement columns
// ═══════════════════════════════════════════════════════
// One column spec, read by the screen table, the CSV and the PDF. Whatever is
// on screen — a comparison, the change, a common-size column — is exactly
// what is exported, because all three walk this list.

import { variance, type StatementRowData } from '@/models/reportStatement';

export type StatementColumnKey = 'current' | 'prior' | 'change' | 'changePct' | 'pctOfTotal';

export interface StatementColumn {
  key: StatementColumnKey;
  header: string;
}

/**
 * The columns a statement shows.
 *
 *   current                         always
 *   prior · change · changePct      when comparing
 *   pctOfTotal                      when common-size is on ("% of total assets")
 */
export const statementColumns = (opts: {
  comparing?: boolean;
  commonSize?: boolean;
  currentLabel?: string;
  priorLabel?: string;
  pctLabel?: string;
}): StatementColumn[] => {
  const cols: StatementColumn[] = [
    { key: 'current', header: opts.currentLabel ?? (opts.comparing ? 'Current' : 'Amount') },
  ];
  if (opts.comparing) {
    cols.push(
      { key: 'prior', header: opts.priorLabel ?? 'Prior' },
      { key: 'change', header: 'Change' },
      { key: 'changePct', header: '%' },
    );
  }
  if (opts.commonSize) cols.push({ key: 'pctOfTotal', header: opts.pctLabel ?? '% of total' });
  return cols;
};

export const isPercentColumn = (key: StatementColumnKey): boolean =>
  key === 'changePct' || key === 'pctOfTotal';

/**
 * A row's figure in one column, or null when it has none (a heading, a row
 * with no prior figure, a percentage of a zero base).
 *
 * The change is the server's when it sent one; only the P&L and cash flow —
 * whose comparison is a second fetch — fall back to `variance()`.
 */
export const cellValue = (row: StatementRowData, key: StatementColumnKey): number | null => {
  const amount = row.amount ?? null;
  const prior = row.prior ?? null;
  switch (key) {
    case 'current':
      return amount;
    case 'prior':
      // A row that can carry a figure but has no prior one reads as nil in the
      // comparison column; a heading stays blank.
      return amount === null ? null : prior;
    case 'change':
      if (row.change !== undefined) return row.change;
      return amount !== null && prior !== null ? variance(amount, prior).delta : null;
    case 'changePct':
      if (row.changePct !== undefined) return row.changePct;
      return amount !== null && prior !== null ? variance(amount, prior).percent : null;
    case 'pctOfTotal':
      return row.pctOfTotal ?? null;
  }
};

const MINUS = '−';

/** 12.4% · −3.1% — a percentage cell. */
export const formatPctCell = (value: number | null): string => {
  if (value === null) return '';
  const text = `${Math.abs(value).toFixed(1)}%`;
  return value < 0 ? `${MINUS}${text}` : text;
};

/**
 * Statement rows as CSV: a header row of the visible columns, then one row
 * per statement line. Amounts are bare two-decimal numbers so the column sums
 * in a spreadsheet; percentages keep their % sign.
 */
export const statementCsvRows = (
  rows: StatementRowData[],
  columns: StatementColumn[],
  labelHeader = 'Line',
): (string | number | null)[][] => [
  [labelHeader, ...columns.map((c) => c.header)],
  ...rows.map((row) => {
    const heading = row.amount === undefined && !row.isTotal && !row.isGrand;
    return [
      row.label,
      ...columns.map((c) => {
        const value = heading ? null : cellValue(row, c.key);
        if (value === null) return '';
        return isPercentColumn(c.key) ? formatPctCell(value) : value.toFixed(2);
      }),
    ];
  }),
];
