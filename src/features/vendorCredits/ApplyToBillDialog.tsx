import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import type { AllocationRow } from '@/models/payment';
import { maxApplicable } from '@/models/vendorCredit';
import { getPayableBills } from '@/networks/purchases/billNetwork';
import { formatMoney } from '@/utils/money';

/**
 * Put a vendor credit against one of the supplier's open bills.
 *
 * The AP mirror of ApplyCreditDialog. The mobile app picks the bill and then
 * fixes the amount at `min(creditBalance, billBalance)` with no way to change
 * it. The API takes an `amount`, so partial application is supported — here the
 * maximum is pre-filled but editable, which is what lets one credit be split
 * deliberately across two bills.
 *
 * One bill per call: there is no allocations array on the AP side, so settling
 * several bills means reopening this dialog for each.
 *
 * Open bills come from the Pay Bills module's `getPayableBills`, which already
 * excludes drafts and voids and sorts by due date — the same question ("what do
 * we still owe this supplier?") with the same answer.
 */
export function ApplyToBillDialog({
  open,
  onOpenChange,
  vendorId,
  creditBalance,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  creditBalance: number;
  busy?: boolean;
  onSubmit: (documentId: string, amount: string) => void;
}) {
  const [selected, setSelected] = useState<AllocationRow | null>(null);
  const [amount, setAmount] = useState('');

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['bills', 'payable', vendorId],
    queryFn: () => getPayableBills(vendorId),
    enabled: open && Boolean(vendorId),
  });

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setAmount('');
    }
  }, [open]);

  const pick = (row: AllocationRow) => {
    setSelected(row);
    setAmount(String(maxApplicable(creditBalance, row.balance)));
  };

  const entered = parseFloat(amount) || 0;
  const ceiling = selected ? maxApplicable(creditBalance, selected.balance) : 0;
  const tooMuch = entered > ceiling;
  const invalid = !selected || entered <= 0 || tooMuch;

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-[color:var(--color-overlay)]" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface p-xl shadow-lg">
          <AlertDialog.Title className="text-h4 text-text-primary">
            Apply credit to a bill
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-xs text-body-md text-text-secondary">
            {formatMoney(creditBalance)} available. Pick a bill, then confirm how
            much of the credit to put against it.
          </AlertDialog.Description>

          <div className="mt-lg max-h-64 overflow-y-auto rounded-md border border-border-light">
            {isLoading ? (
              <p className="p-md text-body-sm text-text-secondary">
                Loading open bills…
              </p>
            ) : bills.length === 0 ? (
              <p className="p-md text-body-sm text-text-secondary">
                This supplier has no open bills to credit.
              </p>
            ) : (
              bills.map((bill) => (
                <button
                  key={bill.documentId}
                  type="button"
                  onClick={() => pick(bill)}
                  className={cn(
                    'flex w-full items-center gap-md border-b border-border-light px-md py-sm text-left last:border-0',
                    selected?.documentId === bill.documentId
                      ? 'bg-primary-tint'
                      : 'hover:bg-surface-hover',
                  )}
                >
                  <span className="flex-1 text-body-sm text-text-primary">
                    {bill.documentNumber || bill.documentId.slice(0, 8)}
                    <span className="ml-xs text-caption text-text-secondary">
                      due {bill.dueDate || '—'}
                    </span>
                  </span>
                  <span className="text-body-sm tabular text-text-primary">
                    {formatMoney(bill.balance)}
                  </span>
                </button>
              ))
            )}
          </div>

          {selected && (
            <div className="mt-lg">
              <Input
                label="Amount to apply"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                error={tooMuch ? `At most ${formatMoney(ceiling)}` : undefined}
                hint={
                  tooMuch
                    ? undefined
                    : `Up to ${formatMoney(ceiling)} — whichever runs out first, the credit or the bill.`
                }
              />
            </div>
          )}

          {tooMuch && (
            <p className="mt-sm flex items-start gap-xs text-body-sm text-danger">
              <AlertCircle className="mt-[2px] size-4 shrink-0" />
              <span>
                The server refuses this with EXCEEDS_CREDIT or
                PAYMENT_EXCEEDS_BALANCE.
              </span>
            </p>
          )}

          <div className="mt-xl flex justify-end gap-sm">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={busy}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button
              disabled={busy || invalid}
              onClick={() =>
                selected && onSubmit(selected.documentId, entered.toFixed(2))
              }
            >
              {busy ? 'Applying…' : 'Apply credit'}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export default ApplyToBillDialog;
