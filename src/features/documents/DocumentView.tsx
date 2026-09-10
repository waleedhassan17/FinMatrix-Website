import type { ReactNode } from 'react';

import { Card, SectionHeader } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import type { DiscountType } from '@/models/document';
import type { DocumentLine } from '@/serializers/documentLines';
import { formatMoney } from '@/utils/money';

/**
 * The read-only rendering of a transaction document: who it is for, its
 * reference metadata, its priced lines, and its totals.
 *
 * Shared by invoices, estimates and sales orders. A quote and the invoice it
 * became should be recognisably the same document, and the only way to
 * guarantee that is for one component to draw both.
 */

export interface DocumentViewProps {
  title: string;
  counterpartyLabel: string;
  counterpartyName: string;
  /** Reference fields shown top-right: `[label, value]`. */
  meta: [string, string][];

  lines: DocumentLine[];
  subtotal: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  taxAmount: number;
  total: number;

  /** Invoices add Amount paid / Balance due below the total. */
  extraTotals?: Array<{
    label: string;
    value: number;
    tone?: 'success' | 'danger';
    strong?: boolean;
    dividerBefore?: boolean;
  }>;

  notes?: string;
  /** An extra column per line — the sales order's fulfilment progress. */
  lineExtra?: (line: DocumentLine, index: number) => ReactNode;
  lineExtraHeader?: string;

  /** A purchase order orders quantities at a cost, not at a rate. */
  quantityHeader?: string;
  priceHeader?: string;
  /**
   * Bills have no quantity at all — a bill line is an account and an amount,
   * and the DTO's optional quantity/unitPrice pair is never persisted. Showing
   * a fabricated "Qty 1 · Rate = amount" would read as data the bill does not
   * carry, so the two columns are dropped rather than filled in.
   */
  showQuantity?: boolean;
}

export function DocumentView({
  title,
  counterpartyLabel,
  counterpartyName,
  meta,
  lines,
  subtotal,
  discountType,
  discountValue,
  discountAmount,
  taxAmount,
  total,
  extraTotals = [],
  notes,
  lineExtra,
  lineExtraHeader,
  quantityHeader = 'Qty',
  priceHeader = 'Rate',
  showQuantity = true,
}: DocumentViewProps) {
  return (
    <Card className="p-xl">
      <h2 className="text-h3 uppercase text-text-primary">{title}</h2>

      <div className="mt-lg flex flex-wrap justify-between gap-lg">
        <div>
          <p className="text-overline text-text-secondary">{counterpartyLabel}</p>
          <p className="mt-xxs text-h4 text-text-primary">{counterpartyName || '—'}</p>
        </div>
        <div className="text-right">
          {meta.map(([label, value]) => (
            <div key={label} className="flex justify-end gap-md">
              <span className="text-caption text-text-secondary">{label}</span>
              <span className="text-caption text-text-primary tabular">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-xl overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="py-sm text-left text-overline text-text-secondary">
                Description
              </th>
              {lineExtra && (
                <th className="py-sm text-left text-overline text-text-secondary">
                  {lineExtraHeader ?? ''}
                </th>
              )}
              {showQuantity && (
                <>
                  <th className="py-sm text-right text-overline text-text-secondary">
                    {quantityHeader}
                  </th>
                  <th className="py-sm text-right text-overline text-text-secondary">
                    {priceHeader}
                  </th>
                </>
              )}
              <th className="py-sm text-right text-overline text-text-secondary">Tax</th>
              <th className="py-sm text-right text-overline text-text-secondary">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr
                key={line.id || i}
                className={cn('border-b border-border-light', i % 2 && 'bg-surface-2')}
              >
                <td className="py-sm text-body-sm text-text-primary">
                  {line.description || line.itemName || '—'}
                </td>
                {lineExtra && <td className="py-sm">{lineExtra(line, i)}</td>}
                {showQuantity && (
                  <>
                    <td className="py-sm text-right text-body-sm text-text-primary tabular">
                      {line.quantity}
                    </td>
                    <td className="py-sm text-right text-body-sm text-text-primary tabular">
                      {formatMoney(line.unitPrice)}
                    </td>
                  </>
                )}
                <td className="py-sm text-right text-body-sm text-text-secondary tabular">
                  {line.taxRate}%
                </td>
                <td className="py-sm text-right text-body-sm text-text-primary tabular">
                  {formatMoney(line.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-lg flex justify-end">
        <div className="w-full max-w-xs">
          <TotalRow label="Subtotal" value={formatMoney(subtotal)} />
          {discountAmount > 0 && (
            <TotalRow
              label={
                discountType === 'percent'
                  ? `Discount (${discountValue}%)`
                  : 'Discount (fixed)'
              }
              value={`− ${formatMoney(discountAmount)}`}
              tone="success"
            />
          )}
          <TotalRow label="Tax" value={formatMoney(taxAmount)} />
          <div className="my-xs border-t border-border" />
          <TotalRow label="Grand total" value={formatMoney(total)} strong />

          {extraTotals.map((row) => (
            <div key={row.label}>
              {row.dividerBefore && <div className="my-xs border-t border-border" />}
              <TotalRow
                label={row.label}
                value={formatMoney(row.value)}
                tone={row.tone}
                strong={row.strong}
              />
            </div>
          ))}
        </div>
      </div>

      {notes && (
        <div className="mt-xl border-t border-border-light pt-md">
          <SectionHeader title="Notes" />
          <p className="mt-sm whitespace-pre-line text-body-sm text-text-secondary">
            {notes}
          </p>
        </div>
      )}
    </Card>
  );
}

function TotalRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'success' | 'danger';
}) {
  return (
    <div className="flex items-center justify-between py-xxs">
      <span
        className={cn(
          strong ? 'text-h4 text-text-primary' : 'text-body-sm text-text-secondary',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'tabular',
          strong ? 'text-h4' : 'text-body-sm',
          tone === 'success'
            ? 'text-success'
            : tone === 'danger'
              ? 'text-danger'
              : 'text-text-primary',
        )}
      >
        {value}
      </span>
    </div>
  );
}

export default DocumentView;
