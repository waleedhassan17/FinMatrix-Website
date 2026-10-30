import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, MinusSquare, PlusSquare } from 'lucide-react';

import { cn } from '@/lib/cn';
import { InfoPopover } from '@/features/reports/InfoPopover';
import {
  cellValue,
  formatPctCell,
  isPercentColumn,
  statementColumns,
  type StatementColumn,
} from '@/features/reports/statementColumns';
import { useStatementDensity, type StatementDensity } from '@/features/reports/statementPrefs';
import { isZeroRow, rowKind, type StatementRowData } from '@/models/reportStatement';
import { formatAmount, parenNegative } from '@/utils/money';

export interface StatementTableProps {
  rows: StatementRowData[];
  /**
   * The figure columns, from `statementColumns()`. Leave it out and the table
   * derives them from `comparing` the way it always has.
   */
  columns?: StatementColumn[];
  /** Show the prior-period and variance columns (when `columns` is not given). */
  comparing?: boolean;
  /** Column heading for the current period, e.g. "Jan 1 – Mar 31". */
  currentLabel?: string;
  priorLabel?: string;
  className?: string;
  /**
   * Which account rows are open. Supplying this (with `onToggle`) makes rows
   * that carry an `accountCode` expandable in place — the P&L's drill-down.
   */
  expanded?: Record<string, boolean>;
  onToggle?: (accountCode: string) => void;
  /** What to draw underneath an expanded row, spanning every column. */
  renderDetail?: (row: StatementRowData) => ReactNode;
  /**
   * Opens a row's drill-down — the investigate panel. Rows become buttons
   * (Enter or Space), tint on hover and show a chevron.
   */
  onRowActivate?: (row: StatementRowData) => void;
  /** The row whose panel is open, kept highlighted behind it. */
  activeKey?: string | null;
  /** False hides account lines that are zero on every date shown. */
  showZero?: boolean;
  /**
   * Whether a rise on this row is good news (true), bad (false) or neither
   * (null). Colours the Change column only; statements are otherwise ink.
   */
  changeTone?: (row: StatementRowData) => boolean | null;
  /** Overrides the reader's saved density (print, tests). */
  density?: StatementDensity;
  /** Read by screen readers: what the table is. */
  caption?: string;
}

const rowKey = (row: StatementRowData, index: number): string => row.key ?? `${row.label}-${index}`;

/**
 * A section heading folds its section. A figureless row that is not a
 * heading — "No activity in this period" — has no section to fold, and a
 * section heading is always drawn bold, which is how the two are told apart.
 */
const foldable = (row: StatementRowData, kind: NonNullable<StatementRowData['kind']>): boolean =>
  kind === 'heading' && !!row.section && !!row.bold;

/**
 * A financial statement.
 *
 * Deliberately NOT `DataTable`. A statement is not a uniform grid — a row is a
 * section heading, an account, a subtotal or the bottom line, and each is drawn
 * differently — and `DataTable` has no footer or totals-row support at all. Forcing
 * one into a column set would mean either losing the rules and weights that make a
 * statement readable, or faking them per cell.
 *
 * Conventions, all of which matter to an accountant reading it:
 *   - figures right-aligned and `tabular`, so digits line up vertically
 *   - negatives in parentheses, not with a minus sign — the Change column too,
 *     so the screen reads like the PDF
 *   - subtotals ruled above and bolded; the bottom line ruled heavily
 *   - sub-rows indented by depth, so an account clearly belongs to its heading
 *   - a heading row carries no figure rather than a zero, because "no amount" and
 *     "zero" are different statements
 *   - colour only in the Change column, and only when the page says which way
 *     is good; everything else is ink
 */
