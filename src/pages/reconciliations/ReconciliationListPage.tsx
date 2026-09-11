import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Landmark, Lock } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useFeature } from '@/hooks/useCapability';
import type { Reconciliation } from '@/models/reconciliation';
import { formatReportDate } from '@/models/reportPeriod';
import {
  getReconcilableAccounts,
  getReconciliations,
} from '@/networks/accounting/reconciliationNetwork';
import { formatMoney } from '@/utils/money';

const columnHelper = createColumnHelper<Reconciliation & { accountLabel: string }>();

/**
 * Bank reconciliation — the accounts that can be reconciled, and every
 * reconciliation already finished.
 *
 * Owner only. Every endpoint is `@Roles('admin')`: the person who records
 * receipts and payments must not also be the one who signs off the bank against
 * them. The route is absent from the staff nav, so staff are redirected before
 * they reach here.
 */
export default function ReconciliationListPage() {
  const navigate = useNavigate();
  const enabled = useFeature('bankReconciliation');

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

  // The history spans every account, so each row has to say which one — the
  // app's history does not, which makes two banks' statements indistinguishable.
  const rows = useMemo(() => {
    const byId = new Map((accounts.data ?? []).map((a) => [a.accountId, a]));
    return (history.data ?? []).map((r) => {
      const a = byId.get(r.accountId);
      return { ...r, accountLabel: a ? `${a.accountNumber} · ${a.name}` : '—' };
    });
  }, [accounts.data, history.data]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('statementDate', {
        header: 'Statement date',
        cell: (c) => formatReportDate(c.getValue()),
      }),
      columnHelper.accessor('accountLabel', { header: 'Account' }),
      columnHelper.accessor('statementEndingBalance', {
        header: 'Ending balance',
        meta: { align: 'right' },
        cell: (c) => formatMoney(c.getValue()),
      }),
      columnHelper.accessor('clearedCount', {
        header: 'Cleared',
        meta: { align: 'right' },
        cell: (c) => c.getValue(),
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
      <Card className="mx-auto max-w-lg p-xxl text-center">
        <Landmark className="mx-auto size-8 text-text-tertiary" />
        <h1 className="mt-md text-h3 text-text-primary">Bank reconciliation</h1>
        <p className="mt-xs text-body-md text-text-secondary">
          Bank reconciliation is not included in your company’s plan.
        </p>
      </Card>
    );
  }

  const error = accounts.error ?? history.error;

  return (
    <div className="flex flex-col gap-lg">
      <div>
        <h1 className="text-h2 text-text-primary">Bank reconciliation</h1>
        <p className="text-body-sm text-text-secondary">
          Match your Cash and Bank accounts to the statements your bank sends.
          Reconciling posts nothing — it confirms the books agree with the bank, and
          locks the transactions it clears.
        </p>
      </div>

      {error && (
        <Card className="p-lg">
          <p className="text-body-sm text-danger">{error.message}</p>
        </Card>
      )}

      <section className="flex flex-col gap-sm">
        <h2 className="text-overline text-text-secondary">Accounts</h2>
        {accounts.isLoading ? (
          <Card className="p-lg">
            <div className="h-16 animate-pulse rounded-md bg-neutral-100" />
          </Card>
        ) : (accounts.data ?? []).length === 0 ? (
          <Card className="p-xl text-center">
            <p className="text-body-md text-text-secondary">
              No Cash or Bank accounts to reconcile.
            </p>
          </Card>
        ) : (
          <div className="grid gap-md md:grid-cols-2">
            {(accounts.data ?? []).map((a) => (
              <Card key={a.accountId} className="flex flex-col gap-md p-lg">
                <div className="flex items-start justify-between gap-md">
                  <div className="min-w-0">
                    <p className="text-label-lg text-text-primary">
                      {a.accountNumber} · {a.name}
                    </p>
                    <p className="text-caption text-text-tertiary">{a.subType}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-caption text-text-secondary">Book balance</p>
                    <p className="text-h4 tabular text-text-primary">
                      {formatMoney(a.bookBalance)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-sm border-t border-border-light pt-sm">
                  <p className="flex items-center gap-xxs text-caption text-text-secondary">
                    <Lock className="size-3" />
                    {a.lastReconciledDate
                      ? `Reconciled through ${formatReportDate(a.lastReconciledDate)} at ${formatMoney(
                          a.lastReconciledBalance ?? 0,
                        )}`
                      : 'Never reconciled'}
                  </p>
                  <Button asChild size="sm">
                    <Link to={`/reconciliations/reconcile/${a.accountId}`}>Reconcile</Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-sm">
        <h2 className="text-overline text-text-secondary">Completed reconciliations</h2>
        <DataTable
          columns={columns}
          data={rows}
          isLoading={history.isLoading}
          onRowClick={(r) => navigate(`/reconciliations/${r.id}`)}
          empty={
            <p className="p-lg text-center text-body-sm text-text-tertiary">
              No reconciliations yet. Pick an account above to start one.
            </p>
          }
        />
      </section>
    </div>
  );
}
