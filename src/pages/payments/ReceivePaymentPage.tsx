import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Info } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { BackButton, CancelButton } from '@/components/layout/BackLink';
import { useLeaveForm } from '@/features/shell/navHistory';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { DateField, Textarea } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { MoneyAccountPicker } from '@/features/accounts/MoneyAccountPicker';
import { SummaryPanel, SummaryRow } from '@/components/ui/SummaryPanel';
import { invalidateAfterPosting } from '@/features/documents/invalidateAfterPosting';
import { AllocationTable } from '@/features/payments/AllocationTable';
import { CreditsOnAccount } from '@/features/payments/CreditsOnAccount';
import { useCustomerOptions } from '@/features/documents/useDocumentPickers';
import { useCapability } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import {
  fillCredits,
  spreadCredits,
  type AllocationRow,
  type CreditSource,
} from '@/models/allocation';
import { isoToday } from '@/models/document';
import {
  autoDistribute,
  isOverAllocated,
  overAppliedRows,
  payInFull,
  PAYMENT_METHOD_OPTIONS,
  totalAllocated,
  unappliedOf,
  type AllocationMode,
  type ApiPaymentMethod,
  type PaymentFormData,
} from '@/models/payment';
import { getArPartySummary } from '@/networks/reports/agingNetwork';
import {
  getOutstandingInvoices,
  receivePayment,
  settleInvoices,
} from '@/networks/sales/paymentNetwork';
import { formatMoney, lakhCroreWords } from '@/utils/money';
import { paymentFormToPayload, settleInvoicesPayload } from '@/serializers/paymentSerializer';

