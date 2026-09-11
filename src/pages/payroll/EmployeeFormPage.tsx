import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trash2, Wallet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DateField } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { invalidatePayroll } from '@/features/payroll/invalidatePayroll';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useFeature } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { isoToday } from '@/models/document';
import {
  DEFAULT_HOURS,
  EMPLOYEE_STATUS_OPTIONS,
  PAY_FREQUENCY_OPTIONS,
  emptyEmployeeForm,
  employeePayload,
  employeeToForm,
  fullName,
  periodPay,
  validateEmployee,
  type EmployeeForm,
  type EmployeeStatus,
  type PayFrequency,
  type PayType,
} from '@/models/payroll';
import {
  createEmployee,
  deleteEmployee,
  getEmployee,
  updateEmployee,
} from '@/networks/payroll/payrollNetwork';
import { formatMoney, toDecimal } from '@/utils/money';

type Errors = Partial<Record<keyof EmployeeForm, string>>;

const PAY_TYPES: Array<[PayType, string, string]> = [
  ['salary', 'Salaried', 'A fixed annual salary, split across pay periods'],
  ['hourly', 'Hourly', 'Paid for the hours entered on each run'],
];

/** Add or edit an employee. Owner only. */
export default function EmployeeFormPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const editing = Boolean(employeeId);
  const enabled = useFeature('payroll');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const query = useQuery({
    queryKey: ['employees', employeeId],
    queryFn: () => getEmployee(employeeId!),
    enabled: enabled && editing,
  });
  const employee = query.data;

  const [draft, setDraft] = useState<EmployeeForm | null>(null);
  const form = draft ?? (employee ? employeeToForm(employee) : emptyEmployeeForm());
  const [errors, setErrors] = useState<Errors>({});

  const patch = (p: Partial<EmployeeForm>) => {
    setDraft({ ...form, ...p });
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(p)) delete next[k as keyof EmployeeForm];
      return next;
    });
  };

  const save = useMutation({
    mutationFn: () => {
      const body = employeePayload(form, editing);
      return editing ? updateEmployee(employeeId!, body) : createEmployee(body);
    },
    onSuccess: (saved) => {
      invalidatePayroll(queryClient);
      toast.success(editing ? 'Employee updated' : 'Employee added', {
        description: `${fullName(saved)} has been saved.`,
      });
      navigate('/employees', { replace: true });
    },
    onError: (e: Error) => toast.error('Could not save the employee', { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: () => deleteEmployee(employeeId!),
    onSuccess: () => {
      invalidatePayroll(queryClient);
      toast.success('Employee deleted');
      navigate('/employees', { replace: true });
    },
    // EMPLOYEE_HAS_PAYROLL_HISTORY says to set them inactive instead — worth
    // showing verbatim.
    onError: (e: Error) => {
      setConfirmDelete(false);
      toast.error('Could not delete', { description: e.message });
    },
  });

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e = validateEmployee(form);
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate();
  };

  if (!enabled) {
    return (
      <FeatureUnavailable icon={Wallet} title="Payroll" body="Payroll is not included in your company’s plan." />
    );
  }

  if (editing && query.isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading employee…</p>;
  }

  if (editing && !employee) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Employee not found</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          {query.error?.message ?? 'They may have been deleted.'}
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/employees">Back to employees</Link>
        </Button>
      </Card>
    );
  }

  const money = (v: string) => toDecimal(v.replace(/[,\s]/g, '') || 0).toNumber();
  const preview = periodPay({
    payType: form.payType,
    salary: money(form.salary),
    hourlyRate: money(form.hourlyRate),
    payFrequency: form.payFrequency,
    deductionAmount: money(form.deductionAmount),
  });

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-3xl flex-col gap-lg" noValidate>
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/employees">
          <ArrowLeft className="size-4" />
          Employees
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h1 className="text-h2 text-text-primary">
            {editing && employee ? fullName(employee) : 'New employee'}
          </h1>
          <p className="text-body-sm text-text-secondary">
            Pay details feed every payroll run built from today on. Runs already built keep
            their figures.
          </p>
        </div>
        {editing && (
          <Button type="button" variant="text" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" />
            Delete
          </Button>
        )}
      </div>

      <Card className="p-lg">
        <SectionHeader title="Person" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Input label="First name *" value={form.firstName} onChange={(e) => patch({ firstName: e.target.value })} error={errors.firstName} />
          <Input label="Last name *" value={form.lastName} onChange={(e) => patch({ lastName: e.target.value })} error={errors.lastName} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => patch({ email: e.target.value })} error={errors.email} />
          <Input label="Phone" value={form.phone} onChange={(e) => patch({ phone: e.target.value })} inputMode="tel" />
          <Input label="Department" value={form.department} onChange={(e) => patch({ department: e.target.value })} />
          <Input label="Position" value={form.position} onChange={(e) => patch({ position: e.target.value })} />
          <DateField label="Hire date" value={form.hireDate} onChange={(v) => patch({ hireDate: v })} max={isoToday()} />
          {editing && (
            <Select
              label="Status"
              value={form.status}
              onChange={(v) => patch({ status: v as EmployeeStatus })}
              options={EMPLOYEE_STATUS_OPTIONS}
              hint="Only active employees are added to new payroll runs."
            />
          )}
        </div>
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Pay" />
        <div className="mt-md grid gap-sm sm:grid-cols-2" role="radiogroup" aria-label="Pay type">
          {PAY_TYPES.map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={form.payType === value}
              onClick={() => patch({ payType: value })}
              className={cn(
                'rounded-md border px-md py-sm text-left transition-colors',
                form.payType === value
                  ? 'border-primary bg-primary-tint'
                  : 'border-border-light hover:border-border',
              )}
            >
              <span className="block text-label-lg text-text-primary">{label}</span>
              <span className="block text-caption text-text-secondary">{hint}</span>
            </button>
          ))}
        </div>
        <div className="mt-md grid gap-md sm:grid-cols-3">
          {form.payType === 'salary' ? (
            <Input
              label="Annual salary *"
              value={form.salary}
              onChange={(e) => patch({ salary: e.target.value })}
              inputMode="decimal"
              className="tabular"
              error={errors.salary}
            />
          ) : (
            <Input
              label="Hourly rate *"
              value={form.hourlyRate}
              onChange={(e) => patch({ hourlyRate: e.target.value })}
              inputMode="decimal"
              className="tabular"
              error={errors.hourlyRate}
            />
          )}
          <Select
            label="Paid"
            value={form.payFrequency}
            onChange={(v) => patch({ payFrequency: v as PayFrequency })}
            options={PAY_FREQUENCY_OPTIONS}
          />
          <Input
            label="Deduction per period"
            value={form.deductionAmount}
            onChange={(e) => patch({ deductionAmount: e.target.value })}
            inputMode="decimal"
            className="tabular"
            placeholder="0.00"
            error={errors.deductionAmount}
            hint="Withheld tax and the like. Posts to Payroll Liabilities (2310)."
          />
        </div>

        <div className="mt-md grid grid-cols-3 gap-md rounded-md bg-surface-2 p-md">
          <PreviewFigure label="Gross per period" value={formatMoney(preview.gross.toDecimalPlaces(2))} />
          <PreviewFigure label="Deduction" value={formatMoney(preview.deductions)} />
          <PreviewFigure label="Net pay" value={formatMoney(preview.net.toDecimalPlaces(2))} strong />
          {form.payType === 'hourly' && (
            <p className="col-span-3 text-caption text-text-tertiary">
              Shown at {DEFAULT_HOURS} hours. Each run takes the hours actually worked.
            </p>
          )}
        </div>
      </Card>

      <div className="flex justify-end gap-sm pb-xl">
        <Button asChild variant="secondary">
          <Link to="/employees">Cancel</Link>
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add employee'}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this employee?"
        description="Only an employee who has never been paid can be deleted. Anyone on a payroll run is part of the books — set their status to inactive instead."
        confirmLabel="Delete employee"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </form>
  );
}

function PreviewFigure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-caption text-text-secondary">{label}</p>
      <p className={cn('tabular', strong ? 'text-h4 text-text-primary' : 'text-label-lg text-text-primary')}>
        {value}
      </p>
    </div>
  );
}
