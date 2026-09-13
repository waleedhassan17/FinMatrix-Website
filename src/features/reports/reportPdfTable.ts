// ═══════════════════════════════════════════════════════
// FinMatrix Web — Reports as printable tables
// ═══════════════════════════════════════════════════════
// A report page already knows its rows — the same ones it draws on screen and
// writes to CSV. These types carry them to the PDF, so a printed statement and
// the one on screen are built from one list and cannot disagree.

import type { DocCompany, DocParty } from '@/features/documents/documentModel';
import type { StatementRowData } from '@/models/reportStatement';
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
  notes?: { title: string; text: string }[];
  /** Sign-off lines under the tables — "Received by" on a delivery note. */
  signatures?: string[];
}

/** Figures the way accountants write them: thousands separators, negatives in parentheses. */
export const reportCellText = (cell: ReportCell): string =>
  typeof cell === 'number' ? parenNegative(cell, '') : (cell ?? '');

/**
 * A financial statement's rows as a table: label and amount, or — when comparing
 * periods — label, current, prior and the change between them.
 */
export function statementSection(
  rows: StatementRowData[],
  opts: { title?: string; comparing?: boolean; currentLabel?: string; priorLabel?: string } = {},
): ReportSection {
  const comparing = Boolean(opts.comparing);
  const columns: ReportColumn[] = comparing
    ? [
        { header: '', flex: 4.5 },
        { header: opts.currentLabel ?? 'Current', align: 'right', flex: 2 },
        { header: opts.priorLabel ?? 'Prior', align: 'right', flex: 2 },
        { header: 'Change', align: 'right', flex: 1.7 },
      ]
    : [
        { header: '', flex: 6 },
        { header: 'Amount', align: 'right', flex: 2 },
      ];

  return {
    title: opts.title,
    columns,
    rows: rows.map((r) => {
      const hasAmount = r.amount !== undefined && r.amount !== null;
      const cells: ReportCell[] = [r.label, hasAmount ? r.amount : null];
      if (comparing) {
        const hasPrior = r.prior !== undefined && r.prior !== null;
        cells.push(hasPrior ? r.prior : null, hasAmount && hasPrior ? (r.amount as number) - (r.prior as number) : null);
      }
      return {
        cells,
        bold: r.bold,
        total: r.isTotal,
        grand: r.isGrand,
        heading: !hasAmount && Boolean(r.bold) && !r.isTotal && !r.isGrand,
        depth: r.depth,
      };
    }),
  };
}
