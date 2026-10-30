import { ChevronRight } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { PAYMENT_TERMS_LABELS, paymentTermsFromApi } from '@/models/customer';
import { AGING_STATUS_LABEL, agingPartyLabel, canDrillParty, type AgingStatus } from '@/models/reportAging';
import { formatShortDate } from '@/models/reportPeriod';
import type {
  AgingBucketDef,
  AgingRow,
  AgingTotals,
} from '@/serializers/reportSerializers';
import { formatAmount } from '@/utils/money';

export interface AgingTableProps {
  /**
   * Bucket order and headings, from the payload. This used to be a module
   * constant naming the five fixed fields; it is data now, because a company
   * trading on 3-day terms needs columns that match how it sells.
   */
  buckets: AgingBucketDef[];
  /**
   * Already filtered and sorted — see `visibleAgingRows`. The table renders what
   * it is given and orders nothing itself, so there is exactly one place where
   * "which rows, in what order" is decided and it is unit-tested.
   */
  rows: AgingRow[];
  totals: AgingTotals;
  /** "Customer" for receivables, "Vendor" for payables. */
  counterpartyHeader: string;
  /** The bucket being filtered on, if any. Tints its column. */
  selectedBucket?: string | null;
  /**
   * Supplying this makes the column headings buttons that select their bucket.
   * That is the keyboard-reachable route to a filter — clicking a bar in an SVG
   * chart is not one — and it makes the interaction discoverable without hover.
   */
  onSelectBucket?: (key: string | null) => void;
  /**
   * Row expansion, ported from `StatementTable` rather than shared with it —
   * the two tables have genuinely different row models and the docblock above
   * explains why they stay separate. Supply all three or none; omitting them
   * leaves the matrix exactly as it was.
   */
  expanded?: Record<string, boolean>;
  onToggleParty?: (partyId: string) => void;
  renderDetail?: (row: AgingRow) => ReactNode;
  /**
   * Whether some parties are hidden. Defaults to "a bucket is selected"; the
   * page also passes true while a name search is narrowing the rows, because
   * the footer then covers parties that are not on screen either way.
   */
  filtered?: boolean;
  /**
   * Which columns: the age buckets (the report itself), or the account view —
   * terms, credit limit, last payment and oldest due date (reports v2). One or
   * the other, so a row never runs to a dozen columns.
   */
  columnsView?: 'buckets' | 'account';
  /** A/R only: show the credit-limit column. */
  showCreditLimit?: boolean;
  /** Where each party stands — Current, Overdue, 90+ — for the chip by its name. */
  statusOf?: (row: AgingRow) => AgingStatus;
  className?: string;
}

/** The account view's columns, before Total. */
const accountColumns = (showCreditLimit: boolean) => [
  'Terms',
  ...(showCreditLimit ? ['Credit limit'] : []),
  'Last payment',
  'Oldest due',
];

const termsLabel = (raw: string) => (raw ? PAYMENT_TERMS_LABELS[paymentTermsFromApi(raw)] : '—');

/** The account view's cells for one party, before Total. */
const accountCells = (row: AgingRow, showCreditLimit: boolean) => [
  termsLabel(row.paymentTerms),
  ...(showCreditLimit
    ? [
        row.creditLimit !== null
          ? `${formatAmount(row.creditLimit)}${row.creditUsedPct !== null ? ` · ${Math.round(row.creditUsedPct)}% used` : ''}`
          : 'No limit',
      ]
    : []),
  row.lastPaymentDate
    ? `${formatShortDate(row.lastPaymentDate)}${row.lastPaymentAmount !== null ? ` · ${formatAmount(row.lastPaymentAmount)}` : ''}`
    : 'None',
  row.oldestDueDate ? formatShortDate(row.oldestDueDate) : '—',
];

const STATUS_CHIP: Record<AgingStatus, string> = {
  current: 'bg-success-lighter text-success-hover',
  overdue: 'bg-warning-lighter text-warning-hover',
  '90plus': 'bg-danger-lighter text-danger-hover',
};

