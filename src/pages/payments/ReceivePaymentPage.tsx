import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, Info } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { DateField, Textarea } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SummaryPanel, SummaryRow } from '@/components/ui/SummaryPanel';
import { AllocationTable } from '@/features/payments/AllocationTable';
import { useCustomerOptions } from '@/features/documents/useDocumentPickers';
import { useCapability } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
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
import { getDepositAccounts } from '@/networks/accounting/accountNetwork';
import {
  getOutstandingInvoices,
  receivePayment,
} from '@/networks/sales/paymentNetwork';
import { paymentFormToPayload } from '@/serializers/paymentSerializer';

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
  const queryClient = useQueryClient();

  const cap = useCapability('payment.receive');
  const { byId: customersById, options: customerOptions } = useCustomerOptions();

  const [form, setForm] = useState<PaymentFormData>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // One key per form instance, so a double-submit or a retry replays the
  // stored response instead of banking the receipt twice.
  const idempotencyKey = useRef(crypto.randomUUID());

  const patch = (p: Partial<PaymentFormData>) => setForm((f) => ({ ...f, ...p }));

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', 'deposit'],
    queryFn: getDepositAccounts,
  });

  const { data: outstanding, isFetching: loadingRows } = useQuery({
    queryKey: ['payments', 'outstanding', form.customerId],
    queryFn: () => getOutstandingInvoices(form.customerId),
    enabled: Boolean(form.customerId),
  });

  // Seed the rows whenever the customer's open invoices arrive, honouring an
  // invoiceId handed over from the invoice detail page.
  useEffect(() => {
    if (!outstanding) return;
    const preselect = searchParams.get('invoiceId');
    const rows = outstanding.map((r) =>
      r.documentId === preselect ? { ...r, checked: true } : r,
    );
    const seedAmount = preselect
      ? String(rows.find((r) => r.documentId === preselect)?.balance ?? '')
      : '';
    setForm((f) => ({
      ...f,
      amount: f.amount || seedAmount,
      rows: autoDistribute(rows, f.amount || seedAmount),
    }));
  }, [outstanding, searchParams]);

  // Customer handed over from an invoice or a customer page.
  useEffect(() => {
    const preset = searchParams.get('customerId');
    if (!preset) return;
    const c = customersById.get(preset);
    if (c) setForm((f) => ({ ...f, customerId: c.id, customerName: c.name }));
  }, [searchParams, customersById]);

  const allocated = useMemo(() => totalAllocated(form.rows), [form.rows]);
  const unapplied = useMemo(
    () => unappliedOf(form.amount, allocated),
    [form.amount, allocated],
  );
  const overAllocated = isOverAllocated(form.amount, allocated);
  const hasOverApplied = overAppliedRows(form.rows).length > 0;
  const amountNumber = parseFloat(form.amount) || 0;

  const accountOptions = useMemo(
    () => [
      { value: '', label: 'Automatic — let FinMatrix choose' },
      ...accounts.map((a) => ({
        value: a.id,
        label: `${a.accountNumber} · ${a.name}`,
      })),
    ],
    [accounts],
  );

  const setAmount = (value: string) => {
    const amount = value.replace(/[^0-9.]/g, '');
    setForm((f) => ({ ...f, amount, rows: autoDistribute(f.rows, amount) }));
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
    if (amountNumber <= 0) errs.amount = 'Enter an amount above zero';
    if (overAllocated) {
      errs.rows = 'Allocations add up to more than the payment';
    } else if (hasOverApplied) {
      errs.rows = 'An invoice is allocated more than it owes';
    } else if (form.mode === 'manual' && allocated === 0 && form.rows.length > 0) {
      // An empty applications array is what triggers the server's FIFO sweep,
      // so "manual mode, nothing ticked" cannot mean what it looks like.
      errs.rows =
        'Tick at least one invoice, or switch to "Apply automatically" to let the server allocate.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = useMutation({
    mutationFn: () =>
      receivePayment(paymentFormToPayload(form), idempotencyKey.current),
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
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Payment recorded', {
        description:
          result.payment.unapplied > 0
            ? 'The unapplied remainder is held as a customer credit.'
            : undefined,
      });
      navigate(`/payments/${result.payment.id}`, { replace: true });
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
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/payments">
          <ArrowLeft className="size-4" />
          Payments
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">Receive payment</h1>
        <p className="text-body-sm text-text-secondary">
          Bank money a customer has paid you and apply it to their invoices.
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
            label="Amount received *"
            value={form.amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            error={errors.amount}
          />
          <Input
            label="Reference"
            value={form.reference}
            onChange={(e) => patch({ reference: e.target.value })}
            placeholder="e.g. CHQ-12345"
            hint="A payment has no number — this is how you will find it later."
          />

          <Select
            label="Deposit to"
            value={form.bankAccountId}
            onChange={(v) => patch({ bankAccountId: v })}
            options={accountOptions}
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

      {/* ── Allocation ──────────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Apply to invoices" />

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
            invoices, oldest due date first, and hold any remainder as a credit.
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
              rows={form.rows}
              amount={form.amount}
              onChange={(rows) => patch({ rows })}
              documentLabel="Invoice"
              fillAllLabel="Pay in full"
              onFillAll={() => {
                const filled = payInFull(form.rows);
                patch({ rows: filled.rows, amount: filled.amount });
              }}
              emptyText="This customer has no open invoices. The whole payment will be held as a credit on their account."
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
      {amountNumber > 0 && (
        <SummaryPanel
          title="Payment summary"
          icon={<CreditCard className="size-4" />}
          total={{ label: 'Amount received', value: amountNumber }}
        >
          <SummaryRow
            label="Applied to invoices"
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
        </SummaryPanel>
      )}

      {unapplied > 0 && !overAllocated && (
        <p className="text-body-sm text-text-secondary">
          {formatUnappliedNote(form.mode)}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-sm pb-xl">
        <Button asChild variant="secondary" disabled={busy}>
          <Link to="/payments">Cancel</Link>
        </Button>
        <Button
          onClick={() => {
            if (validate()) save.mutate();
          }}
          disabled={busy}
        >
          {busy ? 'Recording…' : cap.submitLabel('Record payment')}
        </Button>
      </div>
    </div>
  );
}

function formatUnappliedNote(mode: AllocationMode): string {
  return mode === 'auto'
    ? 'Whatever the automatic sweep cannot apply will be held as a credit on the customer’s account.'
    : 'The unapplied remainder will be held as a credit on the customer’s account.';
}
