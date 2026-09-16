import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { invalidateAfterPosting } from '@/features/documents/invalidateAfterPosting';
import { AllocationTable } from '@/features/payments/AllocationTable';
import {
  autoDistribute,
  overAppliedRows,
  payInFull,
  totalAllocated,
  type AllocationRow,
} from '@/models/payment';
import {
  applyPaymentAdvance,
  getCustomerAdvances,
  getOutstandingInvoices,
} from '@/networks/sales/paymentNetwork';
import { formatMoney } from '@/utils/money';

/**
 * Apply money a customer has already paid — an advance — to their invoices.
 *
 * No cash moves: the server posts Dr Customer Advances / Cr Accounts
 * Receivable. This is the action whose absence produced QA's duplicate
 * receipt, where a second cash payment was recorded to settle an invoice an
 * earlier receipt's remainder could have covered.
 *
 * Two ways in:
 *   • from a receipt  — `payment` given; spread what it holds across invoices.
 *   • from an invoice — `invoice` given; choose which receipt pays it.
 */
export function ApplyAdvanceDialog({
  open,
  onOpenChange,
  customerId,
  payment,
  invoice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  payment?: { id: string; label: string; unapplied: number };
  invoice?: { id: string; label: string; balance: number };
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [receiptId, setReceiptId] = useState('');
  const [amount, setAmount] = useState('');

  const outstanding = useQuery({
    queryKey: ['payments', 'outstanding', customerId],
    queryFn: () => getOutstandingInvoices(customerId),
    enabled: open && !!payment,
  });
  const advances = useQuery({
    queryKey: ['payments', 'advances', customerId],
    queryFn: () => getCustomerAdvances(customerId),
    enabled: open && !!invoice,
  });

  // Fresh rows each time the dialog opens, spread oldest-first.
  useEffect(() => {
    if (!open || !payment || !outstanding.data) return;
    const checked = outstanding.data.map((r) => ({ ...r, checked: true }));
    setRows(autoDistribute(checked, String(payment.unapplied)));
  }, [open, payment, outstanding.data]);

  useEffect(() => {
    if (!open || !invoice || !advances.data) return;
    const first = advances.data.advances[0];
    setReceiptId(first?.paymentId ?? '');
    setAmount(first ? String(Math.min(first.unapplied, invoice.balance)) : '');
  }, [open, invoice, advances.data]);

  const selectedAdvance = useMemo(
    () => advances.data?.advances.find((a) => a.paymentId === receiptId),
    [advances.data, receiptId],
  );

  const apply = useMutation({
    mutationFn: () => {
      if (payment) {
        const applications = rows
          .filter((r) => r.checked && (parseFloat(r.applied) || 0) > 0)
          .map((r) => ({ invoiceId: r.documentId, amount: (parseFloat(r.applied) || 0).toFixed(2) }));
        return applyPaymentAdvance(payment.id, applications);
      }
      return applyPaymentAdvance(receiptId, [
        { invoiceId: invoice!.id, amount: (parseFloat(amount) || 0).toFixed(2) },
      ]);
    },
    onSuccess: (result) => {
      invalidateAfterPosting(queryClient);
      onOpenChange(false);
      if (result.pending) {
        toast.success('Sent for approval', {
          description: 'The invoices stay open until the owner approves.',
        });
        return;
      }
      toast.success('Advance applied', {
        description: 'The invoices are settled from money already received — no new cash was recorded.',
      });
    },
    onError: (e: Error) => toast.error('Could not apply the advance', { description: e.message }),
  });

  const allocated = totalAllocated(rows);
  const amountNumber = parseFloat(amount) || 0;
  const invalid = payment
    ? allocated <= 0 || allocated > payment.unapplied + 0.001 || overAppliedRows(rows).length > 0
    : !selectedAdvance ||
      amountNumber <= 0 ||
      amountNumber > selectedAdvance.unapplied + 0.001 ||
      amountNumber > (invoice?.balance ?? 0) + 0.001;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={payment ? `Apply ${payment.label} to invoices` : `Apply an advance to ${invoice?.label ?? 'this invoice'}`}
      description={
        payment
          ? `${formatMoney(payment.unapplied)} of this receipt is not applied yet. Applying it settles invoices without recording new cash.`
          : 'Settle this invoice from money the customer has already paid. No new cash is recorded.'
      }
      confirmLabel={apply.isPending ? 'Applying…' : 'Apply advance'}
      busy={apply.isPending}
      confirmDisabled={invalid}
      onConfirm={() => apply.mutate()}
    >
      {payment ? (
        outstanding.isLoading ? (
          <p className="text-body-sm text-text-secondary">Loading open invoices…</p>
        ) : (
          <AllocationTable
            rows={rows}
            amount={String(payment.unapplied)}
            onChange={setRows}
            documentLabel="Invoice"
            fillAllLabel="Apply to all"
            onFillAll={() => setRows(autoDistribute(payInFull(rows).rows, String(payment.unapplied)))}
            emptyText="This customer has no open invoices to apply the advance to."
            disabled={apply.isPending}
          />
        )
      ) : advances.isLoading ? (
        <p className="text-body-sm text-text-secondary">Loading advances…</p>
      ) : (advances.data?.advances.length ?? 0) === 0 ? (
        <p className="text-body-sm text-text-secondary">This customer holds no advances.</p>
      ) : (
        <div className="flex flex-col gap-md">
          <Select
            label="Receipt"
            value={receiptId}
            onChange={(v) => {
              setReceiptId(v);
              const a = advances.data?.advances.find((x) => x.paymentId === v);
              if (a && invoice) setAmount(String(Math.min(a.unapplied, invoice.balance)));
            }}
            options={(advances.data?.advances ?? []).map((a) => ({
              value: a.paymentId,
              label: `${a.paymentNumber || a.paymentId.slice(0, 8)} · ${formatMoney(a.unapplied)} available`,
            }))}
          />
          <Input
            label="Amount to apply"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            hint={invoice ? `The invoice owes ${formatMoney(invoice.balance)}.` : undefined}
          />
        </div>
      )}
    </ConfirmDialog>
  );
}
