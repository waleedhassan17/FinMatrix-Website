import { X } from 'lucide-react';

import { Combobox } from '@/components/ui/Combobox';
import { cn } from '@/lib/cn';

export interface JournalLineRowProps {
  index: number;
  accountId: string;
  description: string;
  debit: string;
  credit: string;
  accountOptions: { value: string; label: string }[];
  onAccountChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  /** Sets the debit and clears the credit. One call, because it is one action. */
  onDebitChange: (v: string) => void;
  onCreditChange: (v: string) => void;
  onDelete: () => void;
  canDelete: boolean;
}

/**
 * One line of a journal entry: an account, an optional narrative, and an amount
 * on exactly ONE of two sides.
 *
 * The mutual exclusion is not a stylistic choice. The server throws when
 * `debitPositive === creditPositive`, and the database backs it with a CHECK
 * constraint — `(debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)`. So a
 * row with both sides filled cannot be saved even as a draft. Typing into one
 * side therefore CLEARS the other rather than letting the user build a line the
 * ledger will refuse; the opposite field is also disabled while a figure stands,
 * so the clearing is visible before it happens rather than surprising.
 */
export function JournalLineRow({
  index,
  accountId,
  description,
  debit,
  credit,
  accountOptions,
  onAccountChange,
  onDescriptionChange,
  onDebitChange,
  onCreditChange,
  onDelete,
  canDelete,
}: JournalLineRowProps) {
  // Never type="number": it swallows a stray '-' silently and spins on scroll.
  const numeric = (v: string) => v.replace(/[^0-9.]/g, '');

  const hasDebit = debit !== '' && Number(debit) > 0;
  const hasCredit = credit !== '' && Number(credit) > 0;

  const fieldClass =
    'h-10 w-full rounded-md border border-border bg-surface px-sm text-body-md text-text-primary ' +
    'outline-none transition-colors focus:border-[1.5px] focus:border-primary ' +
    'placeholder:text-text-tertiary disabled:bg-background disabled:text-text-disabled';

  return (
    <div className="rounded-md border border-border-light bg-surface-2 p-md">
      <div className="mb-sm flex items-center justify-between">
        <span className="text-label-md text-text-secondary">Line {index + 1}</span>
        {canDelete && (
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
        placeholder="Choose an account…"
        searchPlaceholder="Search by number or name…"
        emptyText="No active accounts found."
        containerClassName="mb-sm"
      />

      <input
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="What this line is for (optional)"
        className={cn(fieldClass, 'mb-sm')}
      />

      <div className="grid grid-cols-2 gap-sm">
        <label className="flex flex-col gap-xxs">
          <span className="text-caption text-text-secondary">Debit</span>
          <input
            value={debit}
            onChange={(e) => onDebitChange(numeric(e.target.value))}
            inputMode="decimal"
            placeholder="0.00"
            disabled={hasCredit}
            aria-label={`Line ${index + 1} debit`}
            className={cn(fieldClass, 'text-right tabular')}
          />
        </label>

        <label className="flex flex-col gap-xxs">
          <span className="text-caption text-text-secondary">Credit</span>
          <input
            value={credit}
            onChange={(e) => onCreditChange(numeric(e.target.value))}
            inputMode="decimal"
            placeholder="0.00"
            disabled={hasDebit}
            aria-label={`Line ${index + 1} credit`}
            className={cn(fieldClass, 'text-right tabular')}
          />
        </label>
      </div>
    </div>
  );
}

export default JournalLineRow;