export function StatementTable({
  rows,
  columns: columnsProp,
  comparing = false,
  currentLabel,
  priorLabel,
  className,
  expanded,
  onToggle,
  renderDetail,
  onRowActivate,
  activeKey,
  showZero = true,
  changeTone,
  density: densityProp,
  caption,
}: StatementTableProps) {
  const [savedDensity] = useStatementDensity();
  const density = densityProp ?? savedDensity;
  const columns = useMemo(
    () => columnsProp ?? statementColumns({ comparing, currentLabel, priorLabel }),
    [columnsProp, comparing, currentLabel, priorLabel],
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const columnCount = columns.length + 1;

  const visible = rows.filter((row) => {
    if (!showZero && isZeroRow(row)) return false;
    // A folded section keeps its heading and its subtotal: collapsed, it
    // still says what the section adds up to.
    const kind = rowKind(row);
    if (row.section && collapsed[row.section] && kind !== 'heading' && kind !== 'subtotal') {
      return false;
    }
    return true;
  });

  return (
    // Scrolls sideways inside itself on a narrow screen, with the label column
    // pinned. On a wide one it does not scroll at all, which is what lets the
    // header stay pinned to the top of the page as the statement scrolls.
    <div className={cn('max-lg:overflow-x-auto', className)}>
      <table className="w-full min-w-full border-collapse bg-surface">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className="sticky left-0 top-0 z-[3] bg-surface px-md py-sm text-left text-overline text-text-secondary"
            >
              <span className="sr-only">Line</span>
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className="sticky top-0 z-[2] bg-surface px-md py-sm text-right text-overline text-text-secondary whitespace-nowrap"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {visible.map((row, index) => {
            const code = row.accountCode;
            const kind = rowKind(row);
            // Expandable only where there is one account to expand INTO.
            // Headings and subtotals span several, so a + on them would promise
            // a list that cannot be built.
            const expandable = !!code && !!onToggle;
            const isOpen = expandable && !!expanded?.[code];
            const activatable =
              !!onRowActivate &&
              (row.drill ?? (kind === 'account' && !!code)) &&
              kind !== 'heading' &&
              kind !== 'subtotal' &&
              kind !== 'grand';
            const key = rowKey(row, index);
            return (
              <Fragment key={key}>
                <StatementTableRow
                  row={row}
                  kind={kind}
                  columns={columns}
                  density={density}
                  expandable={expandable}
                  expanded={isOpen}
                  onToggle={expandable ? () => onToggle(code) : undefined}
                  onActivate={activatable ? () => onRowActivate(row) : undefined}
                  active={!!activeKey && activeKey === (row.key ?? row.accountCode)}
                  sectionCollapsed={
                    foldable(row, kind) && row.section ? !!collapsed[row.section] : undefined
                  }
                  onToggleSection={
                    foldable(row, kind) && row.section
                      ? () =>
                          setCollapsed((prev) => ({
                            ...prev,
                            [row.section as string]: !prev[row.section as string],
                          }))
                      : undefined
                  }
                  higherIsBetter={changeTone ? changeTone(row) : null}
                />
                {isOpen && renderDetail && (
                  <tr>
                    <td colSpan={columnCount} className="p-0">
                      {renderDetail(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** "Accounts Receivable, 1,240,500.00, up 12%" — what a drillable row says aloud. */
const accessibleRowLabel = (row: StatementRowData): string => {
  const parts = [row.name ?? row.label];
  if (row.amount !== undefined) parts.push(formatAmount(row.amount));
  const pct = cellValue(row, 'changePct');
  if (pct !== null && pct !== 0) parts.push(`${pct > 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}%`);
  return parts.join(', ');
};

function StatementTableRow({
  row,
  kind,
  columns,
  density,
  expandable,
  expanded,
  onToggle,
  onActivate,
  active,
  sectionCollapsed,
  onToggleSection,
  higherIsBetter,
}: {
  row: StatementRowData;
  kind: NonNullable<StatementRowData['kind']>;
  columns: StatementColumn[];
  density: StatementDensity;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onActivate?: () => void;
  active?: boolean;
  sectionCollapsed?: boolean;
  onToggleSection?: () => void;
  higherIsBetter: boolean | null;
}) {
  const emphasis = row.bold || kind === 'grand';
  const pad = density === 'compact' ? 'py-xxs' : 'py-sm';

  const figureClass = cn(
    'px-md text-right tabular whitespace-nowrap',
    pad,
    kind === 'grand'
      ? 'text-h4 text-text-primary'
      : emphasis
        ? 'text-label-lg text-text-primary'
        : 'text-body-sm text-text-primary',
  );

  const labelText = row.name && row.accountCode ? (
    <>
      <span className="mr-xs tabular text-text-tertiary">{row.accountCode}</span>
      <span>{row.name}</span>
    </>
  ) : (
    row.label
  );

  const synthetic = kind === 'synthetic' && row.note ? (
    <InfoPopover label={`About ${row.name ?? row.label}`}>
      <p className="text-label-md text-text-primary">{row.name ?? row.label}</p>
      <p className="mt-xxs text-body-sm text-text-secondary">{row.note}</p>
    </InfoPopover>
  ) : null;

  let label: ReactNode;
  if (onToggleSection) {
    label = (
      <button
        type="button"
        onClick={onToggleSection}
        aria-expanded={!sectionCollapsed}
        className="flex items-center gap-xs text-left hover:text-primary"
      >
        {sectionCollapsed ? (
          <ChevronRight className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
        )}
        <span>{labelText}</span>
      </button>
    );
  } else if (expandable) {
    label = (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!!expanded}
        className="flex items-center gap-xs text-left hover:text-primary"
      >
        {expanded ? (
          <MinusSquare className="size-3.5 shrink-0 text-text-tertiary" />
        ) : (
          <PlusSquare className="size-3.5 shrink-0 text-text-tertiary" />
        )}
        <span>{labelText}</span>
      </button>
    );
  } else if (onActivate) {
    // A native button: Tab reaches it, Enter and Space open it. The click is
    // handled on the row, so this one only has to bubble.
    label = (
      <span className="flex items-center gap-xs">
        <button
          type="button"
          data-row-key={row.key ?? row.accountCode}
          aria-label={accessibleRowLabel(row)}
          aria-haspopup="dialog"
          className="flex min-w-0 flex-1 items-center gap-xs text-left outline-none focus-visible:underline"
        >
          <span className="min-w-0 truncate">{labelText}</span>
          <ChevronRight
            className="ml-auto size-4 shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            aria-hidden="true"
          />
        </button>
        {synthetic}
      </span>
    );
  } else {
    label = (
      <span className="flex items-center gap-xs">
        <span>{labelText}</span>
        {synthetic}
      </span>
    );
  }

  return (
    <tr
      onClick={onActivate}
      className={cn(
        'bg-surface',
        kind === 'subtotal' && 'border-t border-border-light',
        // The bottom line: ruled in ink above, double-ruled below — the same
        // closing rule as the aging table's footer, so it reads as the end of
        // the statement.
        kind === 'grand' &&
          'border-t border-text-primary border-b-[3px] border-b-border-strong border-double bg-surface-2',
        onActivate && 'group cursor-pointer hover:bg-surface-hover',
        active && 'bg-primary-tint hover:bg-primary-tint',
      )}
    >
      <td
        className={cn(
          // Pinned when the figures scroll sideways on a narrow screen; it
          // takes the row's own background so nothing shows through.
          'sticky left-0 z-[1] bg-inherit px-md',
          pad,
          kind === 'grand'
            ? 'text-h5 text-text-primary'
            : emphasis
              ? 'text-label-lg text-text-primary'
              : 'text-body-sm text-text-primary',
        )}
        // An indent is a computed offset, not a spacing token — there is no
        // utility for "depth times 16".
        style={{ paddingLeft: `calc(var(--spacing-md) + ${(row.depth ?? 0) * 16}px)` }}
      >
        {label}
      </td>

      {columns.map((col) => (
        <td
          key={col.key}
          className={cn(
            figureClass,
            // The prior column is secondary information; keeping it lighter
            // stops the eye reading two equally-weighted columns of figures.
            col.key === 'prior' && kind !== 'grand' && 'text-text-secondary',
            isPercentColumn(col.key) && kind !== 'grand' && 'text-text-secondary',
          )}
        >
          <FigureCell row={row} kind={kind} column={col} higherIsBetter={higherIsBetter} />
        </td>
      ))}
    </tr>
  );
}

function FigureCell({
  row,
  kind,
  column,
  higherIsBetter,
}: {
  row: StatementRowData;
  kind: NonNullable<StatementRowData['kind']>;
  column: StatementColumn;
  higherIsBetter: boolean | null;
}) {
  // A heading carries no figure. An explicit undefined is the signal; a zero
  // would claim the section nets to nothing, which is a different claim.
  if (kind === 'heading') return null;
  const value = cellValue(row, column.key);

  if (column.key === 'current') return <>{value === null ? '' : parenNegative(value)}</>;
  if (value === null) return <>{column.key === 'pctOfTotal' ? '' : '—'}</>;
  if (isPercentColumn(column.key)) return <>{formatPctCell(value)}</>;
  if (column.key === 'change') {
    const tone =
      higherIsBetter === null || value === 0
        ? null
        : value > 0 === higherIsBetter
          ? 'text-success'
          : 'text-danger';
    return <span className={tone ?? undefined}>{parenNegative(value)}</span>;
  }
  return <>{parenNegative(value)}</>;
}

export default StatementTable;
