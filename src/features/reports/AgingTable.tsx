import { cn } from '@/lib/cn';
import { agingPartyLabel } from '@/models/reportAging';
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
 *
 * **The footer always prints the server's totals, filtered or not.** That stays
 * honest under a bucket filter because filtering on `amounts[k] > 0` is
 * total-preserving for column k: every hidden row contributes exactly 0 to it, so
 * `totals.amounts[k]` still IS the visible sum. The other columns genuinely do
 * exceed what is on screen, which is why the footer relabels itself rather than
 * re-adding anything — this client never foots a column (see reportStatement.ts).
 */
export function AgingTable({
  buckets,
  rows,
  totals,
  counterpartyHeader,
  selectedBucket = null,
  onSelectBucket,
  className,
}: AgingTableProps) {
  const oldestKey = buckets[buckets.length - 1]?.key;
  const filtered = Boolean(selectedBucket);

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
                aria-sort={key === selectedBucket ? 'descending' : undefined}
                className={cn(
                  'px-md py-sm text-right text-overline whitespace-nowrap text-text-secondary',
                  key === selectedBucket && 'bg-surface-hover text-text-primary',
                )}
              >
                {onSelectBucket ? (
                  <button
                    type="button"
                    aria-pressed={key === selectedBucket}
                    onClick={() =>
                      onSelectBucket(key === selectedBucket ? null : key)
                    }
                    className="text-overline underline-offset-2 hover:text-primary hover:underline"
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
          {rows.map((row) => (
            <tr
              key={row.customerId || row.customerName}
              className="border-b border-border-light"
            >
              <td className="px-md py-sm text-body-sm text-text-primary">
                {agingPartyLabel(row)}
              </td>
              {buckets.map(({ key }) => (
                <td
                  key={key}
                  className={cn(
                    'px-md py-sm text-right tabular text-body-sm whitespace-nowrap',
                    // The oldest bucket is the one worth noticing, and only when
                    // it actually carries something. Which bucket that is now
                    // depends on the preset, so it is read off the spec rather
                    // than hardcoded to bucket90Plus. Severity, not selection —
                    // the two are orthogonal and both can apply at once.
                    key === oldestKey && (row.amounts[key] ?? 0) > 0
                      ? 'text-danger'
                      : 'text-text-primary',
                    key === selectedBucket && 'bg-surface-hover',
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
            <td className="px-md py-sm text-label-lg text-text-primary">
              {/* Said out loud while filtered: every column except the selected
                  one is summed over parties that are not on screen. */}
              {filtered ? 'Total (all parties)' : 'Total'}
            </td>
            {buckets.map(({ key }) => (
              <td
                key={key}
                className={cn(
                  'px-md py-sm text-right tabular text-label-lg whitespace-nowrap text-text-primary',
                  key === selectedBucket && 'bg-surface-hover',
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
