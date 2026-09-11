import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, FileText, Loader2, PlayCircle, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { invalidatePayroll } from '@/features/payroll/invalidatePayroll';
import { KpiTile } from '@/features/reports/KpiTile';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useFeature } from '@/hooks/useCapability';
import { RUN_STATUS_LABEL, runActions } from '@/models/payroll';
import { formatReportDate } from '@/models/reportPeriod';
import {
  deletePayrollRun,
  getPayrollRun,
  getPayslipPdfUrl,
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
  const [confirm, setConfirm] = useState<'process' | 'delete' | null>(null);
  const [openingSlip, setOpeningSlip] = useState<string | null>(null);

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

  const openPayslip = async (employeeId: string) => {
    setOpeningSlip(employeeId);
    try {
      // The route needs the Authorization header, so the PDF is fetched here
      // and handed to the browser as an object URL.
      const url = await getPayslipPdfUrl(runId, employeeId);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error('Could not open the payslip', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setOpeningSlip(null);
    }
  };

  if (!enabled) {
    return <FeatureUnavailable icon={Wallet} title="Payroll" body="Payroll is not included in your company’s plan." />;
  }
  if (query.isLoading) return <p className="text-body-sm text-text-secondary">Loading payroll run…</p>;

  const run = query.data;
  if (!run) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Payroll run not found</p>
        <p className="mt-xxs text-body-sm text-text-secondary">{query.error?.message ?? 'It may have been deleted.'}</p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/payroll/runs">Back to payroll runs</Link>
        </Button>
      </Card>
    );
  }

  const actions = runActions(run);
  const hasDeductions = run.totalDeductions > 0;

  return (
    <div className="flex flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/payroll/runs">
          <ArrowLeft className="size-4" />
          Payroll runs
        </Link>
      </Button>

      <Card className="p-lg">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <div className="flex flex-wrap items-center gap-sm">
              <h1 className="text-h2 text-text-primary">{run.payPeriod}</h1>
              <StatusBadge status={run.status} label={RUN_STATUS_LABEL[run.status]} />
            </div>
            <p className="text-body-sm text-text-secondary">
              {formatReportDate(run.periodStart)} – {formatReportDate(run.periodEnd)} · paid on{' '}
              {formatReportDate(run.payDate)}
            </p>
          </div>
          <div className="flex flex-wrap gap-xs">
            {actions.remove && (
              <Button variant="text" onClick={() => setConfirm('delete')}>
                <Trash2 className="size-4" />
                Delete draft
              </Button>
            )}
            {actions.process && (
              <Button onClick={() => setConfirm('process')}>
                <PlayCircle className="size-4" />
                Process payroll
              </Button>
            )}
            {run.journalEntryId && (
              <Button asChild variant="secondary">
                <Link to={`/journal-entries/${run.journalEntryId}`}>
                  <BookOpen className="size-4" />
                  Journal entry
                </Link>
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-md sm:grid-cols-3">
        <KpiTile label="Gross wages" value={run.totalGross} hint="Salary Expense (6200)" />
        <KpiTile label="Deductions withheld" value={run.totalDeductions} hint="Payroll Liabilities (2310)" />
        <KpiTile label="Net pay" value={run.totalNet} hint="Paid from Cash (1000)" />
      </div>

      <Card className="p-lg">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border-light">
                <th className="py-xs text-left text-overline text-text-secondary">Employee</th>
                <th className="py-xs text-right text-overline text-text-secondary">Hours</th>
                <th className="py-xs text-right text-overline text-text-secondary">Gross</th>
                <th className="py-xs text-right text-overline text-text-secondary">Deductions</th>
                <th className="py-xs text-right text-overline text-text-secondary">Net pay</th>
                {actions.payslips && <th className="py-xs" />}
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
                    <td className="py-sm text-right">
                      <Button
                        variant="text"
                        size="sm"
                        disabled={openingSlip === i.employeeId}
                        onClick={() => openPayslip(i.employeeId)}
                      >
                        {openingSlip === i.employeeId ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <FileText className="size-4" />
                        )}
                        Payslip
                      </Button>
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
