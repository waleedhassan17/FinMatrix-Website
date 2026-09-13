import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Lock, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { MoreActionsMenu, PageHeader } from '@/components/layout/PageHeader';
import { DetailPageSkeleton, PageMessage } from '@/components/layout/PageState';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { reportPdfBlob } from '@/features/documents/documentPdf';
import { reconciliationDocument } from '@/features/documents/operationsDocuments';
import { useDocumentCompany } from '@/features/documents/useDocumentContext';
import { DocumentActions } from '@/features/share/DocumentActions';
import { useFeature } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { isLatestForAccount, sourceTypeLabel, type ReconEntry } from '@/models/reconciliation';
import { formatReportDate } from '@/models/reportPeriod';
import {
  getReconcilableAccounts,
  getReconciliationById,
  getReconciliations,
  undoReconciliation,
} from '@/networks/accounting/reconciliationNetwork';
import { formatMoney } from '@/utils/money';

/**
 * The reconciliation report: what the statement said, what cleared, what is
 * still outstanding, and the proof that the difference was zero.
 */
export default function ReconciliationDetailPage() {
  const { reconciliationId = '' } = useParams<{ reconciliationId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const enabled = useFeature('bankReconciliation');
  const company = useDocumentCompany();
  const [undoOpen, setUndoOpen] = useState(false);

  const detail = useQuery({
    queryKey: ['reconciliations', reconciliationId],
    queryFn: () => getReconciliationById(reconciliationId),
    enabled,
  });

  const accounts = useQuery({
    queryKey: ['reconciliations', 'accounts'],
    queryFn: getReconcilableAccounts,
    enabled,
  });

  const history = useQuery({
    queryKey: ['reconciliations', 'list'],
    queryFn: () => getReconciliations(),
    enabled,
  });

  const undo = useMutation({
    mutationFn: () => undoReconciliation(reconciliationId),
    onSuccess: () => {
      setUndoOpen(false);
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
      toast.success('Reconciliation undone', {
        description: 'Its transactions are unlocked and can be reconciled again.',
      });
      navigate('/reconciliations', { replace: true });
    },
    onError: (e: Error) => toast.error('Could not undo', { description: e.message }),
  });

  const account = (accounts.data ?? []).find((a) => a.accountId === detail.data?.accountId);
  const accountLabel = account ? `${account.accountNumber} · ${account.name}` : '';

  const printable = useMemo(
    () =>
      detail.data
        ? reconciliationDocument(detail.data, accountLabel || 'Bank account', company)
        : null,
    [detail.data, accountLabel, company],
  );

  if (!enabled) {
    return (
      <Card className="mx-auto max-w-[32rem] p-xxl text-center">
        <p className="text-body-md text-text-secondary">
          Bank reconciliation is not included in your company’s plan.
        </p>
      </Card>
    );
  }

  if (detail.isLoading) return <DetailPageSkeleton rail={false} />;

  if (detail.error || !detail.data) {
    return (
      <PageMessage
        tone={detail.error ? 'error' : 'notFound'}
        title={detail.error ? 'This reconciliation could not be loaded' : 'Reconciliation not found'}
        description={detail.error?.message ?? 'It may have been undone.'}
        onRetry={detail.error ? () => detail.refetch() : undefined}
        backTo="/reconciliations"
        backLabel="Back to bank reconciliation"
      />
    );
  }

  const r = detail.data;
  // Only the account's most recent reconciliation can be undone; offering the
  // button on an older one would only produce the server's refusal.
  const canUndo = history.data ? isLatestForAccount(r, history.data) : false;
  const balanced = Math.abs(r.difference) < 0.005;

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        back={{ to: '/reconciliations', label: 'Bank reconciliation' }}
        title={accountLabel || 'Reconciliation'}
        status={<StatusBadge status={r.status} />}
        meta={[
          `Statement dated ${formatReportDate(r.statementDate)}`,
          r.reconciledAt ? `Reconciled ${formatReportDate(r.reconciledAt.slice(0, 10))}` : null,
        ]}
        actions={
          <>
            {printable && (
              <DocumentActions
                document={printable.share}
                getPdf={() => reportPdfBlob(printable.pdf)}
                cacheKey={[r.id, detail.dataUpdatedAt, accountLabel, company.name, company.logo].join('|')}
              />
            )}
            <MoreActionsMenu
              actions={[
                {
                  label: 'Undo reconciliation',
                  icon: Undo2,
                  destructive: true,
                  hidden: !canUndo,
                  onSelect: () => setUndoOpen(true),
                },
              ]}
            />
          </>
        }
      />

      <Card className="grid gap-md p-lg sm:grid-cols-4">
        <Figure label="Beginning balance" value={formatMoney(r.beginningBalance)} />
        <Figure label="Statement ending balance" value={formatMoney(r.statementEndingBalance)} />
        <Figure label="Cleared balance" value={formatMoney(r.clearedBalance)} />
        <div className={cn('rounded-md p-sm', balanced ? 'bg-success-lighter' : 'bg-danger-lighter')}>
          <p className="text-caption text-text-secondary">Difference</p>
          <p className={cn('mt-xxs text-h3 tabular', balanced ? 'text-success' : 'text-danger')}>
            {formatMoney(r.difference)}
          </p>
        </div>
      </Card>

      <div className="flex items-start gap-sm rounded-md bg-surface-2 p-md">
        <Lock className="mt-[2px] size-4 shrink-0 text-text-secondary" />
        <p className="text-body-sm text-text-secondary">
          The {r.clearedCount} transaction{r.clearedCount === 1 ? '' : 's'} below{' '}
          {r.clearedCount === 1 ? 'is' : 'are'} locked. The documents behind them can’t be
          voided or deleted until this reconciliation is undone — altering one would
          break every later statement’s beginning balance.
        </p>
      </div>

      <EntryTable
        title={`Cleared (${r.entries.length})`}
        icon={<CheckCircle2 className="size-4 text-success" />}
        entries={r.entries}
        empty="Nothing was cleared — the statement matched the carried-in balance."
      />

      <EntryTable
        title={`Outstanding (${r.outstanding.length})`}
        entries={r.outstanding}
        total={r.outstandingTotal}
        empty="No outstanding items — every book transaction up to the statement date cleared."
        note="Book transactions dated on or before the statement that it did not include. They explain the gap between book and bank, and carry forward to the next statement."
      />

      {r.notes && (
        <Card className="p-lg">
          <p className="text-caption text-text-secondary">Notes</p>
          <p className="mt-xxs whitespace-pre-wrap text-body-md text-text-primary">{r.notes}</p>
        </Card>
      )}

      <ConfirmDialog
        open={undoOpen}
        onOpenChange={setUndoOpen}
        title="Undo this reconciliation?"
        description="Its transactions are unlocked and return to the unreconciled list. Nothing in the ledger changes — reconciling never posted anything. The undo is recorded in the audit trail."
        confirmLabel="Undo reconciliation"
        destructive
        busy={undo.isPending}
        onConfirm={() => undo.mutate()}
      />
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-sm">
      <p className="text-caption text-text-secondary">{label}</p>
      <p className="mt-xxs text-h3 tabular text-text-primary">{value}</p>
    </div>
  );
}

