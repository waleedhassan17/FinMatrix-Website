import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Pencil, PiggyBank, Trash2 } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { MoreActionsMenu, PageHeader } from '@/components/layout/PageHeader';
import { DetailPageSkeleton, PageMessage } from '@/components/layout/PageState';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { VsActualChart } from '@/features/budgets/VsActualChart';
import { reportPdfBlob } from '@/features/documents/documentPdf';
import { budgetVsActualDocument } from '@/features/documents/operationsDocuments';
import { useDocumentCompany } from '@/features/documents/useDocumentContext';
import { KpiTile } from '@/features/reports/KpiTile';
import { DocumentActions } from '@/features/share/DocumentActions';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useFeature } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import {
  MONTHS_SHORT,
  favourableVariance,
  isRevenueType,
  varianceLabel,
  varianceTone,
  type VsActualRow,
} from '@/models/budget';
import { deleteBudget, getBudget, getBudgetVsActual } from '@/networks/payroll/budgetNetwork';
import { formatMoney } from '@/utils/money';

const TONE_CLASS = {
  favourable: 'text-success',
  unfavourable: 'text-danger',
  on_budget: 'text-text-secondary',
} as const;

const TONE_WORD = {
  favourable: 'Favourable',
  unfavourable: 'Unfavourable',
  on_budget: 'On budget',
} as const;

/**
 * A budget against what actually posted. Owner only.
 *
 * Actuals are the accounts' general-ledger movement for the fiscal year, read
 * by the server — so this page moves the moment anything posts.
 */
