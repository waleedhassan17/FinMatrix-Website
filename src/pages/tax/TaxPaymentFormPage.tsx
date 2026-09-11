import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Info, Landmark } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DateField } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { TaxTabs } from '@/features/tax/TaxTabs';
import { isoToday } from '@/models/document';
import { presetRange } from '@/models/reportPeriod';
import {
  quarterLabel,
  taxPaymentPayload,
  validateTaxPayment,
  type TaxPaymentForm,
} from '@/models/tax';
import { createTaxPayment, getTaxLiability, getTaxRates } from '@/networks/tax/taxNetwork';
import { formatMoney, toDecimal } from '@/utils/money';

/**
 * Record a remittance to the tax authority. Owner only.
 *
 * Arrives prefilled from the liability report when opened from its button
 * (`?endDate&amount`), so the common case is one click and a reference.
 */
export default function TaxPaymentFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const idempotencyKey = useRef(crypto.randomUUID());

  const endDate = params.get('endDate') ?? isoToday();

  const rates = useQuery({
    queryKey: ['tax', 'rates', 'active'],
    queryFn: () => getTaxRates({ activeOnly: true }),
  });

  // What is owed this quarter to date, as a hint — not a limit.
  const quarter = presetRange('thisQuarter');
  const liability = useQuery({
    queryKey: ['tax', 'liability', quarter],
    queryFn: () => getTaxLiability(quarter),
  });

  const [form, setForm] = useState<TaxPaymentForm>(() => ({
    taxRateId: '',
    period: quarterLabel(endDate),
    amount: params.get('amount') && Number(params.get('amount')) > 0 ? String(params.get('amount')) : '',
    paymentDate: isoToday(),
    reference: '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Until the user picks one, the rate is the company's default, else the first
  // active rate. Derived rather than copied into state by an effect, so it follows
  // the rates as they load and nothing renders twice.
  const fallbackRateId =
    (rates.data?.find((r) => r.isDefault) ?? rates.data?.[0])?.id ?? '';
  const effective: TaxPaymentForm = {
    ...form,
    taxRateId: form.taxRateId || fallbackRateId,
  };

  const rateOptions = useMemo(
    () =>
      (rates.data ?? []).map((r) => ({
        value: r.id,
        label: `${r.name} · ${r.rate}%`,
      })),
    [rates.data],
  );

  const patch = (p: Partial<TaxPaymentForm>) => {
    setForm((f) => ({ ...f, ...p }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(p)) delete next[k];
      return next;
    });
  };

  const save = useMutation({
    mutationFn: () => createTaxPayment(taxPaymentPayload(effective), idempotencyKey.current),
    onSuccess: (p) => {
      for (const key of ['tax', 'accounts', 'reports', 'journal-entries', 'dashboard']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success('Tax payment recorded', {
        description: `${formatMoney(p.amount)} for ${p.period}, paid from Cash.`,
      });
      navigate('/tax/payments', { replace: true });
    },
    onError: (e: Error) => toast.error('Could not record the payment', { description: e.message }),
  });

  const submit = () => {
    const e = validateTaxPayment(effective);
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate();
  };

  const owed = liability.data?.totalNet ?? null;
  const amountValue = toDecimal(form.amount.replace(/,/g, ''));
  const exceedsOwed = owed !== null && owed > 0 && amountValue.greaterThan(owed);

  if (rates.data && rates.data.length === 0) {
    return (
      <div className="flex flex-col gap-lg">
        <TaxTabs />
        <Card className="mx-auto max-w-[32rem] p-xxl text-center">
          <Landmark className="mx-auto size-8 text-text-tertiary" />
          <h1 className="mt-md text-h3 text-text-primary">Add a tax rate first</h1>
          <p className="mt-xs text-body-md text-text-secondary">
            A payment is recorded against a tax rate, and there are no active rates yet.
          </p>
          <Button asChild className="mt-lg">
            <Link to="/tax/rates">Set up tax rates</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-lg">
      <TaxTabs />
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/tax/payments">
          <ArrowLeft className="size-4" />
          Tax payments
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">Record a tax payment</h1>
        <p className="text-body-sm text-text-secondary">
          Money paid to the tax authority. It reduces what is owed and what is in Cash.
        </p>
      </div>

      <div className="flex items-start gap-sm rounded-md bg-surface-2 p-md">
        <Info className="mt-[2px] size-4 shrink-0 text-text-secondary" />
        <p className="text-body-sm text-text-secondary">
          This posts <strong className="text-text-primary">Dr Sales Tax Payable (2300)</strong>{' '}
          and <strong className="text-text-primary">Cr Cash (1000)</strong>. The paying
          account can’t be changed — the server always takes remittances from Cash.
        </p>
      </div>

      <Card className="grid gap-md p-lg sm:grid-cols-2">
        <Select
          label="Tax"
          value={effective.taxRateId}
          onChange={(v) => patch({ taxRateId: v })}
          options={rateOptions}
          placeholder={rates.isLoading ? 'Loading rates…' : 'Choose a rate'}
          error={errors.taxRateId}
          containerClassName="sm:col-span-2"
        />
        <Input
          label="Period"
          value={form.period}
          onChange={(e) => patch({ period: e.target.value })}
          placeholder="2026-Q3"
          maxLength={32}
          error={errors.period}
          hint="The period this payment settles."
        />
        <DateField
          label="Paid on"
          value={form.paymentDate}
          onChange={(v) => patch({ paymentDate: v })}
          max={isoToday()}
          error={errors.paymentDate}
        />
        <Input
          label="Amount"
          value={form.amount}
          onChange={(e) => patch({ amount: e.target.value })}
          inputMode="decimal"
          placeholder="0.00"
          className="tabular"
          error={errors.amount}
          hint={
            owed === null
              ? undefined
              : owed > 0
                ? `${formatMoney(owed)} owed this quarter to date.`
                : 'Nothing is owed this quarter to date.'
          }
        />
        <Input
          label="Reference (optional)"
          value={form.reference}
          onChange={(e) => patch({ reference: e.target.value })}
          placeholder="Challan or receipt number"
          maxLength={64}
          error={errors.reference}
        />
      </Card>

      {exceedsOwed && (
        <p className="rounded-md border border-warning-light bg-warning-lighter p-md text-body-sm text-text-primary">
          This is more than the {formatMoney(owed)} owed this quarter to date. That is
          fine if it settles an earlier period — check the period is right.
        </p>
      )}

      <div className="flex justify-end gap-sm">
        <Button asChild variant="secondary">
          <Link to="/tax/payments">Cancel</Link>
        </Button>
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending ? 'Recording…' : 'Record payment'}
        </Button>
      </div>
    </div>
  );
}
