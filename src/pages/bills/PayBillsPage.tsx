import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Banknote, Info } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { DateField } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SummaryPanel, SummaryRow } from '@/components/ui/SummaryPanel';
import { PaymentProofField } from '@/features/bills/PaymentProofField';
import { useVendorOptions } from '@/features/documents/useDocumentPickers';
import { AllocationTable } from '@/features/payments/AllocationTable';
import { useCapability } from '@/hooks/useCapability';
import {
  fillToBalance,
  overAppliedRows,
  totalAllocated,
} from '@/models/allocation';
import type { PayBillsFormData } from '@/models/bill';
import { isoToday } from '@/models/document';
import { PAYMENT_METHOD_OPTIONS, type ApiPaymentMethod } from '@/models/payment';
import { getDepositAccounts } from '@/networks/accounting/accountNetwork';
import { getPayableBills, payBills } from '@/networks/purchases/billNetwork';
import { payBillsFormToPayload } from '@/serializers/billSerializer';
import { formatMoney } from '@/utils/money';
import { invalidateAfterPosting } from '@/features/documents/invalidateAfterPosting';

const emptyForm = (): PayBillsFormData => ({
  vendorId: '',
  vendorName: '',
  paymentDate: isoToday(),
  paymentMethod: 'bank_transfer',
  bankAccountId: '',
  proofId: '',
  reference: '',
  rows: [],
});