function EntryTable({
  title,
  icon,
  entries,
  total,
  empty,
  note,
}: {
  title: string;
  icon?: React.ReactNode;
  entries: ReconEntry[];
  total?: number;
  empty: string;
  note?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border-light px-lg py-md">
        <h2 className="flex items-center gap-xs text-label-lg text-text-primary">
          {icon}
          {title}
        </h2>
        {note && <p className="mt-xxs text-caption text-text-tertiary">{note}</p>}
      </div>
      {entries.length === 0 ? (
        <p className="p-lg text-center text-body-sm text-text-tertiary">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="px-md py-sm text-left text-overline text-text-secondary">Date</th>
                <th className="px-md py-sm text-left text-overline text-text-secondary">Reference</th>
                <th className="px-md py-sm text-left text-overline text-text-secondary">From</th>
                <th className="px-md py-sm text-right text-overline text-text-secondary">Deposit</th>
                <th className="px-md py-sm text-right text-overline text-text-secondary">Payment</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border-light last:border-0">
                  <td className="whitespace-nowrap px-md py-sm text-body-sm text-text-primary">
                    {formatReportDate(e.date)}
                  </td>
                  <td className="px-md py-sm">
                    <p className="text-body-sm text-text-primary">{e.reference || '—'}</p>
                    {e.memo && <p className="text-caption text-text-tertiary">{e.memo}</p>}
                  </td>
                  <td className="px-md py-sm text-body-sm text-text-secondary">
                    {sourceTypeLabel(e.sourceType)}
                  </td>
                  <td className="px-md py-sm text-right text-body-sm tabular text-text-primary">
                    {e.amount >= 0 ? formatMoney(e.amount) : '—'}
                  </td>
                  <td className="px-md py-sm text-right text-body-sm tabular text-text-primary">
                    {e.amount < 0 ? formatMoney(-e.amount) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            {total !== undefined && (
              <tfoot>
                <tr className="border-t border-border">
                  <td colSpan={3} className="px-md py-sm text-label-md text-text-primary">
                    Net outstanding
                  </td>
                  <td colSpan={2} className="px-md py-sm text-right text-label-lg tabular text-text-primary">
                    {formatMoney(total)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </Card>
  );
}
