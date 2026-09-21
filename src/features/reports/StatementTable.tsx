import { Fragment, type ReactNode } from 'react';
import { MinusSquare, PlusSquare } from 'lucide-react';

import { cn } from '@/lib/cn';
import type { StatementRowData } from '@/models/reportStatement';
import { variance } from '@/models/reportStatement';
import { formatMoney, parenNegative } from '@/utils/money';

export interface StatementTableProps {
  rows: StatementRowData[];
  /** Show the prior-period and variance columns. */
  comparing?: boolean;
  /** Column heading for the current period, e.g. "Jan 1 – Mar 31". */
  currentLabel?: string;
  priorLabel?: string;
  className?: string;
  /**
   * Which account rows are open. Supplying this (with `onToggle`) makes rows
   * that carry an `accountCode` expandable; leaving it out keeps the table
   * exactly as it was, which is what the balance sheet and trial balance want.
   */
  expanded?: Record<string, boolean>;
  onToggle?: (accountCode: string) => void;
  /** What to draw underneath an expanded row, spanning every column. */
  renderDetail?: (row: StatementRowData) => ReactNode;
}

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
 *   - negatives in parentheses, not with a minus sign — `parenNegative` exists in
 *     money.ts for exactly this and had no caller until now
 *   - subtotals ruled above and bolded; the bottom line ruled heavily
 *   - sub-rows indented by depth, so an account clearly belongs to its heading
 *   - a heading row carries no figure rather than a zero, because "no amount" and
 *     "zero" are different statements
 */
export function StatementTable({
  rows,
  comparing = false,
  currentLabel,
  priorLabel,
  className,
  expanded,
  onToggle,
  renderDetail,
}: StatementTableProps) {
  const columnCount = comparing ? 4 : 2;
  return (
    // Scrolls inside itself rather than pushing the page sideways — the
    // comparison columns make this wide on a narrow screen.
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-full border-collapse">
        {comparing && (
          <thead>
            <tr className="border-b border-border">
              <th className="px-md py-sm text-left text-overline text-text-secondary">
                {' '}
              </th>
              <th className="px-md py-sm text-right text-overline text-text-secondary">
                {currentLabel ?? 'Current'}
              </th>
              <th className="px-md py-sm text-right text-overline text-text-secondary">
                {priorLabel ?? 'Prior'}
              </th>
              <th className="px-md py-sm text-right text-overline text-text-secondary">
                Change
              </th>
            </tr>
          </thead>
        )}

        <tbody>
          {rows.map((row, index) => {
            const code = row.accountCode;
            // Expandable only where there is one account to expand INTO.
            // Headings and subtotals span several, so a + on them would promise
            // a list that cannot be built.
            const expandable = !!code && !!onToggle;
            const isOpen = expandable && !!expanded?.[code];
            return (
              <Fragment key={row.key ?? `${row.label}-${index}`}>
                <StatementTableRow
                  row={row}
                  comparing={comparing}
                  expandable={expandable}
                  expanded={isOpen}
                  onToggle={expandable ? () => onToggle(code) : undefined}
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

function StatementTableRow({
  row,
  comparing,
  expandable,
  expanded,
  onToggle,
}: {
  row: StatementRowData;
  comparing: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const emphasis = row.bold || row.isGrand;

  const amountClass = cn(
    'px-md py-sm text-right tabular whitespace-nowrap',
    row.isGrand
      ? 'text-h4 text-text-primary'
      : emphasis
        ? 'text-label-lg text-text-primary'
        : 'text-body-sm text-text-primary',
  );

  // A heading carries no figure. An explicit undefined is the signal; a zero
  // would claim the section nets to nothing, which is a different claim.
  const amount =
    row.amount === undefined ? '' : parenNegative(row.amount);
  const prior = row.prior === undefined ? '—' : parenNegative(row.prior);

  const change =
    row.amount === undefined || row.prior === undefined
      ? null
      : variance(row.amount, row.prior);

  return (
    <tr
      className={cn(
        row.isTotal && 'border-t border-border-light',
        // The bottom line gets a heavier rule, in the text colour rather than the
        // hairline grey, so it reads as the end of the statement.
        row.isGrand && 'border-t-2 border-text-primary',
      )}
    >
      <td
        className={cn(
          'px-md py-sm',
          row.isGrand
            ? 'text-h5 text-text-primary'
            : emphasis
              ? 'text-label-lg text-text-primary'
              : 'text-body-sm text-text-primary',
        )}
        // An indent is a computed offset, not a spacing token — there is no
        // utility for "depth times 16".
        style={{ paddingLeft: `calc(var(--spacing-md) + ${(row.depth ?? 0) * 16}px)` }}
      >
        {expandable ? (
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
            <span>{row.label}</span>
          </button>
        ) : (
          row.label
        )}
      </td>

      <td className={amountClass}>{amount}</td>

      {comparing && (
        <>
          <td
            className={cn(
              amountClass,
              // The prior column is secondary information; keeping it lighter
              // stops the eye reading two equally-weighted columns of figures.
              !row.isGrand && 'text-text-secondary',
            )}
          >
            {prior}
          </td>
          <td className={amountClass}>
            {change === null ? (
              '—'
            ) : (
              <span
                className={cn(
                  change.delta > 0 && 'text-success',
                  change.delta < 0 && 'text-danger',
                )}
              >
                {formatMoney(change.delta)}
                {change.percent !== null && (
                  <span className="ml-xxs text-caption text-text-tertiary">
                    {change.percent > 0 ? '+' : ''}
                    {change.percent}%
                  </span>
                )}
              </span>
            )}
          </td>
        </>
      )}
    </tr>
  );
}

export default StatementTable;
