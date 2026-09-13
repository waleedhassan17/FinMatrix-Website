import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { ClipboardList, Plus, Users, Wallet } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatTile } from '@/components/ui/StatTile';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { KpiTile } from '@/features/reports/KpiTile';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useFeature } from '@/hooks/useCapability';
import { RUN_STATUS_LABEL, type PayrollRun } from '@/models/payroll';
import { formatReportDate } from '@/models/reportPeriod';
import { getPayrollRuns } from '@/networks/payroll/payrollNetwork';
import { formatMoney } from '@/utils/money';

const columnHelper = createColumnHelper<PayrollRun>();

/** Payroll runs, newest pay date first. Owner only. */
export default function PayrollRunListPage() {
  const enabled = useFeature('payroll');
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ['payroll', 'runs', 'list'],
    queryFn: getPayrollRuns,
    enabled,
  });
  const runs = useMemo(() => query.data ?? [], [query.data]);

  const year = String(new Date().getFullYear());
  const paidThisYear = runs
    .filter((r) => r.status === 'paid' && r.payDate.startsWith(year))
    .reduce((s, r) => s + r.totalGross, 0);
  const drafts = runs.filter((r) => r.status === 'draft').length;
  const lastPaid = runs.find((r) => r.status === 'paid');

  const columns = useMemo(
    () => [
      columnHelper.accessor('payPeriod', {
        header: 'Pay period',
        cell: (c) => (
          <div>
            <p className="text-label-md text-text-primary">{c.getValue()}</p>
            <p className="text-caption text-text-tertiary">
              {formatReportDate(c.row.original.periodStart)} – {formatReportDate(c.row.original.periodEnd)}
            </p>
          </div>
        ),
      }),
      columnHelper.accessor('payDate', {
        header: 'Pay date',
        cell: (c) => formatReportDate(c.getValue()),
      }),
      columnHelper.accessor('totalGross', {
        header: 'Gross',
        meta: { align: 'right' },
        cell: (c) => <span className="tabular">{formatMoney(c.getValue())}</span>,
      }),
      columnHelper.accessor('totalDeductions', {
        header: 'Deductions',
        meta: { align: 'right' },
        cell: (c) => <span className="tabular">{formatMoney(c.getValue())}</span>,
      }),
      columnHelper.accessor('totalNet', {
        header: 'Net pay',
        meta: { align: 'right' },
        cell: (c) => <span className="tabular text-label-md text-text-primary">{formatMoney(c.getValue())}</span>,
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (c) => <StatusBadge status={c.getValue()} label={RUN_STATUS_LABEL[c.getValue()]} />,
      }),
    ],
    [],
  ) as never;

  if (!enabled) {
    return <FeatureUnavailable icon={Wallet} title="Payroll" body="Payroll is not included in your company’s plan." />;
  }

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        title="Payroll runs"
        description="Build a run as a draft, check each employee’s pay, then process it to post the payroll journal entry."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to="/employees">
                <Users className="size-4" />
                Employees
              </Link>
            </Button>
            <Button asChild>
              <Link to="/payroll/runs/new">
                <Plus className="size-4" />
                New payroll run
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-md sm:grid-cols-3">
        <KpiTile label={`Gross paid in ${year}`} value={paidThisYear} loading={query.isLoading} />
        <StatTile
          label="Drafts waiting"
          value={String(drafts)}
          tone={drafts > 0 ? 'warning' : 'default'}
          hint="Built but not yet processed"
          loading={query.isLoading}
        />
        <StatTile
          label="Last paid"
          value={lastPaid ? lastPaid.payPeriod : '—'}
          hint={lastPaid ? `Paid ${formatReportDate(lastPaid.payDate)}` : undefined}
          loading={query.isLoading}
        />
      </div>

      {query.error && (
        <Card className="p-lg">
          <p className="text-body-sm text-danger">{query.error.message}</p>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={runs}
        isLoading={query.isLoading}
        onRowClick={(r) => navigate(`/payroll/runs/${r.id}`)}
        empty={
          <div className="py-xl text-center">
            <ClipboardList className="mx-auto size-8 text-text-tertiary" />
            <p className="mt-sm text-body-md text-text-secondary">No payroll runs yet.</p>
          </div>
        }
      />
    </div>
  );
}
