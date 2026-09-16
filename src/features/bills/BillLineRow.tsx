import { X } from 'lucide-react';

import { Combobox } from '@/components/ui/Combobox';
import { TaxPercentInput } from '@/components/ui/TaxPercentInput';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/utils/money';

export interface BillLineRowProps {
  index: number;
  accountId: string;
  description: string;
  amount: string;
  taxRate: string;
  accountOptions: { value: string; label: string }[];
  onAccountChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onAmountChange: (v: string) => void;
  onTaxRateChange: (v: string) => void;
  onDelete: () => void;
  canDelete: boolean;
  readOnly?: boolean;
  error?: string;
}

/**
 * One editable line of a bill.
 *
 * Deliberately **not** `LineItemRow`. A bill line is an expense coded to a GL
 * account — it has an `accountId` and an `amount`, and no quantity, unit price
 * or inventory link at all. The DTO does accept `quantity` + `unitPrice` as an
 * alternative to `amount`, but neither is persisted, so a bill entered that way
 * reads back as a bare amount and the two clients disagree about what was
 * typed. Offering those fields would be offering data the bill cannot keep.
 *
 * The account is required rather than optional: without one the server falls
 * back to the company's COGS account and, if that lookup fails, refuses the
 * whole bill with ACCOUNT_REQUIRED — an error with no visible cause.
 *
 * Field height and the digits-and-a-dot sanitising match LineItemRow so the two
 * editors sit at the same rhythm.
 */
export function BillLineRow({
  index,
  accountId,
  description,
  amount,
  taxRate,
  accountOptions,
  onAccountChange,
  onDescriptionChange,
  onAmountChange,
  onTaxRateChange,
  onDelete,
  canDelete,
  readOnly,
  error,
}: BillLineRowProps) {
  const numeric = (v: string) => v.replace(/[^0-9.]/g, '');

  const fieldClass =
    'h-10 w-full rounded-md border border-border bg-surface px-sm text-body-md text-text-primary ' +
    'outline-none transition-colors focus:border-[1.5px] focus:border-primary ' +
    'placeholder:text-text-tertiary disabled:bg-background disabled:opacity-70';

  // Tax is charged on the line's own amount, so the row can show its own gross.
  const gross =
    (parseFloat(amount) || 0) * (1 + (parseFloat(taxRate) || 0) / 100);

  return (
    <div className="rounded-md border border-border-light bg-surface-2 p-md">
      <div className="mb-sm flex items-center justify-between">
        <span className="text-label-md text-text-secondary">Line {index + 1}</span>
        {canDelete && !readOnly && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Remove line ${index + 1}`}
            className="flex size-7 items-center justify-center rounded-full bg-danger-lighter text-danger transition-colors hover:bg-danger-light"
          >
            <X className="size-[14px]" />
          </button>
        )}
      </div>

      <Combobox
        value={accountId}
        onChange={onAccountChange}
        options={accountOptions}
        placeholder="Choose an expense account…"
        searchPlaceholder="Search by number or name…"
        disabled={readOnly}
        error={error}
        containerClassName="mb-sm"
      />

      <input
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="What was this for?"
        disabled={readOnly}
        className={cn(fieldClass, 'mb-sm')}
      />

      <div className="grid grid-cols-2 gap-sm">
        <label className="flex flex-col gap-xxs">
          <span className="text-caption text-text-secondary">Amount (excl. tax)</span>
          <input
            value={amount}
            onChange={(e) => onAmountChange(numeric(e.target.value))}
            inputMode="decimal"
            placeholder="0.00"
            disabled={readOnly}
            className={cn(fieldClass, 'text-right tabular')}
          />
        </label>

        {/* Purchase tax is whatever the vendor charged — typed, not picked. */}
        <TaxPercentInput value={taxRate} onChange={onTaxRateChange} disabled={readOnly} compact />
      </div>

      {/* Only worth a row of its own when tax actually changes the figure. */}
      {parseFloat(taxRate) > 0 && (
        <div className="mt-sm flex items-center justify-between border-t border-border-light pt-sm">
          <span className="text-body-sm text-text-secondary">Line total with tax</span>
          <span className="shrink-0 text-h4 text-primary tabular">
            {formatMoney(gross)}
          </span>
        </div>
      )}
    </div>
  );
}

export default BillLineRow;
