import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import { TAX_OPTIONS } from '@/models/invoice';
import { formatMoney } from '@/utils/money';

export interface LineItemRowProps {
  index: number;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  /** Caller-computed qty × rate. Tax is deliberately not included. */
  lineAmount: number;
  onDescriptionChange: (v: string) => void;
  onQuantityChange: (v: string) => void;
  onUnitPriceChange: (v: string) => void;
  onTaxRateChange: (v: string) => void;
  onDelete: () => void;
  canDelete: boolean;
  /** Rendered inside the card under the header — the inventory item picker. */
  topSlot?: ReactNode;
  readOnly?: boolean;
  /**
   * A purchase order orders a quantity at a unit cost, not a qty at a rate.
   * Same arithmetic, different vocabulary — and on a PO the wrong word reads
   * as a selling price.
   */
  quantityLabel?: string;
  priceLabel?: string;
  /** "Item 1" by default; a PO calls them lines. */
  itemLabel?: string;
}

/**
 * One editable line of a transaction document.
 *
 * Ported from the app's src/components/shared/LineItemRow.tsx, which is shared
 * by the Invoice, Credit Memo, Estimate, Sales Order and Purchase Order forms —
 * so it is worth keeping generic here too.
 *
 * Fields are 40px tall, not the 48px of a standard form control. That is the
 * app's `FIELD_HEIGHT`: a line row packs four controls across, and at full
 * height the row dominates the form.
 *
 * Numeric inputs are sanitised to digits and a dot rather than using
 * `type="number"`, which brings spinners, silent locale parsing and a scroll
 * wheel that quietly edits amounts.
 */
export function LineItemRow({
  index,
  description,
  quantity,
  unitPrice,
  taxRate,
  lineAmount,
  onDescriptionChange,
  onQuantityChange,
  onUnitPriceChange,
  onTaxRateChange,
  onDelete,
  canDelete,
  topSlot,
  readOnly,
  quantityLabel = 'Qty',
  priceLabel = 'Rate',
  itemLabel = 'Item',
}: LineItemRowProps) {
  const numeric = (v: string) => v.replace(/[^0-9.]/g, '');

  const fieldClass =
    'h-10 w-full rounded-md border border-border bg-surface px-sm text-body-md text-text-primary ' +
    'outline-none transition-colors focus:border-[1.5px] focus:border-primary ' +
    'placeholder:text-text-tertiary disabled:bg-background disabled:opacity-70';

  return (
    <div className="rounded-md border border-border-light bg-surface-2 p-md">
      <div className="mb-sm flex items-center justify-between">
        <span className="text-label-md text-text-secondary">
          {itemLabel} {index + 1}
        </span>
        {canDelete && !readOnly && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Remove ${itemLabel.toLowerCase()} ${index + 1}`}
            className="flex size-7 items-center justify-center rounded-full bg-danger-lighter text-danger transition-colors hover:bg-danger-light"
          >
            <X className="size-[14px]" />
          </button>
        )}
      </div>

      {topSlot && <div className="mb-sm">{topSlot}</div>}

      <input
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="Item description"
        disabled={readOnly}
        className={cn(fieldClass, 'mb-sm')}
      />

      <div className="grid grid-cols-2 gap-sm sm:grid-cols-3">
        <label className="flex flex-col gap-xxs">
          <span className="text-caption text-text-secondary">{quantityLabel}</span>
          <input
            value={quantity}
            onChange={(e) => onQuantityChange(numeric(e.target.value))}
            inputMode="decimal"
            disabled={readOnly}
            className={cn(fieldClass, 'text-right tabular')}
          />
        </label>

        <label className="flex flex-col gap-xxs">
          <span className="text-caption text-text-secondary">{priceLabel}</span>
          <input
            value={unitPrice}
            onChange={(e) => onUnitPriceChange(numeric(e.target.value))}
            inputMode="decimal"
            placeholder="0.00"
            disabled={readOnly}
            className={cn(fieldClass, 'text-right tabular')}
          />
        </label>

        <Select
          label="Tax"
          value={taxRate}
          onChange={onTaxRateChange}
          options={TAX_OPTIONS as unknown as { label: string; value: string }[]}
          disabled={readOnly}
          compact
          containerClassName="col-span-2 sm:col-span-1"
        />
      </div>

      <div className="mt-sm flex items-center justify-between border-t border-border-light pt-sm">
        <span className="text-body-sm text-text-secondary">Line total</span>
        {/* shrink-0 so a long figure is never clipped — the label gives way
            instead. A truncated amount in a ledger is worse than a cramped
            label. */}
        <span className="shrink-0 text-h4 text-primary tabular">
          {formatMoney(lineAmount)}
        </span>
      </div>
    </div>
  );
}

export default LineItemRow;
