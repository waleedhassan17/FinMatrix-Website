import { cn } from '@/lib/cn';
import type { AgingBuckets, AgingRow } from '@/serializers/reportSerializers';
import { formatAmount } from '@/utils/money';

/** Bucket order and headings, shared by the table, the chart and the CSV. */
export const AGING_BUCKETS: { key: keyof AgingBuckets; label: string }[] = [
  { key: 'current', label: 'Current' },
  { key: 'bucket1to30', label: '1–30' },
  { key: 'bucket31to60', label: '31–60' },
  { key: 'bucket61to90', label: '61–90' },
  { key: 'bucket90Plus', label: '91 and over' },
];

export interface AgingTableProps {
  rows: AgingRow[];
  totals: AgingBuckets;
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
  rows,
  totals,
  counterpartyHeader,
  className,
}: AgingTableProps) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th className="px-md py-sm text-left text-overline text-text-secondary">
              {counterpartyHeader}
            </th>
            {AGING_BUCKETS.map(({ key, label }) => (
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
              {AGING_BUCKETS.map(({ key }) => (
                <td
                  key={key}
                  className={cn(
                    'px-md py-sm text-right tabular text-body-sm whitespace-nowrap',
                    // The oldest bucket is the one worth noticing, and only when
                    // it actually carries something.
                    key === 'bucket90Plus' && row[key] > 0
                      ? 'text-danger'
                      : 'text-text-primary',
                  )}
                >
                  {row[key] ? formatAmount(row[key]) : '—'}
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
            {AGING_BUCKETS.map(({ key }) => (
              <td
                key={key}
                className="px-md py-sm text-right tabular text-label-lg whitespace-nowrap text-text-primary"
              >
                {totals[key] ? formatAmount(totals[key]) : '—'}
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