/** Where a party stands, in words — the colour only repeats what they say. */
function StatusChip({ status }: { status: AgingStatus }) {
  return (
    <span
      className={cn(
        'ml-xs inline-flex shrink-0 items-center rounded-full px-xs text-label-sm whitespace-nowrap',
        STATUS_CHIP[status],
      )}
    >
      {AGING_STATUS_LABEL[status]}
    </span>
  );
}

/** Said beside the name in both views: the one party fact worth colour. */
function OverLimitChip() {
  return (
    <span className="ml-xs inline-flex shrink-0 items-center rounded-full border border-warning-light bg-warning-lighter px-xs text-label-sm text-warning">
      Over limit
    </span>
  );
}

/**
 * The aging matrix: one row per counterparty, one column per bucket.
 *
 * A grid rather than a `StatementTable` — every row here has the same shape, which
 * is exactly what a statement's rows do not.
 *
 * Amounts use `formatAmount` (no currency prefix) because the header already says
 * the column is money and seven `Rs ` prefixes per row is noise. Zeroes print as an
 * em-dash so the eye goes to the figures that exist.
 *
 * **The footer always prints the server's totals, filtered or not.** That stays
 * honest under a bucket filter because filtering on `amounts[k] > 0` is
 * total-preserving for column k: every hidden row contributes exactly 0 to it, so
 * `totals.amounts[k]` still IS the visible sum. The other columns genuinely do
 * exceed what is on screen, which is why the footer relabels itself rather than
 * re-adding anything — this client never foots a column (see reportStatement.ts).
 */
/** The first column, pinned while the figures scroll horizontally beneath it. */
const STICKY = 'sticky left-0 z-[1]';

