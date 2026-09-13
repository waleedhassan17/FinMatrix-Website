import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, PlayCircle, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { MoreActionsMenu, PageHeader } from '@/components/layout/PageHeader';
import { DetailPageSkeleton, PageMessage } from '@/components/layout/PageState';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { payslipShare } from '@/features/documents/operationsDocuments';
import { useDocumentCompany } from '@/features/documents/useDocumentContext';
import { invalidatePayroll } from '@/features/payroll/invalidatePayroll';
import { KpiTile } from '@/features/reports/KpiTile';
import { DocumentActions } from '@/features/share/DocumentActions';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useFeature } from '@/hooks/useCapability';
import { RUN_STATUS_LABEL, runActions } from '@/models/payroll';
import { formatReportDate } from '@/models/reportPeriod';
import {
  deletePayrollRun,
  getPayrollRun,
  getPayslipPdf,
  processPayrollRun,
} from '@/networks/payroll/payrollNetwork';
import { formatMoney } from '@/utils/money';

/**
 * One payroll run: each employee's gross, deductions and net, and the one
 * action that matters — Process, which posts the payroll journal entry.
 */
export default function PayrollRunDetailPage() {
  const { runId = '' } = useParams<{ runId: string }>();
  const enabled = useFeature('payroll');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const company = useDocumentCompany();
  const [confirm, setConfirm] = useState<'process' | 'delete' | null>(null);

  const query = useQuery({
    queryKey: ['payroll', 'runs', runId],
    queryFn: () => getPayrollRun(runId),
    enabled,
  });

  const process = useMutation({
    mutationFn: () => processPayrollRun(runId),
    onSuccess: () => {
      invalidatePayroll(queryClient);
      setConfirm(null);
      toast.success('Payroll processed', {
        description: 'The journal entry is posted and the run is marked paid.',
      });
    },
    onError: (e: Error) => toast.error('Could not process payroll', { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: () => deletePayrollRun(runId),
    onSuccess: () => {
      invalidatePayroll(queryClient);
      toast.success('Draft run deleted');
      navigate('/payroll/runs', { replace: true });
    },
    onError: (e: Error) => toast.error('Could not delete', { description: e.message }),
  });

  if (!enabled) {
    return <FeatureUnavailable icon={Wallet} title="Payroll" body="Payroll is not included in your company’s plan." />;
  }
  if (query.isLoading) return <DetailPageSkeleton rail={false} />;

  const run = query.data;
  if (!run) {
    return (
      <PageMessage
        tone={query.isError ? 'error' : 'notFound'}
        title={query.isError ? 'This payroll run could not be loaded' : 'Payroll run not found'}
        description={query.error?.message ?? 'It may have been deleted.'}
        onRetry={query.isError ? () => query.refetch() : undefined}
        backTo="/payroll/runs"
        backLabel="Back to payroll runs"
      />
    );
  }

  const actions = runActions(run);
  const hasDeductions = run.totalDeductions > 0;

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        back={{ to: '/payroll/runs', label: 'Payroll runs' }}
        title={run.payPeriod}
        status={<StatusBadge status={run.status} label={RUN_STATUS_LABEL[run.status]} />}
        meta={[
          `${formatReportDate(run.periodStart)} – ${formatReportDate(run.periodEnd)}`,
          `Paid on ${formatReportDate(run.payDate)}`,
          `${run.items.length} ${run.items.length === 1 ? 'employee' : 'employees'}`,
        ]}
        actions={
          <>
            {run.journalEntryId && (
              <Button asChild variant="secondary" size="sm">
                <Link to={`/journal-entries/${run.journalEntryId}`}>
                  <BookOpen className="size-4" />
                  Journal entry
                </Link>
              </Button>
            )}
            {actions.process && (
              <Button size="sm" onClick={() => setConfirm('process')}>
                <PlayCircle className="size-4" />
                Process payroll
              </Button>
            )}
            <MoreActionsMenu
              actions={[
                {
                  label: 'Delete draft',
                  icon: Trash2,
                  destructive: true,
                  hidden: !actions.remove,
                  onSelect: () => setConfirm('delete'),
                },
              ]}
            />
          </>
        }
      />

      <div className="grid gap-md sm:grid-cols-3">
        <KpiTile label="Gross wages" value={run.totalGross} hint="Salary Expense (6200)" />
        <KpiTile label="Deductions withheld" value={run.totalDeductions} hint="Payroll Liabilities (2310)" />
        <KpiTile label="Net pay" value={run.totalNet} hint="Paid from Cash (1000)" />
      </div>

      <Card className="p-lg">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse">
            <thead>
              <tr className="border-b border-border-light">
                <th className="py-xs text-left text-overline text-text-secondary">Employee</th>
                <th className="py-xs text-right text-overline text-text-secondary">Hours</th>
                <th className="py-xs text-right text-overline text-text-secondary">Gross</th>
                <th className="py-xs text-right text-overline text-text-secondary">Deductions</th>
                <th className="py-xs text-right text-overline text-text-secondary">Net pay</th>
                {actions.payslips && (
                  <th className="py-xs pl-md text-right text-overline text-text-secondary">Payslip</th>
                )}
              </tr>
            </thead>
            <tbody>
              {run.items.map((i) => (
                <tr key={i.id || i.employeeId} className="border-b border-border-light last:border-0">
                  <td className="py-sm text-label-md text-text-primary">{i.employeeName || 'Employee'}</td>
                  <td className="py-sm text-right text-body-sm tabular text-text-secondary">{i.hours > 0 ? i.hours : '—'}</td>
                  <td className="py-sm text-right text-body-sm tabular">{formatMoney(i.gross)}</td>
                  <td className="py-sm text-right text-body-sm tabular">{formatMoney(i.deductions)}</td>
                  <td className="py-sm text-right text-label-md tabular text-text-primary">{formatMoney(i.net)}</td>
                  {actions.payslips && (
                    <td className="py-sm pl-md">
                      {/* The server's payslip, fetched with the session — the
                          same file whether it is printed, saved or shared. */}
                      <div className="flex justify-end">
                        <DocumentActions
                          compact
                          document={payslipShare(run, i, company.name)}
                          getPdf={() => getPayslipPdf(run.id, i.employeeId)}
                          cacheKey={`${run.id}|${i.employeeId}|${run.status}`}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!actions.payslips && (
          <p className="mt-md text-caption text-text-tertiary">
            Payslips are issued once the run is processed — their figures come from the posted entry.
          </p>
        )}
      </Card>

      <ConfirmDialog
        open={confirm === 'process'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Process payroll for ${run.payPeriod}?`}
        description={`Posts one journal entry dated ${formatReportDate(run.payDate)}: Dr Salary Expense (6200) ${formatMoney(
          run.totalGross,
        )}, Cr Cash (1000) ${formatMoney(run.totalNet)}${
          hasDeductions ? `, Cr Payroll Liabilities (2310) ${formatMoney(run.totalDeductions)}` : ''
        }. The run is marked paid and can no longer be edited or deleted.`}
        confirmLabel="Process and post"
        busy={process.isPending}
        onConfirm={() => process.mutate()}
      />

      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this draft run?"
        description="Nothing was posted for it, so deleting leaves the books unchanged."
        confirmLabel="Delete draft"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
