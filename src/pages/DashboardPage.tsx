import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertCircle, RotateCw } from 'lucide-react';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AttentionCard } from '@/features/dashboard/AttentionCard';
import { KpiGroup } from '@/features/dashboard/KpiGroup';
import { NewDocumentMenu } from '@/features/dashboard/NewDocumentMenu';
import { OperationsCard } from '@/features/dashboard/OperationsCard';
import { ReceivablesAgeCard } from '@/features/dashboard/ReceivablesAgeCard';
import { RecentActivityCard } from '@/features/dashboard/RecentActivityCard';
import { RevenueCard } from '@/features/dashboard/RevenueCard';
import { useFeature, useIsOwner } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { periodLabel } from '@/models/dashboard';
import { fetchPendingApprovalCount } from '@/networks/approvals/approvalsNetwork';
import { getDashboardSummary } from '@/networks/dashboards/dashboardNetwork';
import { getAnalytics } from '@/networks/reports/analyticsNetwork';

/**
 * The owner's and staff's landing page: the month's figures, what needs doing,
 * and the latest documents — each a summary of a report one click away.
 *
 * Three independent queries, and each panel owns its own loading and failure
 * state. A failed summary used to replace the entire page with an error card,
 * taking a perfectly good revenue chart down with it.
 */
export default function DashboardPage() {
  const isOwner = useIsOwner();
  const deliveryOn = useFeature('delivery');
  const inventoryOn = useFeature('inventory');

  const summary = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: getDashboardSummary,
  });

  // Under the dashboard prefix rather than the Analytics page's own key, so the
  // invalidations that already refresh the dashboard (approvals, PO receipts,
  // account changes) refresh this too.
  const analytics = useQuery({
    queryKey: ['dashboard', 'analytics'],
    queryFn: getAnalytics,
  });

  const approvals = useQuery({
    queryKey: ['approvals', 'pending-count'],
    queryFn: fetchPendingApprovalCount,
  });

  const data = summary.data;
  // Failed with nothing to show. A failed REFETCH keeps the last good figures,
  // which are still true as of the time in the header.
  const summaryFailed = summary.isError && !data;
  const period = periodLabel(data?.period);
  const refreshing = summary.isFetching || analytics.isFetching || approvals.isFetching;

  const refresh = () => {
    void summary.refetch();
    void analytics.refetch();
    void approvals.refetch();
  };

  const net = data?.netIncome ?? 0;

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        title="Dashboard"
        meta={[
          period ? `Month to date · ${period}` : null,
          summary.dataUpdatedAt
            ? `Updated ${format(summary.dataUpdatedAt, 'HH:mm')}`
            : null,
        ]}
        actions={
          <>
            <Button
              variant="secondary"
              size="icon"
              onClick={refresh}
              disabled={refreshing}
              aria-label="Refresh dashboard"
              title="Refresh"
            >
              <RotateCw
                className={cn('size-4', refreshing && 'animate-spin motion-reduce:animate-none')}
              />
            </Button>
            <NewDocumentMenu />
          </>
        }
      />

      {summaryFailed && (
        <Card className="flex items-start gap-sm border border-danger-light bg-danger-lighter p-lg">
          <AlertCircle aria-hidden="true" className="mt-[2px] size-5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="text-label-lg text-text-primary">
              Could not load this month&rsquo;s figures
            </p>
            <p className="text-body-sm text-text-secondary">
              {summary.error instanceof Error ? summary.error.message : 'Please try again.'}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void summary.refetch()}>
            Try again
          </Button>
        </Card>
      )}

      <div className="grid gap-lg xl:grid-cols-5">
        <KpiGroup
          className="xl:col-span-3"
          title={period ? `This month · ${period}` : 'This month'}
          loading={summary.isLoading}
          unavailable={summaryFailed}
          cells={[
            {
              key: 'revenue',
              label: 'Revenue',
              value: data?.totalRevenue ?? 0,
              caption: 'Invoiced this month',
              to: '/reports/profit-loss',
            },
            {
              key: 'expenses',
              label: 'Expenses',
              value: data?.totalExpenses ?? 0,
              caption: 'Billed this month',
              to: '/reports/profit-loss',
            },
            {
              key: 'net',
              label: 'Net income',
              value: net,
              caption: 'Revenue less expenses',
              to: '/reports/profit-loss',
              tone: net < 0 ? 'danger' : 'default',
            },
          ]}
        />
        <KpiGroup
          className="xl:col-span-2"
          title="Outstanding balances"
          loading={summary.isLoading}
          unavailable={summaryFailed}
          cells={[
            {
              key: 'ar',
              label: 'Receivables',
              value: data?.outstandingAR ?? 0,
              caption: 'Due from customers',
              to: '/reports/ar-aging',
            },
            {
              key: 'ap',
              label: 'Payables',
              value: data?.pendingAP ?? 0,
              caption: 'Owed to suppliers',
              to: '/reports/ap-aging',
            },
          ]}
        />
      </div>

      <div className="grid items-start gap-lg xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-lg xl:col-span-2">
          <RevenueCard
            points={analytics.data?.revenueTrend}
            loading={analytics.isLoading}
            failed={analytics.isError}
            onRetry={() => void analytics.refetch()}
          />
          <RecentActivityCard
            transactions={data?.recentTransactions ?? []}
            loading={summary.isLoading}
            failed={summaryFailed}
            companyIsEmpty={data?.isEmpty ?? false}
          />
        </div>

        {/* First on a narrow screen, where the columns stack: what needs doing
            comes before the trend, the same order the Android dashboard uses. */}
        <div className="order-first flex min-w-0 flex-col gap-lg xl:order-none">
          <AttentionCard
            alerts={data?.alerts ?? []}
            pendingApprovals={approvals.data ?? 0}
            isOwner={isOwner}
            deliveryEnabled={deliveryOn}
            loading={summary.isLoading}
            alertsFailed={summaryFailed}
          />
          <ReceivablesAgeCard
            aging={analytics.data?.arAgingTrend[0]}
            loading={analytics.isLoading}
            failed={analytics.isError}
            onRetry={() => void analytics.refetch()}
          />
          {/* Counts, not money: with no summary there is nothing honest to
              draw, so the card waits for the retry rather than showing zeros. */}
          {!summaryFailed && (
            <OperationsCard
              deliveries={data?.deliveries}
              inventoryItems={data?.inventoryItems ?? 0}
              showDeliveries={deliveryOn}
              showInventory={inventoryOn}
              loading={summary.isLoading}
            />
          )}
        </div>
      </div>
    </div>
  );
}
