import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Info, Users, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DateField } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { invalidatePayroll } from '@/features/payroll/invalidatePayroll';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useFeature } from '@/hooks/useCapability';
import { isoToday } from '@/models/document';
import {
  DEFAULT_HOURS,
  fullName,
  monthPeriod,
  periodPay,
  previewTotals,
  type Employee,
} from '@/models/payroll';
import { createPayrollRun, getEmployees } from '@/networks/payroll/payrollNetwork';
import { formatMoney } from '@/utils/money';

const HOURS = /^\d+(\.\d{1,2})?$/;

/**
 * Build a payroll run as a DRAFT. Nothing posts here — the run can be checked,
 * and thrown away, before it is processed.
 *
 * The preview uses the same arithmetic the server does, so what is shown is
 * what the draft will hold.
 */
export default function PayrollRunFormPage() {
  const enabled = useFeature('payroll');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [month, setMonth] = useState(() => isoToday().slice(0, 7));
  const period = monthPeriod(month);
  const [payDate, setPayDate] = useState<string | null>(null);
  const effectivePayDate = payDate ?? period.payDate;
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [hours, setHours] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ['employees', 'list'],
    queryFn: () => getEmployees(),
    enabled,
  });
  const active = useMemo(() => (query.data ?? []).filter((e) => e.status === 'active'), [query.data]);

  const hoursFor = (e: Employee): number => {
    const v = hours[e.id];
    return v !== undefined && HOURS.test(v) ? Number(v) : DEFAULT_HOURS;
  };
  const badHours = active.some(
    (e) => e.payType === 'hourly' && hours[e.id] !== undefined && !HOURS.test(hours[e.id]),
  );

  const included = active.filter((e) => !excluded.has(e.id));
  const lines = included.map((e) => periodPay(e, hoursFor(e)));
  const totals = previewTotals(lines);
  const mixedFrequency = included.some((e) => e.payType === 'salary' && e.payFrequency !== 'monthly');
  const negativeNet = lines.some((l) => l.net.isNegative());

  const save = useMutation({
    mutationFn: () =>
      createPayrollRun({
        ...period,
        payDate: effectivePayDate,
        items: included.map((e) => ({
          employeeId: e.id,
          ...(e.payType === 'hourly' ? { hours: String(hoursFor(e)) } : {}),
        })),
      }),
    onSuccess: (run) => {
      invalidatePayroll(queryClient);
      toast.success('Draft payroll run created', {
        description: 'Nothing has posted yet. Check it, then process it.',
      });
      navigate(`/payroll/runs/${run.id}`, { replace: true });
    },
    onError: (e: Error) => toast.error('Could not build the run', { description: e.message }),
  });

  if (!enabled) {
    return <FeatureUnavailable icon={Wallet} title="Payroll" body="Payroll is not included in your company’s plan." />;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/payroll/runs">
          <ArrowLeft className="size-4" />
          Payroll runs
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">New payroll run</h1>
        <p className="text-body-sm text-text-secondary">
          Builds a draft. Processing it later posts the journal entry and marks everyone paid.
        </p>
      </div>

      <Card className="grid gap-md p-lg sm:grid-cols-3">
        <Input
          label="Pay period"
          type="month"
          value={month}
          onChange={(e) => {
            if (e.target.value) {
              setMonth(e.target.value);
              setPayDate(null);
            }
          }}
          hint={period.payPeriod}
        />
        <DateField
          label="Pay date"
          value={effectivePayDate}
          onChange={setPayDate}
          hint={
            effectivePayDate > isoToday()
              ? 'In the future — the entry is dated then, so reports up to today will not include it yet.'
              : 'The journal entry is dated this day.'
          }
        />
        <div>
          <p className="text-label-md text-text-secondary">Period</p>
          <p className="mt-sm text-body-md text-text-primary">
            {period.periodStart} → {period.periodEnd}
          </p>
        </div>
      </Card>

      {mixedFrequency && (
        <div className="flex items-start gap-sm rounded-md bg-info-light p-md">
          <Info className="mt-[2px] size-4 shrink-0 text-info" />
          <p className="text-body-sm text-text-primary">
            Some salaried employees are paid weekly or every two weeks. A run pays each of them
            ONE period’s salary — create a run per pay period for them.
          </p>
        </div>
      )}

      <Card className="p-lg">
        {query.isLoading ? (
          <div className="h-24 animate-pulse rounded-md bg-neutral-100" />
        ) : active.length === 0 ? (
          <div className="py-lg text-center">
            <Users className="mx-auto size-8 text-text-tertiary" />
            <p className="mt-sm text-body-md text-text-secondary">No active employees to pay.</p>
            <Button asChild className="mt-md">
              <Link to="/employees/new">Add an employee</Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-light">
                  <th className="py-xs text-left text-overline text-text-secondary">Employee</th>
                  <th className="py-xs text-right text-overline text-text-secondary">Hours</th>
                  <th className="py-xs text-right text-overline text-text-secondary">Gross</th>
                  <th className="py-xs text-right text-overline text-text-secondary">Deduction</th>
                  <th className="py-xs text-right text-overline text-text-secondary">Net</th>
                </tr>
              </thead>
              <tbody>
                {active.map((e) => {
                  const on = !excluded.has(e.id);
                  const pay = periodPay(e, hoursFor(e));
                  return (
                    <tr key={e.id} className="border-b border-border-light last:border-0">
                      <td className="py-sm">
                        <label className="flex cursor-pointer items-center gap-sm">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={on}
                            onChange={() =>
                              setExcluded((s) => {
                                const next = new Set(s);
                                if (next.has(e.id)) next.delete(e.id);
                                else next.add(e.id);
                                return next;
                              })
                            }
                          />
                          <span>
                            <span className="block text-label-md text-text-primary">{fullName(e)}</span>
                            <span className="block text-caption text-text-tertiary">
                              {e.payType === 'hourly' ? `${formatMoney(e.hourlyRate)} / hour` : `${formatMoney(e.salary)} / year`}
                            </span>
                          </span>
                        </label>
                      </td>
                      <td className="py-sm text-right">
                        {e.payType === 'hourly' ? (
                          <input
                            aria-label={`Hours for ${fullName(e)}`}
                            value={hours[e.id] ?? String(DEFAULT_HOURS)}
                            onChange={(ev) => setHours((h) => ({ ...h, [e.id]: ev.target.value }))}
                            inputMode="decimal"
                            disabled={!on}
                            className="h-9 w-20 rounded-md border border-border bg-surface px-xs text-right text-body-sm tabular outline-none focus:border-primary"
                          />
                        ) : (
                          <span className="text-caption text-text-tertiary">Salaried</span>
                        )}
                      </td>
                      <td className="py-sm text-right text-body-sm tabular">{on ? formatMoney(pay.gross.toDecimalPlaces(2)) : '—'}</td>
                      <td className="py-sm text-right text-body-sm tabular">{on ? formatMoney(pay.deductions) : '—'}</td>
                      <td className="py-sm text-right text-label-md tabular text-text-primary">
                        {on ? formatMoney(pay.net.toDecimalPlaces(2)) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td className="py-sm text-label-md text-text-secondary">
                    {included.length} of {active.length} employees
                  </td>
                  <td />
                  <td className="py-sm text-right text-label-md tabular">{formatMoney(totals.gross.toDecimalPlaces(2))}</td>
                  <td className="py-sm text-right text-label-md tabular">{formatMoney(totals.deductions)}</td>
                  <td className="py-sm text-right text-h4 tabular text-text-primary">{formatMoney(totals.net.toDecimalPlaces(2))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {negativeNet && (
        <p className="rounded-md border border-danger bg-danger-lighter p-md text-body-sm text-text-primary">
          Someone’s deduction is more than their pay for these hours. Fix their hours or their
          deduction before building the run.
        </p>
      )}

      <div className="flex justify-end gap-sm pb-xl">
        <Button asChild variant="secondary">
          <Link to="/payroll/runs">Cancel</Link>
        </Button>
        <Button
          disabled={save.isPending || included.length === 0 || badHours || negativeNet}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Building…' : 'Build draft run'}
        </Button>
      </div>
    </div>
  );
}