export function AgingTable({
  buckets,
  rows,
  totals,
  counterpartyHeader,
  selectedBucket = null,
  onSelectBucket,
  expanded,
  onToggleParty,
  renderDetail,
  filtered: filteredProp,
  columnsView = 'buckets',
  showCreditLimit = false,
  statusOf,
  className,
}: AgingTableProps) {
  const oldestKey = buckets[buckets.length - 1]?.key;
  const filtered = filteredProp ?? Boolean(selectedBucket);
  const accountView = columnsView === 'account';
  const extra = accountColumns(showCreditLimit);
  // Counterparty + every bucket (or the account columns) + Total. Computed,
  // never a literal: the bucket set is configurable and runs to fourteen.
  const columnCount = (accountView ? extra.length : buckets.length) + 2;

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse">
        <caption className="sr-only">{counterpartyHeader} aging</caption>
        <thead>
          <tr className="border-b border-border bg-surface-2">
            {/* The name column stays put while a wide bucket set scrolls under
                it — fourteen columns of figures with no name are unreadable. */}
            <th className={cn(STICKY, 'min-w-[11rem] bg-surface-2 px-md py-sm text-left text-overline text-text-secondary')}>
              {counterpartyHeader}
            </th>
            {accountView && extra.map((h) => (
              <th key={h} className="px-md py-sm text-right text-overline whitespace-nowrap text-text-secondary">
                {h}
              </th>
            ))}
            {!accountView && buckets.map(({ key, label }) => (
              <th
                key={key}
                aria-sort={key === selectedBucket ? 'descending' : undefined}
                className={cn(
                  'px-md py-sm text-right text-overline whitespace-nowrap text-text-secondary',
                  key === selectedBucket && 'bg-primary-tint text-primary',
                )}
              >
                {onSelectBucket ? (
                  <button
                    type="button"
                    aria-pressed={key === selectedBucket}
                    onClick={() =>
                      onSelectBucket(key === selectedBucket ? null : key)
                    }
                    className="text-overline underline-offset-4 hover:text-primary hover:underline"
                  >
                    {label}
                  </button>
                ) : (
                  label
                )}
              </th>
            ))}
            <th className="px-md py-sm text-right text-overline text-text-secondary">
              Total
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => {
            // A row with no party id cannot be drilled: there is nothing to
            // address the request with, so it must not offer an affordance that
            // could only fail.
            const expandable = Boolean(onToggleParty && canDrillParty(row));
            const isOpen = Boolean(expanded?.[row.customerId]);
            const label = agingPartyLabel(row);

            return (
              <Fragment key={row.customerId || row.customerName}>
                <tr
                  className={cn(
                    'group border-b border-border-light transition-colors hover:bg-surface-2',
                    isOpen && 'bg-surface-2',
                  )}
                >
                  <td
                    className={cn(
                      STICKY,
                      'px-md py-sm text-body-sm text-text-primary group-hover:bg-surface-2',
                      isOpen ? 'bg-surface-2' : 'bg-surface',
                    )}
                  >
                    {expandable ? (
                      // The whole name is the target, not just the icon — a
                      // 14px glyph is a mean thing to ask anyone to hit.
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => onToggleParty?.(row.customerId)}
                        className="flex items-center gap-xs text-left text-label-md text-text-primary hover:text-primary"
                      >
                        <ChevronRight
                          aria-hidden="true"
                          className={cn(
                            'size-4 shrink-0 text-text-tertiary transition-transform',
                            isOpen && 'rotate-90 text-primary',
                          )}
                        />
                        {label}
                        {statusOf && <StatusChip status={statusOf(row)} />}
                        {row.overLimit && <OverLimitChip />}
                      </button>
                    ) : (
                      <span className="pl-xl text-label-md">
                        {label}
                        {statusOf && <StatusChip status={statusOf(row)} />}
                        {row.overLimit && <OverLimitChip />}
                      </span>
                    )}
                  </td>
                  {accountView && accountCells(row, showCreditLimit).map((cell, i) => (
                    <td key={i} className="px-md py-sm text-right tabular text-body-sm whitespace-nowrap text-text-primary">
                      {cell}
                    </td>
                  ))}
                  {!accountView && buckets.map(({ key }) => (
                    <td
                      key={key}
                      className={cn(
                        'px-md py-sm text-right tabular text-body-sm whitespace-nowrap',
                        // The oldest bucket is the one worth noticing, and only
                        // when it actually carries something. Which bucket that
                        // is now depends on the preset, so it is read off the
                        // spec rather than hardcoded to bucket90Plus. Severity,
                        // not selection — orthogonal, and both can apply at once.
                        !row.amounts[key]
                          ? 'text-text-tertiary'
                          : key === oldestKey
                            ? 'text-danger'
                            : 'text-text-primary',
                        key === selectedBucket && 'bg-primary-tint/60',
                      )}
                    >
                      {row.amounts[key] ? formatAmount(row.amounts[key]) : '—'}
                    </td>
                  ))}
                  <td className="px-md py-sm text-right tabular text-label-md whitespace-nowrap text-text-primary">
                    {formatAmount(row.total)}
                  </td>
                </tr>

                {isOpen && renderDetail && (
                  // print:hidden — the printed report is the summary, and
                  // expanded documents would add figures the footer's totals
                  // do not include.
                  <tr className="border-b border-border-light print:hidden">
                    <td colSpan={columnCount} className="p-0">
                      {renderDetail(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>

        <tfoot>
          {/* The accounting convention for a total: a rule above it, a double
              rule beneath. It is how a reader finds the bottom line. */}
          <tr className="border-t border-text-primary border-b-[3px] border-b-border-strong border-double bg-surface-2">
            <td className={cn(STICKY, 'bg-surface-2 px-md py-sm text-label-lg text-text-primary')}>
              {/* Said out loud while filtered: every column except the selected
                  one is summed over parties that are not on screen. */}
              {filtered ? 'Total (all parties)' : 'Total'}
            </td>
            {accountView && extra.map((h) => <td key={h} />)}
            {!accountView && buckets.map(({ key }) => (
              <td
                key={key}
                className={cn(
                  'px-md py-sm text-right tabular text-label-lg whitespace-nowrap text-text-primary',
                  key === selectedBucket && 'bg-primary-tint',
                )}
              >
                {totals.amounts[key] ? formatAmount(totals.amounts[key]) : '—'}
              </td>
            ))}
            <td className="px-md py-sm text-right tabular text-h5 whitespace-nowrap text-text-primary">
              {formatAmount(totals.total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default AgingTable;
