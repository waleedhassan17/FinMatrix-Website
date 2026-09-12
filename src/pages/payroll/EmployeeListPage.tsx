import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { ClipboardList, Plus, Users, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatTile } from '@/components/ui/StatTile';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { KpiTile } from '@/features/reports/KpiTile';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useFeature } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import {
  PAY_FREQUENCY_OPTIONS,
  fullName,
  periodGross,
  type Employee,
  type EmployeeStatus,
} from '@/models/payroll';
import { getEmployees } from '@/networks/payroll/payrollNetwork';
import { formatMoney } from '@/utils/money';

type Filter = EmployeeStatus | 'all';

const FILTERS: Array<[Filter, string]> = [
  ['active', 'Active'],
  ['inactive', 'Inactive'],
  ['terminated', 'Terminated'],
  ['all', 'All'],
];

const FREQUENCY_LABEL = Object.fromEntries(PAY_FREQUENCY_OPTIONS.map((o) => [o.value, o.label]));

const columnHelper = createColumnHelper<Employee>();

/** The people on payroll. Owner only. */
export default function EmployeeListPage() {
  const enabled = useFeature('payroll');
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['employees', 'list'],
    queryFn: () => getEmployees(),
    enabled,
  });
  const employees = useMemo(() => query.data ?? [], [query.data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees
      .filter((e) => filter === 'all' || e.status === filter)
      .filter(
        (e) =>
          !q ||
          fullName(e).toLowerCase().includes(q) ||
          e.department.toLowerCase().includes(q) ||
          e.position.toLowerCase().includes(q),
      );
  }, [employees, filter, search]);

  const active = employees.filter((e) => e.status === 'active');
  const annualSalaries = active
    .filter((e) => e.payType === 'salary')
    .reduce((s, e) => s + e.salary, 0);

  const columns = useMemo(
    () => [
      columnHelper.accessor((e) => fullName(e), {
        id: 'name',
        header: 'Employee',
        cell: (c) => (
          <div className="min-w-0">
            <p className="text-label-md text-text-primary">{c.getValue()}</p>
            {c.row.original.email && (
              <p className="text-caption text-text-tertiary">{c.row.original.email}</p>
            )}
          </div>
        ),
      }),
      columnHelper.accessor('department', {
        header: 'Role',
        cell: (c) =>
          [c.row.original.position, c.getValue()].filter(Boolean).join(' · ') || '—',
      }),
      columnHelper.accessor('payType', {
        header: 'Pay',
        cell: (c) => {
          const e = c.row.original;
          return e.payType === 'hourly' ? (
            <span className="tabular">{formatMoney(e.hourlyRate)} / hour</span>
          ) : (
            <div>
              <p className="tabular">{formatMoney(e.salary)} / year</p>
              <p className="text-caption text-text-tertiary">
                Paid {(FREQUENCY_LABEL[e.payFrequency] ?? e.payFrequency).toLowerCase()}
              </p>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'gross',
        header: 'Gross per period',
        meta: { align: 'right' },
        cell: (c) => (
          <div>
            <p className="tabular text-label-md text-text-primary">
              {formatMoney(periodGross(c.row.original).toDecimalPlaces(2))}
            </p>
            {c.row.original.payType === 'hourly' && (
              <p className="text-caption text-text-tertiary">at 160 hours</p>
            )}
          </div>
        ),
      }),
      columnHelper.accessor('deductionAmount', {
        header: 'Deduction',
        meta: { align: 'right' },
        cell: (c) => <span className="tabular">{c.getValue() ? formatMoney(c.getValue()) : '—'}</span>,
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (c) => <StatusBadge status={c.getValue()} />,
      }),
    ],
    [],
  ) as never;

  if (!enabled) {
    return (
      <FeatureUnavailable
        icon={Wallet}
        title="Payroll"
        body="Payroll is not included in your company’s plan."
      />
    );
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h1 className="text-h2 text-text-primary">Employees</h1>
          <p className="text-body-sm text-text-secondary">
            Who you pay, how much, and what is withheld each period.
          </p>
        </div>
        <div className="flex flex-wrap gap-xs">
          <Button asChild variant="secondary">
            <Link to="/payroll/runs">
              <ClipboardList className="size-4" />
              Payroll runs
            </Link>
          </Button>
          <Button asChild>
            <Link to="/employees/new">
              <Plus className="size-4" />
              New employee
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-md sm:grid-cols-3">
        <StatTile label="Active employees" value={String(active.length)} loading={query.isLoading} />
        <KpiTile
          label="Annual salaries"
          value={annualSalaries}
          hint="Salaried staff, before deductions"
          loading={query.isLoading}
        />
        <StatTile
          label="Hourly staff"
          value={String(active.filter((e) => e.payType === 'hourly').length)}
          hint="Paid by the hours on each run"
          loading={query.isLoading}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-md">
        <div className="flex flex-wrap gap-xs">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                'rounded-full px-md py-xs text-label-md transition-colors',
                filter === value
                  ? 'bg-primary text-text-inverse'
                  : 'bg-surface-2 text-text-secondary hover:text-text-primary',
              )}
            >
              {label}
              <span className="ml-xxs tabular opacity-70">
                {value === 'all' ? employees.length : employees.filter((e) => e.status === value).length}
              </span>
            </button>
          ))}
        </div>
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Name, department or position…"
          aria-label="Search employees"
          containerClassName="w-72 max-w-full"
        />
      </div>

      {query.error && (
        <Card className="p-lg">
          <p className="text-body-sm text-danger">{query.error.message}</p>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={rows}
        isLoading={query.isLoading}
        onRowClick={(e) => navigate(`/employees/${e.id}/edit`)}
        empty={
          <div className="py-xl text-center">
            <Users className="mx-auto size-8 text-text-tertiary" />
            <p className="mt-sm text-body-md text-text-secondary">
              {employees.length === 0 ? 'No employees yet.' : 'No employees match.'}
            </p>
            {employees.length === 0 && (
              <Button asChild className="mt-lg">
                <Link to="/employees/new">
                  <Plus className="size-4" />
                  New employee
                </Link>
              </Button>
            )}
          </div>
        }
      />
    </div>
  );
}