export default function PayBillsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const cap = useCapability('bill.pay');
  const { byId: vendorsById, options: vendorOptions } = useVendorOptions();

  const [form, setForm] = useState<PayBillsFormData>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const patch = (p: Partial<PayBillsFormData>) =>
    setForm((f) => ({ ...f, ...p }));

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', 'deposit'],
    queryFn: getDepositAccounts,
  });

  const { data: payable, isFetching: loadingRows } = useQuery({
    queryKey: ['bills', 'payable', form.vendorId],
    queryFn: () => getPayableBills(form.vendorId),
    enabled: Boolean(form.vendorId),
  });

  // Seed the rows when the vendor's open bills arrive, honouring a billId
  // handed over from a bill's detail page.
  useEffect(() => {
    if (!payable) return;
    const preselect = searchParams.get('billId');
    setForm((f) => ({
      ...f,
      rows: payable.map((r) =>
        r.documentId === preselect
          ? { ...r, checked: true, applied: String(r.balance) }
          : r,
      ),
    }));
  }, [payable, searchParams]);

  useEffect(() => {
    const preset = searchParams.get('vendorId');
    if (!preset) return;
    const v = vendorsById.get(preset);
    if (v) setForm((f) => ({ ...f, vendorId: v.id, vendorName: v.name }));
  }, [searchParams, vendorsById]);

  // There is no typed total on this side: PayBillsDto has no `amount` field at
  // all, so what is paid is exactly the sum of the allocations.
  const total = useMemo(() => totalAllocated(form.rows), [form.rows]);
  const hasOverApplied = overAppliedRows(form.rows).length > 0;
  const selectedCount = form.rows.filter(
    (r) => r.checked && parseFloat(r.applied) > 0,
  ).length;

  /**
   * Pay-from accounts, with their balances.
   *
   * **No "Automatic" option.** `bankAccountId` is required by the DTO and there
   * is no server-side fallback — the AR side falls back to 1000/1010, this one
   * does not. Offering Automatic here would produce a 400 on submit.
   */
  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: `${a.accountNumber} · ${a.name}`,
      })),
    [accounts],
  );

  const payFrom = accounts.find((a) => a.id === form.bankAccountId);
  const balanceAfter = payFrom ? payFrom.balance - total : null;
  const overdrawn = balanceAfter !== null && balanceAfter < 0;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.vendorId) errs.vendorId = 'Select a vendor';
    if (!form.paymentDate) errs.paymentDate = 'Payment date is required';
    if (!form.bankAccountId) errs.bankAccountId = 'Choose the account to pay from';
    if (!form.proofId) errs.proofId = 'A payment proof is required';
    if (hasOverApplied) {
      errs.rows = 'A bill is allocated more than it owes';
    } else if (selectedCount === 0) {
      // applications must hold at least one entry — an empty array is a 400,
      // not an auto-apply as it would be on the customer side.
      errs.rows = 'Choose at least one bill to pay';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = useMutation({
    mutationFn: () => payBills(payBillsFormToPayload(form)),
    onSuccess: (result) => {
      if (result.pending) {
        // Nothing left the bank — do NOT invalidate bills or the dashboard.
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        toast.success('Sent for approval', {
          description: 'The bills stay unpaid until the owner approves.',
        });
        navigate('/my-requests', { replace: true });
        return;
      }

      invalidateAfterPosting(queryClient);

      // A receipt rather than a toast: this is money out of the bank, and the
      // person who pressed the button should see what it did. `replace` so
      // Back cannot return to a form that would re-post.
      navigate('/bills/pay/receipt', {
        replace: true,
        state: {
          vendorName: form.vendorName,
          paymentDate: form.paymentDate,
          total,
          accountName: payFrom ? `${payFrom.accountNumber} · ${payFrom.name}` : '',
          balanceAfter,
          reference: form.reference.trim(),
          lines: form.rows
            .filter((r) => r.checked && parseFloat(r.applied) > 0)
            .map((r) => ({
              billId: r.documentId,
              billNumber: r.documentNumber,
              applied: parseFloat(r.applied) || 0,
              remaining: Math.max(r.balance - (parseFloat(r.applied) || 0), 0),
            })),
        },
      });
    },
    onError: (e: Error) =>
      toast.error('Could not record payment', { description: e.message }),
  });

  const busy = save.isPending;
  // Stated rather than merely disabled, so nobody hunts for what is missing.
  const blockedReason = !form.proofId
    ? 'Attach a payment proof to continue.'
    : !form.bankAccountId
      ? 'Choose the account you are paying from.'
      : selectedCount === 0
        ? 'Choose at least one bill to pay.'
        : '';

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/bills">
          <ArrowLeft className="size-4" />
          Bills
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">Pay bills</h1>
        <p className="text-body-sm text-text-secondary">
          Settle what you owe a supplier.
        </p>
      </div>

      {cap.needsApproval && (
        <div className="flex items-start gap-sm rounded-md border border-warning-light bg-warning-lighter p-md">
          <Info className="mt-[2px] size-4 shrink-0 text-warning" />
          <p className="text-body-sm text-text-primary">
            This payment will be sent to the owner for approval. No money moves
            and the bills stay unpaid until they approve it.
          </p>
        </div>
      )}

      {/* ── Vendor & payment ────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Payment details" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Combobox
            label="Vendor *"
            value={form.vendorId}
            onChange={(vendorId) =>
              patch({
                vendorId,
                vendorName: vendorsById.get(vendorId)?.name ?? '',
                rows: [],
              })
            }
            options={vendorOptions}
            placeholder="Select a vendor…"
            searchPlaceholder="Search vendors…"
            error={errors.vendorId}
            containerClassName="sm:col-span-2"
          />

          <DateField
            label="Payment date *"
            value={form.paymentDate}
            onChange={(v) => patch({ paymentDate: v })}
            error={errors.paymentDate}
          />
          <Select
            label="Method *"
            value={form.paymentMethod}
            onChange={(v) => patch({ paymentMethod: v as ApiPaymentMethod })}
            options={PAYMENT_METHOD_OPTIONS}
          />

          <Combobox
            label="Pay from *"
            value={form.bankAccountId}
            onChange={(bankAccountId) => patch({ bankAccountId })}
            options={accountOptions}
            placeholder="Choose an account…"
            searchPlaceholder="Search accounts…"
            error={errors.bankAccountId}
            hint={
              payFrom
                ? `Balance ${formatMoney(payFrom.balance)}`
                : 'Required — there is no default account for money going out.'
            }
            containerClassName="sm:col-span-2"
          />

          <Input
            label="Reference"
            value={form.reference}
            onChange={(e) => patch({ reference: e.target.value })}
            placeholder="Cheque or transfer number"
            containerClassName="sm:col-span-2"
          />
        </div>
      </Card>

      {/* ── Which bills ─────────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Bills to pay" />
        <div className="mt-md">
          {!form.vendorId ? (
            <p className="text-body-sm text-text-tertiary">
              Choose a vendor to see their open bills.
            </p>
          ) : loadingRows ? (
            <p className="text-body-sm text-text-secondary">Loading bills…</p>
          ) : (
            <AllocationTable
              rows={form.rows}
              onChange={(rows) => patch({ rows })}
              documentLabel="Bill"
              // No `amount` prop: this side has no typed total to spread.
              onFillAll={() => patch({ rows: fillToBalance(form.rows) })}
              fillAllLabel="Pay all in full"
              emptyText="This vendor has no posted bills owing. A draft bill has to be posted before it can be paid."
              disabled={busy}
            />
          )}
        </div>
        {errors.rows && (
          <p className="mt-sm text-body-sm text-danger">{errors.rows}</p>
        )}
      </Card>

      {/* ── Proof ───────────────────────────────────────────────────── */}
      <Card className="p-lg">
        <PaymentProofField
          proofId={form.proofId}
          onChange={(proofId) => {
            patch({ proofId });
            setErrors((e) => ({ ...e, proofId: '' }));
          }}
          disabled={busy}
        />
        {errors.proofId && (
          <p className="mt-sm text-body-sm text-danger">{errors.proofId}</p>
        )}
      </Card>

      {/* No Memo box here, unlike a bill or a customer receipt: `bill_payments`
          has no memo column and PayBillsDto declares no memo field, so anything
          typed into one was dropped by the server's whitelist without a word.
          Reference (the cheque or transfer number) is the free-text field that
          does persist. */}

      {/* Vendor credits are module 14 — said plainly rather than left as a
          silently missing option. */}
      {form.vendorId && (
        <p className="text-caption text-text-tertiary">
          Vendor credits cannot be applied here yet. This form pays cash only.
        </p>
      )}

      <SummaryPanel
        title="Payment summary"
        icon={<Banknote className="size-4" />}
        total={{ label: 'Total payment', value: total }}
      >
        <SummaryRow label={`Bills selected (${selectedCount})`} value={total} />
        {payFrom && (
          <SummaryRow
            label={`${payFrom.name} after payment`}
            value={balanceAfter ?? 0}
            // An overdraft is legitimate — it warns, it does not block.
            tone={overdrawn ? 'caution' : 'default'}
          />
        )}
      </SummaryPanel>

      {overdrawn && (
        <p className="text-body-sm text-warning">
          This payment takes {payFrom?.name} below zero. That is allowed — check
          it is what you intend.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-sm pb-xl">
        {blockedReason && (
          <span className="mr-auto text-caption text-text-tertiary">
            {blockedReason}
          </span>
        )}
        <Button asChild variant="secondary" disabled={busy}>
          <Link to="/bills">Cancel</Link>
        </Button>
        <Button
          onClick={() => {
            if (validate()) save.mutate();
          }}
          // Gated on the proof ID, not on a file having been chosen: a failed
          // upload must not look like a ready form.
          disabled={busy || !form.proofId || selectedCount === 0}
        >
          {busy
            ? 'Submitting…'
            : cap.needsApproval
              ? cap.submitLabel('Record payment')
              : 'Record payment'}
        </Button>
      </div>
    </div>
  );
}
