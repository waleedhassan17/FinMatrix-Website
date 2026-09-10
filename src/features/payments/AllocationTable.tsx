import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import {
  autoDistribute,
  overAppliedRows,
  totalOutstanding,
  type AllocationRow,
} from '@/models/allocation';
import { formatMoney } from '@/utils/money';

/**
 * Split a payment across open documents — invoices on the AR side, bills on
 * the AP side.
 *
 * The two sides differ in one structural way, which `amount` selects between:
 *
 *   • **Receive Payments** has a typed amount to spread. Ticking a row re-runs
 *     `autoDistribute`, which walks oldest-due-first taking
 *     `min(rowBalance, remaining)`, so the default split cannot over-allocate.
 *
 *   • **Pay Bills** has no typed amount at all — `PayBillsDto` carries no
 *     top-level `amount`, and the payment total *is* the sum of the rows. So
 *     ticking a row simply fills it to its balance.
 *
 * Either way every figure stays editable afterwards, and both servers refuse
 * the whole request if one row exceeds what that document owes — which is why
 * that case is caught here rather than on the way back.
 */
export function AllocationTable({
  rows,
  onChange,
  documentLabel,
  amount,
  onFillAll,
  fillAllLabel,
  emptyText,
  disabled,
}: {
  rows: AllocationRow[];
  onChange: (rows: AllocationRow[]) => void;
  /** Column header and screen-reader wording — "Invoice" or "Bill". */
  documentLabel: string;
  /** Present only on the AR side, where a typed total is spread across rows. */
  amount?: string;
  onFillAll: () => void;
  fillAllLabel: string;
  emptyText: ReactNode;
  disabled?: boolean;
}) {
  const overApplied = new Set(overAppliedRows(rows).map((r) => r.documentId));
  const outstanding = totalOutstanding(rows);
  const distributes = amount !== undefined;

  const toggle = (documentId: string) => {
    const next = rows.map((r) =>
      r.documentId === documentId
        ? {
            ...r,
            checked: !r.checked,
            // With no amount to spread, a ticked row simply owes what it owes.
            ...(distributes
              ? {}
              : { applied: !r.checked ? String(r.balance) : '0' }),
          }
        : r,
    );
    onChange(distributes ? autoDistribute(next, amount) : next);
  };

  const setApplied = (documentId: string, value: string) =>
    onChange(
      rows.map((r) =>
        r.documentId === documentId
          ? { ...r, applied: value.replace(/[^0-9.]/g, ''), checked: true }
          : r,
      ),
    );

  if (rows.length === 0) {
    return (
      <p className="rounded-md bg-surface-2 p-md text-body-sm text-text-secondary">
        {emptyText}
      </p>
    );
  }

  return (
    <div>
      <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
        <p className="text-body-sm text-text-secondary">
          {rows.filter((r) => r.checked).length} of {rows.length} selected ·{' '}
          {formatMoney(outstanding)} outstanding
        </p>
        <Button size="sm" variant="secondary" onClick={onFillAll} disabled={disabled}>
          {fillAllLabel}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-border-light">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="w-10 px-sm py-sm" />
              <th className="px-sm py-sm text-left text-overline text-text-secondary">
                {documentLabel}
              </th>
              <th className="px-sm py-sm text-left text-overline text-text-secondary">
                Due
              </th>
              <th className="px-sm py-sm text-right text-overline text-text-secondary">
                Balance
              </th>
              <th className="px-sm py-sm text-right text-overline text-text-secondary">
                Applied
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const over = overApplied.has(row.documentId);
              return (
                <tr
                  key={row.documentId}
                  className={cn(
                    'border-b border-border-light last:border-0',
                    row.checked && 'bg-primary-tint',
                  )}
                >
                  <td className="px-sm py-sm">
                    <input
                      type="checkbox"
                      checked={row.checked}
                      onChange={() => toggle(row.documentId)}
                      disabled={disabled}
                      aria-label={`Allocate to ${row.documentNumber}`}
                      className="size-4 accent-[color:var(--color-primary)]"
                    />
                  </td>
                  <td className="px-sm py-sm text-body-sm text-text-primary">
                    {row.documentNumber || '—'}
                  </td>
                  <td className="px-sm py-sm text-body-sm text-text-secondary">
                    {row.dueDate || '—'}
                  </td>
                  <td className="px-sm py-sm text-right text-body-sm text-text-primary tabular">
                    {formatMoney(row.balance)}
                  </td>
                  <td className="px-sm py-sm text-right">
                    <input
                      value={row.checked ? row.applied : ''}
                      onChange={(e) => setApplied(row.documentId, e.target.value)}
                      disabled={disabled || !row.checked}
                      inputMode="decimal"
                      aria-label={`Amount applied to ${row.documentNumber}`}
                      aria-invalid={over || undefined}
                      placeholder="—"
                      className={cn(
                        'h-9 w-28 rounded-md border bg-surface px-sm text-right text-body-sm text-text-primary tabular',
                        'outline-none transition-colors focus:border-[1.5px] focus:border-primary',
                        'disabled:bg-background disabled:opacity-60',
                        over ? 'border-danger' : 'border-border',
                      )}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {overApplied.size > 0 && (
        <p className="mt-sm flex items-start gap-xs rounded-md bg-danger-lighter p-sm text-body-sm text-danger">
          <AlertCircle className="mt-[2px] size-4 shrink-0" />
          <span>
            {overApplied.size === 1
              ? `One ${documentLabel.toLowerCase()} is allocated more than it owes.`
              : `${overApplied.size} ${documentLabel.toLowerCase()}s are allocated more than they owe.`}{' '}
            Reduce them — the server rejects the whole payment otherwise.
          </span>
        </p>
      )}
    </div>
  );
}

export default AllocationTable;
