import { X } from 'lucide-react';

import { Combobox } from '@/components/ui/Combobox';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import { TAX_OPTIONS } from '@/models/document';
import { formatMoney, toDecimal } from '@/utils/money';

export interface VendorCreditLineRowProps {
  index: number;
  itemId: string;
  accountId: string;
  description: string;
  quantity: string;
  amount: string;
  taxRate: string;
  itemOptions: { value: string; label: string }[];
  accountOptions: { value: string; label: string }[];
  inventoryEnabled: boolean;
  /** What one unit is carried at — shown so the locked amount is explicable. */
  unitCost: number;
  onItemChange: (v: string) => void;
  onAccountChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onQuantityChange: (v: string) => void;
  onAmountChange: (v: string) => void;
  onTaxRateChange: (v: string) => void;
  onDelete: () => void;
  canDelete: boolean;
  readOnly?: boolean;
}

/**
 * One editable line of a vendor credit.
 *
 * Deliberately neither `LineItemRow` nor `BillLineRow`, because a credit line is
 * two different things depending on one choice:
 *
 *   naming an ITEM      the goods went back. The leg posts to Inventory (1200)
 *                       and the amount stops being the user's to set — it is
 *                       quantity × carrying cost, which is what the server
 *                       relieves stock by. A typed figure would disagree with
 *                       the ledger entry the credit actually posts.
 *   naming an ACCOUNT   money only: freight, a price correction. The leg credits
 *                       that expense account. Optional — the server falls back
 *                       to Cost of Goods Sold — so it is offered, not demanded.
 *
 * The two are mutually exclusive, and the server refuses a non-stock line
 * pointed at Inventory outright, so choosing an item hides the account picker
 * rather than leaving both live.
 *
 * Tax is a real field here: it reverses the input tax claimed on the original
 * bill out of Sales Tax Recoverable. Leaving it at 0 credits the net only.
 */
export function VendorCreditLineRow({
  index,
  itemId,
  accountId,
  description,
  quantity,
  amount,
  taxRate,
  itemOptions,
  accountOptions,
  inventoryEnabled,
  unitCost,
  onItemChange,
  onAccountChange,
  onDescriptionChange,
  onQuantityChange,
  onAmountChange,
  onTaxRateChange,
  onDelete,
  canDelete,
  readOnly,
}: VendorCreditLineRowProps) {
  const numeric = (v: string) => v.replace(/[^0-9.]/g, '');
  const hasItem = itemId !== '';

  const fieldClass =
    'h-10 w-full rounded-md border border-border bg-surface px-sm text-body-md text-text-primary ' +
    'outline-none transition-colors focus:border-[1.5px] focus:border-primary ' +
    'placeholder:text-text-tertiary disabled:bg-background disabled:opacity-70';

  const net = toDecimal(amount);
  const gross = net.plus(net.times(toDecimal(taxRate)).dividedBy(100));

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

      {inventoryEnabled && (
        <Combobox
          value={itemId}
          onChange={onItemChange}
          options={itemOptions}
          placeholder="Returned item — or leave blank for money only…"
          searchPlaceholder="Search by SKU or name…"
          disabled={readOnly}
          containerClassName="mb-sm"
        />
      )}

      {/* Only one of these two ever applies, so only one is ever shown. */}
      {!hasItem && (
        <Combobox
          value={accountId}
          onChange={onAccountChange}
          options={accountOptions}
          placeholder="Expense account (optional)…"
          searchPlaceholder="Search by number or name…"
          emptyText="No expense accounts found."
          disabled={readOnly}
          hint="Leave blank to credit Cost of Goods Sold."
          containerClassName="mb-sm"
        />
      )}

      <input
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="What is this credit for?"
        disabled={readOnly}
        className={cn(fieldClass, 'mb-sm')}
      />

      <div className={cn('grid gap-sm', hasItem ? 'grid-cols-3' : 'grid-cols-2')}>
        {hasItem && (
          <label className="flex flex-col gap-xxs">
            <span className="text-caption text-text-secondary">Quantity</span>
            <input
              value={quantity}
              onChange={(e) => onQuantityChange(numeric(e.target.value))}
              inputMode="decimal"
              placeholder="0"
              disabled={readOnly}
              className={cn(fieldClass, 'text-right tabular')}
            />
          </label>
        )}

        <label className="flex flex-col gap-xxs">
          <span className="text-caption text-text-secondary">
            {hasItem ? 'Amount (at cost)' : 'Amount'}
          </span>
          <input
            value={amount}
            onChange={(e) => onAmountChange(numeric(e.target.value))}
            inputMode="decimal"
            placeholder="0.00"
            // Read-only rather than disabled: the figure still has to be
            // readable and copyable, it just is not the user's to set.
            readOnly={hasItem}
            disabled={readOnly}
            aria-describedby={hasItem ? `vc-line-${index}-cost` : undefined}
            className={cn(
              fieldClass,
              'text-right tabular',
              hasItem && 'bg-background text-text-secondary',
            )}
          />
        </label>

        <Select
          label="Tax"
          value={taxRate}
          onChange={onTaxRateChange}
          options={TAX_OPTIONS as unknown as { label: string; value: string }[]}
          disabled={readOnly}
          compact
        />
      </div>

      {hasItem && (
        <p id={`vc-line-${index}-cost`} className="mt-sm text-caption text-text-secondary">
          Priced at {formatMoney(unitCost)} each — what the goods are carried at,
          which is what returning them takes back out of stock.
        </p>
      )}

      {/* Only worth a row of its own when tax actually changes the figure. */}
      {toDecimal(taxRate).greaterThan(0) && (
        <div className="mt-sm flex items-center justify-between border-t border-border-light pt-sm">
          <span className="text-body-sm text-text-secondary">
            Line credit with tax
          </span>
          <span className="shrink-0 text-h4 tabular text-primary">
            {formatMoney(gross.toDecimalPlaces(2).toNumber())}
          </span>
        </div>
      )}
    </div>
  );
}

export default VendorCreditLineRow;
