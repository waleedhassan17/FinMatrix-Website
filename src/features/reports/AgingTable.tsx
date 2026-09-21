import { cn } from '@/lib/cn';
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
  rows: AgingRow[];
  totals: AgingTotals;
  /** "Customer" for receivables, "Vendor" for payables. */
  counterpartyHeader: string;
  className?: string;
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
 */
export function AgingTable({
  buckets,
  rows,
  totals,
  counterpartyHeader,
  className,
}: AgingTableProps) {
  const oldestKey = buckets[buckets.length - 1]?.key;

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th className="px-md py-sm text-left text-overline text-text-secondary">
              {counterpartyHeader}
            </th>
            {buckets.map(({ key, label }) => (
              <th
                key={key}
                className="px-md py-sm text-right text-overline whitespace-nowrap text-text-secondary"
              >
                {label}
              </th>
            ))}
            <th className="px-md py-sm text-right text-overline text-text-secondary">
              Total
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.customerId} className="border-b border-border-light">
              <td className="px-md py-sm text-body-sm text-text-primary">
                {row.customerName}
              </td>
              {buckets.map(({ key }) => (
                <td
                  key={key}
                  className={cn(
                    'px-md py-sm text-right tabular text-body-sm whitespace-nowrap',
                    // The oldest bucket is the one worth noticing, and only when
                    // it actually carries something. Which bucket that is now
                    // depends on the preset, so it is read off the spec rather
                    // than hardcoded to bucket90Plus.
                    key === oldestKey && (row.amounts[key] ?? 0) > 0
                      ? 'text-danger'
                      : 'text-text-primary',
                  )}
                >
                  {row.amounts[key] ? formatAmount(row.amounts[key]) : '—'}
                </td>
              ))}
              <td className="px-md py-sm text-right tabular text-label-lg whitespace-nowrap text-text-primary">
                {formatAmount(row.total)}
              </td>
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr className="bg-surface-2">
            <td className="px-md py-sm text-label-lg text-text-primary">Total</td>
            {buckets.map(({ key }) => (
              <td
                key={key}
                className="px-md py-sm text-right tabular text-label-lg whitespace-nowrap text-text-primary"
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
