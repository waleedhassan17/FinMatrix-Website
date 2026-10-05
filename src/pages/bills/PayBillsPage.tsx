import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Info } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { BackButton, CancelButton } from '@/components/layout/BackLink';
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
  autoDistribute,
  fillCredits,
  fillToBalance,
  overAppliedRows,
  spreadCredits,
  totalAllocated,
  type AllocationRow,
  type CreditSource,
} from '@/models/allocation';
import type { PayBillsFormData } from '@/models/bill';
import { isoToday } from '@/models/document';
import { PAYMENT_METHOD_OPTIONS, type ApiPaymentMethod } from '@/models/payment';
import { getDepositAccounts } from '@/networks/accounting/accountNetwork';
import { getPayableBills, payBills, settleBills } from '@/networks/purchases/billNetwork';
import { getApPartySummary } from '@/networks/reports/agingNetwork';
import { payBillsFormToPayload, settleBillsPayload } from '@/serializers/billSerializer';
import { formatMoney, lakhCroreWords } from '@/utils/money';
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
  // Opened from the payables summary ("Pay bills" there): every open bill is
  // ticked, so typing what is being paid spreads it across them.
  const fromSummary = searchParams.get('from') === 'summary';
  /**
   * The cash being paid, when typed. Empty, each ticked bill is paid in full,
   * as it always was. Typed, vendor credit is used first and the cash is spread
   * over the ticked bills oldest first — 30 lakh and 20 lakh in full, 10 on the
   * third. A vendor has no advance account here, so it cannot be more than the
   * ticked bills owe after credit.
   */
  const [payAmount, setPayAmount] = useState('');
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
        r.documentId === preselect || fromSummary
          ? { ...r, checked: true, applied: String(r.balance) }
          : r,
      ),
    }));
  }, [payable, searchParams, fromSummary]);

  useEffect(() => {
    const preset = searchParams.get('vendorId');
    if (!preset) return;
    const v = vendorsById.get(preset);
    if (v) setForm((f) => ({ ...f, vendorId: v.id, vendorName: v.name }));
  }, [searchParams, vendorsById]);

  /** The credit a typed payment can lean on: what is set to be used, at most what the ticked bills owe. */
  const creditCapacity = (rows: AllocationRow[], on: boolean, list: CreditSource[]): number => {
    if (!on) return 0;
    const owed = rows.filter((r) => r.checked).reduce((t, r) => t + r.balance, 0);
    const credit = list.reduce((t, c) => t + (parseFloat(c.use) || 0), 0);
    return round2(Math.min(owed, credit));
  };
  /** The ticked bills' figures for a typed cash amount: credit plus cash, oldest first. */
  const spreadPayment = (rows: AllocationRow[], amount: string, on: boolean, list: CreditSource[]) =>
    amount.trim()
      ? autoDistribute(rows, String(round2((parseFloat(amount) || 0) + creditCapacity(rows, on, list))))
      : // Cleared: back to paying each ticked bill in full.
        rows.map((r) => (r.checked ? { ...r, applied: String(r.balance) } : r));
  const setPaymentAmount = (value: string) => {
    const amount = value.replace(/[^0-9.]/g, '');
    setPayAmount(amount);
    setErrors((e) => ({ ...e, payAmount: '' }));
    setForm((f) => ({ ...f, rows: spreadPayment(f.rows, amount, useCredits, credits) }));
  };
  // Credit switched on or off, or its figures changed: a typed payment is
  // spread again, so the cash stays what was typed.
  useEffect(() => {
    if (!payAmount.trim()) return;
    setForm((f) => ({ ...f, rows: spreadPayment(f.rows, payAmount, useCredits, credits) }));
    // spreadPayment is a pure helper; the credit state is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credits, useCredits]);

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

  // The most a typed payment can be: what the ticked bills owe after credit.
  const capacity = creditCapacity(form.rows, useCredits, credits);
  const maxCash = round2(
    Math.max(form.rows.filter((r) => r.checked).reduce((t, r) => t + r.balance, 0) - capacity, 0),
  );
  const payAmountTooBig = payAmount.trim() !== '' && (parseFloat(payAmount) || 0) > maxCash + 0.004;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.vendorId) errs.vendorId = 'Select a vendor';
    if (payAmountTooBig) {
      errs.payAmount = `More than the ticked bills owe after credit (${formatMoney(maxCash)}). A vendor payment cannot be more than the bills it pays.`;
    }
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
      <BackButton fallback={{ to: '/bills', label: 'Bills' }} />

      <div>
        <h1 className="text-h2 text-text-primary">Pay bills</h1>
        <p className="text-body-sm text-text-secondary">
          {fromSummary && summary
            ? `Against the payables summary: ${formatMoney(summary.netDue)} owed on ${summary.totals.count} bill${summary.totals.count === 1 ? '' : 's'}. Type what you are paying — it is applied oldest first, and every amount can be changed.`
            : 'Settle what you owe a supplier — from their credit, from your bank, or both.'}
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
            onChange={(vendorId) => {
              setPayAmount('');
              patch({
                vendorId,
                vendorName: vendorsById.get(vendorId)?.name ?? '',
                rows: [],
              });
            }}
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
            <>
              {form.rows.length > 0 && (
                <Input
                  label="Amount to pay"
                  value={payAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="Each ticked bill in full"
                  error={errors.payAmount || (payAmountTooBig ? `At most ${formatMoney(maxCash)} for the ticked bills` : undefined)}
                  hint={
                    lakhCroreWords(payAmount)
                      ? `= ${lakhCroreWords(payAmount)}`
                      : 'Optional: type a sum and it is spread over the ticked bills, oldest first.'
                  }
                  containerClassName="mb-md max-w-sm"
                  disabled={busy}
                />
              )}
              <AllocationTable
                rows={form.rows}
                onChange={(rows) => patch({ rows })}
                documentLabel="Bill"
                // With a typed amount, ticking a bill spreads that amount again
                // (credit plus cash); without one, a ticked bill is paid in full.
                amount={
                  payAmount.trim()
                    ? String(round2((parseFloat(payAmount) || 0) + capacity))
                    : undefined
                }
                onFillAll={() => {
                  setPayAmount('');
                  patch({ rows: fillToBalance(form.rows) });
                }}
                fillAllLabel="Pay all in full"
                emptyText="This vendor has no posted bills owing. A draft bill has to be posted before it can be paid."
                disabled={busy}
              />
            </>
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
        <CancelButton fallback="/bills" disabled={busy} />
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
