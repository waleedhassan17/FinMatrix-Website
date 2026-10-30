// ═══════════════════════════════════════════════════════
// FinMatrix Web — Reports as printable tables
// ═══════════════════════════════════════════════════════
// A report page already knows its rows — the same ones it draws on screen and
// writes to CSV. These types carry them to the PDF, so a printed statement and
// the one on screen are built from one list and cannot disagree.

import type { DocCompany, DocParty, DocTotal } from '@/features/documents/documentModel';
import {
  cellValue,
  formatPctCell,
  isPercentColumn,
  statementColumns,
  type StatementColumn,
} from '@/features/reports/statementColumns';
import { rowKind, type StatementRowData } from '@/models/reportStatement';
import { parenNegative } from '@/utils/money';

/** A number is a figure and is formatted; a string is printed as it is. */
export type ReportCell = string | number | null | undefined;

export interface ReportColumn {
  header: string;
  align?: 'left' | 'right';
  /** Relative width. */
  flex?: number;
}

export interface ReportRow {
  cells: ReportCell[];
  sub?: string;
  bold?: boolean;
  total?: boolean;
  grand?: boolean;
  heading?: boolean;
  depth?: number;
}

export interface ReportSection {
  title?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
}

export interface ReportPdfData {
  title: string;
  periodLabel: string;
  /** "Accrual basis", "Movements in the period"… */
  basis?: string;
  company: DocCompany;
  /** Statements for a customer or vendor name who they are for. */
  party?: DocParty | null;
  meta?: { label: string; value: string }[];
  sections: ReportSection[];
  /**
   * A totals block, right-aligned like a document's — "Net amount due" on a
   * summary. Drawn after the section at `totalsAfter` (by index), or after the
   * last section when that is not given.
   */
  totals?: DocTotal[];
  totalsAfter?: number;
  notes?: { title: string; text: string }[];
  /** Sign-off lines under the tables — "Received by" on a delivery note. */
  signatures?: string[];
}

/** Figures the way accountants write them: thousands separators, negatives in parentheses. */
export const reportCellText = (cell: ReportCell): string =>
  typeof cell === 'number' ? parenNegative(cell, '') : (cell ?? '');

/**
 * A financial statement's rows as a table: the label, then one column per
 * entry in `columns` — the same spec the screen table draws, so the PDF has
 * exactly the columns the reader was looking at.
 *
 * `comparing` / `currentLabel` / `priorLabel` remain for callers that predate
 * the column spec and mean current · prior · change · %.
 */
export function statementSection(
  rows: StatementRowData[],
  opts: {
    title?: string;
    comparing?: boolean;
    currentLabel?: string;
    priorLabel?: string;
    columns?: StatementColumn[];
  } = {},
): ReportSection {
  const spec =
    opts.columns ??
    statementColumns({
      comparing: opts.comparing,
      currentLabel: opts.currentLabel,
      priorLabel: opts.priorLabel,
    });
  const labelFlex = Math.max(3.5, 8 - spec.length * 1.2);
  const columns: ReportColumn[] = [
    { header: '', flex: labelFlex },
    ...spec.map((c): ReportColumn => ({
      header: c.header,
      align: 'right',
      flex: isPercentColumn(c.key) ? 1.1 : 2,
    })),
  ];

  return {
    title: opts.title,
    columns,
    rows: rows.map((r) => {
      const kind = rowKind(r);
      const cells: ReportCell[] = [r.label];
      for (const c of spec) {
        const value = kind === 'heading' ? null : cellValue(r, c.key);
        // Percentages are text — `reportCellText` would print a number as money.
        cells.push(isPercentColumn(c.key) ? formatPctCell(value) || null : value);
      }
      return {
        cells,
        bold: r.bold,
        total: kind === 'subtotal',
        grand: kind === 'grand',
        heading: kind === 'heading' && Boolean(r.bold),
        depth: r.depth,
      };
    }),
  };
}