/** What each kind of credit on account is called. */
const CREDIT_KIND_LABEL: Record<string, string> = {
  advance: 'Advance',
  credit_memo: 'Credit memo',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The invoices as the CASH part of the payment sees them: each balance less
 * what credit on account already covers, and those covered in full left out.
 */
const cashRowsOf = (rows: AllocationRow[], perDocument: Record<string, number>): AllocationRow[] =>
  rows
    .map((r) => ({ ...r, balance: round2(r.balance - (perDocument[r.documentId] ?? 0)) }))
    .filter((r) => r.balance > 0.004);

/** Put the cash split back onto the full list of invoices. */
const mergeCash = (rows: AllocationRow[], cashRows: AllocationRow[]): AllocationRow[] => {
  const byId = new Map(cashRows.map((r) => [r.documentId, r]));
  return rows.map((r) => {
    const c = byId.get(r.documentId);
    return c ? { ...r, checked: c.checked, applied: c.applied } : { ...r, checked: false, applied: '0' };
  });
};

const emptyForm = (): PaymentFormData => ({
  customerId: '',
  customerName: '',
  paymentDate: isoToday(),
  paymentMethod: 'bank_transfer',
  amount: '',
  reference: '',
  memo: '',
  bankAccountId: '',
  mode: 'manual',
  rows: [],
});

export default function ReceivePaymentPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const leave = useLeaveForm();
  const queryClient = useQueryClient();

  const cap = useCapability('payment.receive');
  const { byId: customersById, options: customerOptions } = useCustomerOptions();

  const [form, setForm] = useState<PaymentFormData>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Asked before saving a receipt that leaves money unapplied while invoices
  // are still open — the situation behind QA's duplicate receipt.
  const [holdConfirmOpen, setHoldConfirmOpen] = useState(false);
  // One key per form instance, so a double-submit or a retry replays the
  // stored response instead of banking the receipt twice.
  const idempotencyKey = useRef(crypto.randomUUID());

  const patch = (p: Partial<PaymentFormData>) => setForm((f) => ({ ...f, ...p }));

  const { data: outstanding, isFetching: loadingRows } = useQuery({
    queryKey: ['payments', 'outstanding', form.customerId],
    queryFn: () => getOutstandingInvoices(form.customerId),
    enabled: Boolean(form.customerId),
    staleTime: 0,
  });

  // Money this customer already has with us — advances held by earlier
  // receipts and open credit memos — from the same figures the outstanding
  // summary uses. Advances held for a delivery still on the road are not in it.
  const { data: summary } = useQuery({
    queryKey: ['reports', 'party-summary', 'customer', form.customerId],
    queryFn: () => getArPartySummary(form.customerId),
    enabled: Boolean(form.customerId),
    staleTime: 0,
  });
  const [credits, setCredits] = useState<CreditSource[]>([]);
  // Opened from the outstanding summary ("Receive payment" there): the summary's
  // total is what is due after credits, so the credits are switched on and every
  // open invoice is ticked — type what the customer paid and it is spread
  // oldest first, every row still editable.
  const fromSummary = searchParams.get('from') === 'summary';
  // Otherwise off until asked for — "Use credit" from an invoice turns it on —
  // so a plain receipt never quietly spends an advance the user did not mean to.
  const [useCredits, setUseCredits] = useState(searchParams.get('useCredits') === '1' || fromSummary);
  useEffect(() => {
    setCredits(
      fillCredits(
        (summary?.credits.items ?? []).map((c) => ({
          id: c.id,
          kind: c.kind === 'credit_memo' ? 'credit_memo' : 'advance',
          reference: c.reference,
          date: c.date,
          available: c.available,
          use: '',
        })),
      ),
    );
  }, [summary]);

  // Credit is spent on the oldest invoices first — except that "Use credit"
  // on an invoice puts that invoice first in line. The cash then works on
  // what the credit left.
  const priorityId = searchParams.get('useCredits') === '1' ? searchParams.get('invoiceId') : null;
  const targetsOf = (rows: AllocationRow[]) => {
    const targets = rows.map((r) => ({ documentId: r.documentId, cap: r.balance }));
    const first = targets.findIndex((t) => t.documentId === priorityId);
    return first > 0 ? [targets[first], ...targets.filter((_, i) => i !== first)] : targets;
  };
  const spread = useMemo(
    () => spreadCredits(targetsOf(form.rows), useCredits ? credits : []),
    // targetsOf depends only on priorityId, which comes from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.rows, credits, useCredits, priorityId],
  );
  const cashRows = useMemo(() => cashRowsOf(form.rows, spread.perDocument), [form.rows, spread]);

  /** Re-spread the cash after anything that changes what credit covers. */
  const redistribute = (rows: AllocationRow[], amount: string, nextCredits: CreditSource[], on: boolean) => {
    const next = spreadCredits(targetsOf(rows), on ? nextCredits : []);
    return mergeCash(rows, autoDistribute(cashRowsOf(rows, next.perDocument), amount));
  };

  // Seed the rows whenever the customer's open invoices arrive, honouring an
  // invoiceId handed over from the invoice detail page.
  useEffect(() => {
    if (!outstanding) return;
    const preselect = searchParams.get('invoiceId');
    const rows = outstanding.map((r) =>
      r.documentId === preselect || fromSummary ? { ...r, checked: true } : r,
    );
    // An amount handed over (e.g. "record the advance a credit limit needs").
    // Not when credit is to be used: that is what settles the invoice.
    const seedAmount =
      preselect && searchParams.get('useCredits') !== '1'
        ? String(rows.find((r) => r.documentId === preselect)?.balance ?? '')
        : (searchParams.get('amount') ?? '');
    setForm((f) => ({
      ...f,
      amount: f.amount || seedAmount,
      rows: autoDistribute(rows, f.amount || seedAmount),
    }));
  }, [outstanding, searchParams, fromSummary]);

  // Customer handed over from an invoice or a customer page.
  useEffect(() => {
    const preset = searchParams.get('customerId');
    if (!preset) return;
    const c = customersById.get(preset);
    if (c) setForm((f) => ({ ...f, customerId: c.id, customerName: c.name }));
  }, [searchParams, customersById]);

  // When credit is switched on or its figures change, the cash split follows:
  // it never overlaps what the credit already covers.
  useEffect(() => {
    setForm((f) => ({ ...f, rows: redistribute(f.rows, f.amount, credits, useCredits) }));
    // redistribute is a pure helper; the credit state is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credits, useCredits]);

  // Everything below is about the CASH part: rows are the balances after credit.
  const allocated = useMemo(() => totalAllocated(cashRows), [cashRows]);
  const unapplied = useMemo(
    () => unappliedOf(form.amount, allocated),
    [form.amount, allocated],
  );
  const overAllocated = isOverAllocated(form.amount, allocated);
  const hasOverApplied = overAppliedRows(cashRows).length > 0;
  const amountNumber = parseFloat(form.amount) || 0;
  const creditUsed = useCredits ? spread.used : 0;
  // What the open invoices will still owe once this payment and its credit land.
  const stillDue = round2(
    Math.max(form.rows.reduce((t, r) => t + r.balance, 0) - creditUsed - allocated, 0),
  );
  const creditOverUse = useCredits && credits.some((c) => (parseFloat(c.use) || 0) > c.available + 0.004);

  const setAmount = (value: string) => {
    const amount = value.replace(/[^0-9.]/g, '');
    setForm((f) => ({ ...f, amount, rows: redistribute(f.rows, amount, credits, useCredits) }));
  };

  const setMode = (mode: AllocationMode) =>
    setForm((f) => ({
      ...f,
      mode,
      // Leaving manual mode clears the ticks, so a stale split cannot be sent.
      rows: mode === 'auto' ? f.rows.map((r) => ({ ...r, checked: false, applied: '0' })) : f.rows,
    }));

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.customerId) errs.customerId = 'Select a customer';
    if (!form.paymentDate) errs.paymentDate = 'Payment date is required';
    // Credit alone can settle an invoice; without it, money has to arrive.
    if (amountNumber <= 0 && creditUsed <= 0) {
      errs.amount = credits.length
        ? 'Enter the amount received, or use credit on account'
        : 'Enter an amount above zero';
    }
    if (creditOverUse) errs.credits = 'A credit is set to use more than it holds';
    if (overAllocated) {
      errs.rows = 'Allocations add up to more than the payment';
    } else if (hasOverApplied) {
      errs.rows = 'An invoice is allocated more than it owes';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = useMutation({
    // With credit in use, one settlement: credit first, then the receipt, all
    // or nothing. Without it, the plain receipt it has always been.
    mutationFn: async () => {
      if (creditUsed > 0) {
        const result = await settleInvoices(
          settleInvoicesPayload(form, spread.pieces),
          idempotencyKey.current,
        );
        if (result.pending) return result;
        return { pending: false as const, payment: result.settlement.payment, creditTotal: result.settlement.creditTotal };
      }
      const result = await receivePayment(paymentFormToPayload(form), idempotencyKey.current);
      if (result.pending) return result;
      return { pending: false as const, payment: result.payment, creditTotal: 0 };
    },
    onSuccess: (result) => {
      if (result.pending) {
        // Nothing was banked — do NOT invalidate invoices or the dashboard.
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        toast.success('Sent for approval', {
          description: 'The invoices stay unpaid until the owner approves.',
        });
        navigate('/my-requests', { replace: true });
        return;
      }
      invalidateAfterPosting(queryClient);
      queryClient.invalidateQueries({ queryKey: ['reports', 'party-summary'] });
      const { payment, creditTotal } = result;
      if (!payment) {
        // Credit covered it all: nothing was banked, so there is no receipt.
        toast.success('Invoices settled from credit', {
          description: `${formatMoney(creditTotal)} of credit on account applied — no new money recorded.`,
        });
        leave(`/customers/${form.customerId}`);
        return;
      }
      toast.success(creditTotal > 0 ? 'Payment recorded with credit' : 'Payment recorded', {
        description: [
          creditTotal > 0 ? `${formatMoney(creditTotal)} of credit on account applied.` : '',
          payment.unapplied > 0 ? 'The unapplied remainder is held as a customer advance.' : '',
        ]
          .filter(Boolean)
          .join(' ') || undefined,
      });
      leave(`/payments/${payment.id}`);
    },
    // Server reasons matter: PAYMENT_EXCEEDS_BALANCE usually means someone
    // settled the invoice while this form was open, and PERIOD_LOCKED means
    // the books are closed through the chosen date.
    onError: (e: Error) =>
      toast.error('Could not record payment', { description: e.message }),
  });

  const busy = save.isPending;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg">
      <BackButton fallback={{ to: '/payments', label: 'Payments' }} />

      <div>
        <h1 className="text-h2 text-text-primary">Receive payment</h1>
        <p className="text-body-sm text-text-secondary">
          {fromSummary && summary
            ? `Against the outstanding summary: ${formatMoney(summary.netDue)} due on ${summary.totals.count} invoice${summary.totals.count === 1 ? '' : 's'}. Type what was paid — it is applied oldest first, and every amount can be changed.`
            : 'Bank money a customer has paid you and apply it to their invoices.'}
        </p>
      </div>

      {cap.needsApproval && (
        <div className="flex items-start gap-sm rounded-md border border-warning-light bg-warning-lighter p-md">
          <Info className="mt-[2px] size-4 shrink-0 text-warning" />
          <p className="text-body-sm text-text-primary">
            This payment will be sent to the owner for approval. Nothing is banked
            and the invoices stay unpaid until they approve it.
          </p>
        </div>
      )}

      {/* Money already on account, not yet in use: the situation behind a
          receipt recorded twice. Said once, with the way to use it. */}
      {credits.length > 0 && !useCredits && (
        <div className="flex flex-wrap items-start gap-sm rounded-md border border-warning-light bg-warning-lighter p-md">
          <Info className="mt-[2px] size-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1 text-body-sm text-text-primary">
            <strong>{form.customerName || 'This customer'}</strong> already has{' '}
            <strong>{formatMoney(credits.reduce((t, c) => t + c.available, 0))}</strong> on account. If
            this is money they already paid, use it instead of recording new cash — recording it again
            would count the same money twice.
          </p>
          <Button size="sm" variant="secondary" onClick={() => setUseCredits(true)} disabled={busy}>
            Use in this payment
          </Button>
        </div>
      )}

      {/* ── Payment details ─────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Payment details" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Combobox
            label="Customer *"
            value={form.customerId}
            onChange={(customerId) => {
              const c = customersById.get(customerId);
              patch({ customerId, customerName: c?.name ?? '', rows: [] });
              setErrors((e) => ({ ...e, customerId: '' }));
            }}
            options={customerOptions}
            placeholder="Select a customer…"
            searchPlaceholder="Search customers…"
            error={errors.customerId}
            containerClassName="sm:col-span-2"
          />

          <DateField
            label="Payment date *"
            value={form.paymentDate}
            onChange={(v) => patch({ paymentDate: v })}
            error={errors.paymentDate}
            hint="The books must be open through this date."
          />
          <Select
            label="Method"
            value={form.paymentMethod}
            onChange={(v) => patch({ paymentMethod: v as ApiPaymentMethod })}
            options={PAYMENT_METHOD_OPTIONS}
          />

          <Input
            label={creditUsed > 0 ? 'Amount received' : 'Amount received *'}
            value={form.amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            error={errors.amount}
            hint={
              [
                lakhCroreWords(form.amount) ? `= ${lakhCroreWords(form.amount)}` : '',
                creditUsed > 0 ? 'Leave empty if credit on account covers what is being settled.' : '',
              ]
                .filter(Boolean)
                .join(' · ') || undefined
            }
          />
          <Input
            label="Reference"
            value={form.reference}
            onChange={(e) => patch({ reference: e.target.value })}
            placeholder="e.g. CHQ-12345"
            hint="The cheque or transfer number. The receipt gets its own RCT number."
          />

          {/* Every cash and bank account the money could have gone into — the
              bank the customer actually paid. Automatic keeps the old rule. */}
          <MoneyAccountPicker
            label="Deposit to"
            value={form.bankAccountId}
            onChange={(v) => patch({ bankAccountId: v })}
            automaticLabel="Automatic — let FinMatrix choose"
            containerClassName="sm:col-span-2"
            hint={
              form.bankAccountId
                ? undefined
                : form.paymentMethod === 'cash'
                  ? 'Automatic uses account 1000 Cash for a cash payment.'
                  : 'Automatic uses account 1010 Business Checking.'
            }
          />
        </div>
      </Card>

      {/* ── Credit on account ───────────────────────────────────────── */}
      <CreditsOnAccount
        credits={credits}
        enabled={useCredits}
        onToggle={setUseCredits}
        onChange={setCredits}
        spread={spread}
        kindLabel={(c) => CREDIT_KIND_LABEL[c.kind ?? 'advance'] ?? 'Credit'}
        partyName={form.customerName}
        disabled={busy}
      />
      {errors.credits && <p className="-mt-md text-caption text-danger">{errors.credits}</p>}

      {/* ── Allocation ──────────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title={creditUsed > 0 ? 'Apply the money received' : 'Apply to invoices'} />

        <div className="mt-md flex flex-wrap gap-xs">
          {(
            [
              ['manual', 'Allocate manually'],
              ['auto', 'Apply automatically, oldest first'],
            ] as [AllocationMode, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                'rounded-full px-sm py-xxs text-label-md transition-colors',
                value === form.mode
                  ? 'bg-primary text-text-inverse'
                  : 'bg-neutral-100 text-text-secondary hover:bg-neutral-200',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {form.mode === 'auto' ? (
          <p className="mt-md rounded-md bg-surface-2 p-md text-body-sm text-text-secondary">
            The server will apply this payment across the customer&rsquo;s open
            invoices, oldest due date first, and hold any remainder as an advance.
            You will not choose which invoices it settles.
          </p>
        ) : loadingRows ? (
          <p className="mt-md text-body-sm text-text-secondary">
            Loading open invoices…
          </p>
        ) : !form.customerId ? (
          <p className="mt-md text-body-sm text-text-tertiary">
            Pick a customer to see their open invoices.
          </p>
        ) : (
          <div className="mt-md">
            <AllocationTable
              // What is still owed once credit has taken its part.
              rows={cashRows}
              amount={form.amount}
              onChange={(rows) => patch({ rows: mergeCash(form.rows, rows) })}
              documentLabel="Invoice"
              fillAllLabel={creditUsed > 0 ? 'Pay the rest in full' : 'Pay in full'}
              onFillAll={() => {
                const filled = payInFull(cashRows);
                patch({ rows: mergeCash(form.rows, filled.rows), amount: filled.amount });
              }}
              emptyText={
                creditUsed > 0 && form.rows.length > 0
                  ? 'Credit on account settles every open invoice — no money needs to be received. Anything entered above is held as an advance.'
                  : 'This customer has no open invoices. The whole payment will be held as an advance on their account.'
              }
              disabled={busy}
            />
          </div>
        )}

        {errors.rows && (
          <p className="mt-sm text-caption text-danger">{errors.rows}</p>
        )}
      </Card>

      {/* ── Notes ───────────────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Notes" />
        <div className="mt-md">
          <Textarea
            value={form.memo}
            onChange={(e) => patch({ memo: e.target.value })}
            placeholder="Anything worth recording about this receipt…"
          />
        </div>
      </Card>

      {/* ── Summary ─────────────────────────────────────────────────── */}
      {(amountNumber > 0 || creditUsed > 0) && (
        <SummaryPanel
          title="Payment summary"
          icon={<CreditCard className="size-4" />}
          total={
            creditUsed > 0
              ? { label: 'Credit + money received', value: round2(creditUsed + amountNumber) }
              : { label: 'Amount received', value: amountNumber }
          }
        >
          {creditUsed > 0 && (
            <>
              <SummaryRow label="Credit on account used" value={creditUsed} tone="positive" />
              <SummaryRow label="Money received" value={amountNumber} />
            </>
          )}
          <SummaryRow
            label={creditUsed > 0 ? 'Money applied to invoices' : 'Applied to invoices'}
            value={allocated}
            tone={allocated > 0 ? 'positive' : 'default'}
          />
          {unapplied > 0 && (
            <SummaryRow
              label="Unapplied amount"
              value={unapplied}
              // Amber when it will legitimately be held as a customer credit;
              // red when it has nowhere to go — which is also the state that
              // blocks saving.
              tone={form.mode === 'auto' || allocated > 0 ? 'caution' : 'negative'}
            />
          )}
          {overAllocated && (
            <SummaryRow
              label="Over-allocated by"
              value={allocated - amountNumber}
              tone="negative"
            />
          )}
          {form.mode === 'manual' && form.rows.length > 0 && (
            <SummaryRow label="Still due after this payment" value={stillDue} />
          )}
        </SummaryPanel>
      )}

      {unapplied > 0 && !overAllocated && (
        <p className="text-body-sm text-text-secondary">
          {formatUnappliedNote(form.mode)}
        </p>
      )}

      <ConfirmDialog
        open={holdConfirmOpen}
        onOpenChange={setHoldConfirmOpen}
        title="Keep the remainder as an advance?"
        description={
          <>
            {formatMoney(unapplied)} of this payment is not applied, while{' '}
            {cashRows
              .filter((r) => r.balance - (r.checked ? parseFloat(r.applied) || 0 : 0) > 0.001)
              .map((r) => r.documentNumber)
              .join(', ')}{' '}
            still owe money. It will be held as a customer advance and can be applied later — or go
            back and apply it now.
          </>
        }
        confirmLabel="Keep as advance"
        cancelLabel="Go back and apply"
        busy={busy}
        onConfirm={() => {
          setHoldConfirmOpen(false);
          save.mutate();
        }}
      />

      <div className="flex flex-wrap justify-end gap-sm pb-xl">
        <CancelButton fallback="/payments" disabled={busy} />
        <Button
          onClick={() => {
            if (!validate()) return;
            // Money left unapplied while invoices still owe: make it a choice.
            const stillOwed = cashRows.some(
              (r) => r.balance - (r.checked ? parseFloat(r.applied) || 0 : 0) > 0.001,
            );
            if (form.mode === 'manual' && amountNumber > 0 && unapplied > 0 && stillOwed) {
              setHoldConfirmOpen(true);
              return;
            }
            save.mutate();
          }}
          disabled={busy}
        >
          {busy
            ? 'Recording…'
            : cap.submitLabel(creditUsed > 0 && amountNumber <= 0 ? 'Apply credit' : 'Record payment')}
        </Button>
      </div>
    </div>
  );
}

function formatUnappliedNote(mode: AllocationMode): string {
  return mode === 'auto'
    ? 'Whatever the automatic sweep cannot apply will be held as an advance on the customer’s account (Customer Advances).'
    : 'The unapplied remainder will be held as an advance on the customer’s account (Customer Advances), ready to apply to a later invoice.';
}
