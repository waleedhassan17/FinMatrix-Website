import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Banknote, Info } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { CreditsOnAccount } from '@/features/payments/CreditsOnAccount';
import { useCapability } from '@/hooks/useCapability';
import {
  fillCredits,
  fillToBalance,
  overAppliedRows,
  spreadCredits,
  totalAllocated,
  type CreditSource,
} from '@/models/allocation';
import type { PayBillsFormData } from '@/models/bill';
import { isoToday } from '@/models/document';
import { PAYMENT_METHOD_OPTIONS, type ApiPaymentMethod } from '@/models/payment';
import { getDepositAccounts } from '@/networks/accounting/accountNetwork';
import { getPayableBills, payBills, settleBills } from '@/networks/purchases/billNetwork';
import { getApPartySummary } from '@/networks/reports/agingNetwork';
import { payBillsFormToPayload, settleBillsPayload } from '@/serializers/billSerializer';
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

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function PayBillsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const cap = useCapability('bill.pay');
  const { byId: vendorsById, options: vendorOptions } = useVendorOptions();

  const [form, setForm] = useState<PayBillsFormData>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // One key per form instance: a double-click or a retry replays the stored
  // answer instead of settling twice.
  const idempotencyKey = useRef(crypto.randomUUID());

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

  // The vendor's credits — open ones and ones already partly used — from the
  // same figures as the payables summary.
  const { data: summary } = useQuery({
    queryKey: ['reports', 'party-summary', 'vendor', form.vendorId],
    queryFn: () => getApPartySummary(form.vendorId),
    enabled: Boolean(form.vendorId),
    staleTime: 0,
  });
  const [credits, setCredits] = useState<CreditSource[]>([]);
  const [useCredits, setUseCredits] = useState(false);
  useEffect(() => {
    const items = (summary?.credits.items ?? []).map((c) => ({
      id: c.id,
      kind: 'vendor_credit',
      reference: c.reference,
      date: c.date,
      available: c.available,
      use: '',
    }));
    setCredits(fillCredits(items));
    // Offer it straight away: using a supplier's credit before paying them cash
    // is almost always what is meant, and the switch is right there.
    setUseCredits(items.length > 0);
  }, [summary]);

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

  // Each ticked row's figure is what that bill is settled by. Credit covers
  // the first of it, oldest bill first; the rest is cash.
  const total = useMemo(() => totalAllocated(form.rows), [form.rows]);
  const spread = useMemo(
    () =>
      spreadCredits(
        form.rows
          .filter((r) => r.checked && (parseFloat(r.applied) || 0) > 0)
          .map((r) => ({ documentId: r.documentId, cap: parseFloat(r.applied) || 0 })),
        useCredits ? credits : [],
      ),
    [form.rows, credits, useCredits],
  );
  const creditUsed = useCredits ? spread.used : 0;
  const cash = round2(Math.max(total - creditUsed, 0));
  const creditOverUse = useCredits && credits.some((c) => (parseFloat(c.use) || 0) > c.available + 0.004);
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
  const balanceAfter = payFrom ? payFrom.balance - cash : null;
  const overdrawn = balanceAfter !== null && balanceAfter < 0;
  // Money only needs an account and a proof when some of it leaves the bank.
  const needsCash = cash > 0.004;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.vendorId) errs.vendorId = 'Select a vendor';
    if (!form.paymentDate) errs.paymentDate = 'Payment date is required';
    if (needsCash && !form.bankAccountId) errs.bankAccountId = 'Choose the account to pay from';
    if (needsCash && !form.proofId) errs.proofId = 'A payment proof is required';
    if (creditOverUse) errs.credits = 'A credit is set to use more than it holds';
    if (hasOverApplied) {
      errs.rows = 'A bill is allocated more than it owes';
    } else if (selectedCount === 0) {
      errs.rows = 'Choose at least one bill to pay';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = useMutation({
    mutationFn: async () => {
      if (creditUsed > 0) {
        const result = await settleBills(settleBillsPayload(form, spread.pieces), idempotencyKey.current);
        return result.pending ? result : { pending: false as const };
      }
      const result = await payBills(payBillsFormToPayload(form));
      return result.pending ? result : { pending: false as const };
    },
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
      queryClient.invalidateQueries({ queryKey: ['reports', 'party-summary'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-credits'] });

      // A receipt rather than a toast: this is money out of the bank, and the
      // person who pressed the button should see what it did. `replace` so
      // Back cannot return to a form that would re-post.
      navigate('/bills/pay/receipt', {
        replace: true,
        state: {
          vendorName: form.vendorName,
          paymentDate: form.paymentDate,
          total,
          creditApplied: creditUsed,
          cashPaid: cash,
          accountName: needsCash && payFrom ? `${payFrom.accountNumber} · ${payFrom.name}` : '',
          balanceAfter: needsCash ? balanceAfter : null,
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
  const blockedReason =
    selectedCount === 0
      ? 'Choose at least one bill to pay.'
      : needsCash && !form.proofId
        ? 'Attach a payment proof to continue.'
        : needsCash && !form.bankAccountId
          ? 'Choose the account you are paying from.'
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
          Settle what you owe a supplier — from their credit, from your bank, or both.
        </p>
      </div>

      {cap.needsApproval && (
        <div className="flex items-start gap-sm rounded-md border border-warning-light bg-warning-lighter p-md">
          <Info className="mt-[2px] size-4 shrink-0 text-warning" />
          <p className="text-body-sm text-text-primary">
            This payment will be sent to the owner for approval. No money moves,
            no credit is used and the bills stay unpaid until they approve it.
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
            label="Method"
            value={form.paymentMethod}
            onChange={(v) => patch({ paymentMethod: v as ApiPaymentMethod })}
            options={PAYMENT_METHOD_OPTIONS}
          />

          <Combobox
            label={needsCash ? 'Pay from *' : 'Pay from'}
            value={form.bankAccountId}
            onChange={(bankAccountId) => patch({ bankAccountId })}
            options={accountOptions}
            placeholder="Choose an account…"
            searchPlaceholder="Search accounts…"
            error={errors.bankAccountId}
            hint={
              payFrom
                ? `Balance ${formatMoney(payFrom.balance)}`
                : needsCash
                  ? 'Required — there is no default account for money going out.'
                  : 'Not needed: vendor credit covers what is being settled.'
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

      {/* ── Vendor credit ───────────────────────────────────────────── */}
      <CreditsOnAccount
        credits={credits}
        enabled={useCredits}
        onToggle={setUseCredits}
        onChange={setCredits}
        spread={spread}
        kindLabel={() => 'Vendor credit'}
        partyName={form.vendorName}
        disabled={busy}
      />
      {errors.credits && <p className="-mt-md text-caption text-danger">{errors.credits}</p>}

      {/* ── Proof ───────────────────────────────────────────────────── */}
      {needsCash && (
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
      )}

      {/* No Memo box here, unlike a bill or a customer receipt: `bill_payments`
          has no memo column and PayBillsDto declares no memo field, so anything
          typed into one was dropped by the server's whitelist without a word.
          Reference (the cheque or transfer number) is the free-text field that
          does persist. */}

      <SummaryPanel
        title="Payment summary"
        icon={<Banknote className="size-4" />}
        total={{ label: creditUsed > 0 ? 'Cash to pay' : 'Total payment', value: cash }}
      >
        <SummaryRow label={`Bills selected (${selectedCount})`} value={total} />
        {creditUsed > 0 && (
          <SummaryRow label="Vendor credit used" value={creditUsed} tone="positive" />
        )}
        {payFrom && needsCash && (
          <SummaryRow
            label={`${payFrom.name} after payment`}
            value={balanceAfter ?? 0}
            // An overdraft is legitimate — it warns, it does not block.
            tone={overdrawn ? 'caution' : 'default'}
          />
        )}
      </SummaryPanel>

      {overdrawn && needsCash && (
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
          disabled={busy || selectedCount === 0 || (needsCash && !form.proofId)}
        >
          {busy
            ? 'Submitting…'
            : cap.submitLabel(needsCash ? 'Record payment' : 'Apply vendor credit')}
        </Button>
      </div>
    </div>
  );
}