export default function BudgetDetailPage() {
  const { budgetId = '' } = useParams<{ budgetId: string }>();
  const enabled = useFeature('budgets');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const company = useDocumentCompany();
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const budget = useQuery({ queryKey: ['budgets', budgetId], queryFn: () => getBudget(budgetId), enabled });
  const vs = useQuery({
    queryKey: ['budgets', budgetId, 'vs-actual'],
    queryFn: () => getBudgetVsActual(budgetId),
    enabled,
  });

  const remove = useMutation({
    mutationFn: () => deleteBudget(budgetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Budget deleted');
      navigate('/budgets', { replace: true });
    },
    onError: (e: Error) => toast.error('Could not delete', { description: e.message }),
  });

  const { revenueRows, expenseRows } = useMemo(() => {
    const rows = vs.data?.rows ?? [];
    return {
      revenueRows: rows.filter((r) => isRevenueType(r.accountType)),
      expenseRows: rows.filter((r) => !isRevenueType(r.accountType)),
    };
  }, [vs.data]);

  const printable = useMemo(
    () => (budget.data && vs.data ? budgetVsActualDocument(budget.data, vs.data.rows, company) : null),
    [budget.data, vs.data, company],
  );

  if (!enabled) {
    return <FeatureUnavailable icon={PiggyBank} title="Budgets" body="Budgets are not included in your company’s plan." />;
  }
  if (budget.isLoading) return <DetailPageSkeleton rail={false} />;

  const b = budget.data;
  if (!b) {
    return (
      <PageMessage
        tone={budget.isError ? 'error' : 'notFound'}
        title={budget.isError ? 'This budget could not be loaded' : 'Budget not found'}
        description={budget.error?.message ?? 'It may have been deleted.'}
        onRetry={budget.isError ? () => budget.refetch() : undefined}
        backTo="/budgets"
        backLabel="Back to budgets"
      />
    );
  }

  // Totals kept apart by type: the server's single total adds revenue and
  // spending together, which is not a figure anyone can act on.
  const sum = (rows: VsActualRow[], key: 'budgeted' | 'actual') => rows.reduce((s, r) => s + r[key], 0);
  const revenueBudget = sum(revenueRows, 'budgeted');
  const revenueActual = sum(revenueRows, 'actual');
  const spendBudget = sum(expenseRows, 'budgeted');
  const spendActual = sum(expenseRows, 'actual');

  const toggle = (id: string) =>
    setOpenRows((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        back={{ to: '/budgets', label: 'Budgets' }}
        title={b.name}
        status={<StatusBadge status={b.status} />}
        meta={[
          `Fiscal year ${b.fiscalYear}`,
          `${b.lines.length} ${b.lines.length === 1 ? 'account' : 'accounts'}`,
        ]}
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link to={`/budgets/${b.id}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
            {printable && (
              <DocumentActions
                document={printable.share}
                getPdf={() => reportPdfBlob(printable.pdf)}
                cacheKey={[b.id, vs.dataUpdatedAt, budget.dataUpdatedAt, company.name, company.logo].join('|')}
              />
            )}
            <MoreActionsMenu
              actions={[
                { label: 'Delete budget', icon: Trash2, destructive: true, onSelect: () => setConfirmDelete(true) },
              ]}
            />
          </>
        }
      />

      <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Revenue budgeted" value={revenueBudget} loading={vs.isLoading} />
        <KpiTile
          label="Revenue actual"
          value={revenueActual}
          hint={revenueBudget > 0 ? `${((revenueActual / revenueBudget) * 100).toFixed(1)}% of target` : undefined}
          loading={vs.isLoading}
        />
        <KpiTile label="Spending budgeted" value={spendBudget} loading={vs.isLoading} />
        <KpiTile
          label="Spending actual"
          value={spendActual}
          hint={spendBudget > 0 ? `${((spendActual / spendBudget) * 100).toFixed(1)}% of budget used` : undefined}
          loading={vs.isLoading}
        />
      </div>

      {vs.error && (
        <Card className="p-lg">
          <p className="text-body-sm text-danger">{vs.error.message}</p>
        </Card>
      )}

      {(revenueRows.length > 0 || expenseRows.length > 0) && (
        <Card className="grid gap-xl p-lg lg:grid-cols-2">
          <VsActualChart title="Revenue against target" rows={revenueRows} />
          <VsActualChart title="Spending against budget" rows={expenseRows} />
        </Card>
      )}

      {/* The table is the chart's accessible twin: every value, every month. */}
      <Card className="p-lg">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border-light">
                <th className="py-xs text-left text-overline text-text-secondary">Account</th>
                <th className="py-xs text-right text-overline text-text-secondary">Budget</th>
                <th className="py-xs text-right text-overline text-text-secondary">Actual</th>
                <th className="py-xs text-right text-overline text-text-secondary">Variance</th>
                <th className="py-xs text-right text-overline text-text-secondary">Used</th>
              </tr>
            </thead>
            <tbody>
              {vs.isLoading && (
                <tr>
                  <td colSpan={5} className="py-md">
                    <div className="h-10 animate-pulse rounded-md bg-neutral-100" />
                  </td>
                </tr>
              )}
              {(vs.data?.rows ?? []).map((r) => {
                const tone = varianceTone(r);
                const open = openRows.has(r.accountId);
                return (
                  <Fragment key={r.accountId}>
                    <tr
                      className="cursor-pointer border-b border-border-light hover:bg-surface-hover"
                      onClick={() => toggle(r.accountId)}
                    >
                      <td className="py-sm">
                        <span className="flex items-center gap-xs">
                          {open ? <ChevronDown className="size-4 text-text-tertiary" /> : <ChevronRight className="size-4 text-text-tertiary" />}
                          <span>
                            <span className="block text-label-md text-text-primary">
                              {r.accountCode} · {r.accountName}
                            </span>
                            <span className="block text-caption text-text-tertiary">
                              {isRevenueType(r.accountType) ? 'Revenue' : 'Expense'}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="py-sm text-right text-body-sm tabular">{formatMoney(r.budgeted)}</td>
                      <td className="py-sm text-right text-body-sm tabular">{formatMoney(r.actual)}</td>
                      <td className="py-sm text-right">
                        <span className={cn('block text-label-md tabular', TONE_CLASS[tone])}>
                          {formatMoney(favourableVariance(r).toNumber())}
                        </span>
                        <span className="block text-caption text-text-tertiary">
                          {tone === 'on_budget'
                            ? TONE_WORD[tone]
                            : `${TONE_WORD[tone]} · ${varianceLabel(r, formatMoney)}`}
                        </span>
                      </td>
                      <td className="py-sm text-right text-body-sm tabular">{r.percentUsed}%</td>
                    </tr>
                    {open && (
                      <tr className="border-b border-border-light bg-surface-2">
                        <td colSpan={5} className="px-sm py-sm">
                          <div className="grid grid-cols-3 gap-xs sm:grid-cols-6 lg:grid-cols-12">
                            {r.months.map((m) => (
                              <div key={m.month} className="rounded-sm bg-surface px-xs py-xxs">
                                <p className="text-caption text-text-secondary">{MONTHS_SHORT[m.month - 1]}</p>
                                <p className="text-caption tabular text-text-primary">{formatMoney(m.actual)}</p>
                                <p className="text-caption tabular text-text-tertiary">of {formatMoney(m.budgeted)}</p>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-md text-caption text-text-tertiary">
          Variance is shown so that positive is good: revenue above target, or spending under budget.
        </p>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this budget?"
        description="The budget and its lines are removed. Nothing in the books changes — budgets post nothing."
        confirmLabel="Delete budget"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
