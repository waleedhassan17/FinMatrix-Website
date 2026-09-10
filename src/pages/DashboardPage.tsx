import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, SectionHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QUICK_ACTIONS } from '@/config/nav';
import { useCapability, useFeature, useIsOwner } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { fetchPendingApprovalCount } from '@/networks/approvals/approvalsNetwork';
import {
  getDashboardSummary,
  getRevenueTrend,
} from '@/networks/dashboards/dashboardNetwork';
import { CHART_SERIES, colors, typography } from '@/theme/tokens';
import { compactMoney, formatMoney } from '@/utils/money';

// Recharts renders SVG <text>, which needs a numeric size rather than a class,
// so the axis tick style is built from the caption role instead of hardcoded.
const AXIS_TICK = {
  fill: colors.textTertiary,
  fontSize: typography.caption.fontSize,
} as const;

// ───────────────────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  accent,
  loading,
}: {
  label: string;
  value: number;
  accent: string;
  loading: boolean;
}) {
  return (
    <Card className="relative overflow-hidden p-lg">
      {/* The 4px status rail, ported from the app's TxnCard. */}
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: accent }}
      />
      <div className="pl-xs">
        <p className="text-caption text-text-secondary">{label}</p>
        {loading ? (
          <div className="mt-xxs h-7 w-28 animate-pulse rounded-sm bg-neutral-100" />
        ) : (
          // compactMoney, not formatMoney: a tile is not wide enough for
          // Rs 12,345,678.00, and the app compacts here too. The full figure
          // is in the title attribute for anyone who needs it.
          <p
            className="mt-xxs text-h2 text-text-primary tabular"
            title={formatMoney(value)}
          >
            {compactMoney(value)}
          </p>
        )}
      </div>
    </Card>
  );
}

function QuickActionButton({
  action,
}: {
  action: (typeof QUICK_ACTIONS)[number];
}) {
  const { allowed, needsApproval } = useCapability(action.capability);
  const featureOn = useFeature(action.feature);
  if (!allowed || !featureOn) return null;

  const Icon = action.icon;
  return (
    <Link
      to={action.path}
      className="flex items-center gap-sm rounded-md border border-border bg-surface px-md py-sm transition-colors hover:bg-surface-hover"
    >
      <span className="flex size-9 items-center justify-center rounded-md bg-primary-tint">
        <Icon className="size-4 text-primary" />
      </span>
      <span className="flex-1">
        <span className="block text-label-lg text-text-primary">
          {action.title}
        </span>
        {/* Say what will actually happen before they click, not after. */}
        {needsApproval && (
          <span className="block text-caption text-warning">
            Goes to the owner for approval
          </span>
        )}
      </span>
      <ArrowRight className="size-4 text-text-tertiary" />
    </Link>
  );
}

// ───────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const isOwner = useIsOwner();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: getDashboardSummary,
  });

  const { data: trend } = useQuery({
    queryKey: ['dashboard', 'revenue-trend'],
    queryFn: () => getRevenueTrend(6),
  });

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['approvals', 'pending-count'],
    queryFn: fetchPendingApprovalCount,
  });

  if (isError) {
    return (
      <Card className="flex items-start gap-sm p-lg">
        <AlertCircle className="mt-[2px] size-5 shrink-0 text-danger" />
        <div>
          <p className="text-label-lg text-text-primary">
            Could not load the dashboard
          </p>
          <p className="text-body-sm text-text-secondary">
            {error instanceof Error ? error.message : 'Please try again.'}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-lg">
      <div>
        <h1 className="text-h2 text-text-primary">Dashboard</h1>
        <p className="text-body-sm text-text-secondary">
          Where the business stands today.
        </p>
      </div>

      {/* Approvals banner. One endpoint, two meanings: the server scopes the
          count by role, so an owner sees what awaits their signature and a
          staff member sees how many of their own requests are still waiting. */}
      {pendingCount > 0 && (
        <Link
          to={isOwner ? '/approvals' : '/my-requests'}
          className="flex items-center gap-sm rounded-lg border border-warning-light bg-warning-lighter px-lg py-md transition-colors hover:bg-warning-light"
        >
          <Inbox className="size-5 shrink-0 text-warning" />
          <span className="flex-1 text-label-lg text-text-primary">
            {isOwner
              ? `${pendingCount} item${pendingCount === 1 ? '' : 's'} awaiting your approval`
              : `${pendingCount} of your request${pendingCount === 1 ? ' is' : 's are'} pending`}
          </span>
          <ArrowRight className="size-4 text-text-secondary" />
        </Link>
      )}

      <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Revenue this period"
          value={data?.totalRevenue ?? 0}
          accent={colors.success}
          loading={isLoading}
        />
        <KpiTile
          label="Accounts receivable"
          value={data?.outstandingAR ?? 0}
          accent={colors.info}
          loading={isLoading}
        />
        <KpiTile
          label="Accounts payable"
          value={data?.pendingAP ?? 0}
          accent={colors.warning}
          loading={isLoading}
        />
        <KpiTile
          label="Net income"
          value={data?.netIncome ?? 0}
          accent={
            (data?.netIncome ?? 0) < 0 ? colors.danger : colors.primary
          }
          loading={isLoading}
        />
      </div>

      <div className="grid gap-lg xl:grid-cols-3">
        <Card className="p-lg xl:col-span-2">
          <SectionHeader title="Revenue trend" />
          <div className="mt-md h-64">
            {trend === null ? (
              <p className="text-body-sm text-text-tertiary">
                Trend data is unavailable right now.
              </p>
            ) : trend && trend.length === 0 ? (
              <p className="text-body-sm text-text-tertiary">
                No revenue history yet — it will appear once you raise your
                first invoice.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend ?? []}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={CHART_SERIES[0]}
                        stopOpacity={0.28}
                      />
                      <stop
                        offset="100%"
                        stopColor={CHART_SERIES[0]}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke={colors.borderLight}
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={AXIS_TICK}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tick={AXIS_TICK}
                    tickFormatter={(v: number) => compactMoney(v)}
                  />
                  <Tooltip
                    // Recharts types the value as ValueType (string | number |
                    // array), so it is narrowed here rather than asserted.
                    formatter={(v) => formatMoney(v as number)}
                    contentStyle={{
                      borderRadius: 10,
                      border: `1px solid ${colors.border}`,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={CHART_SERIES[0]}
                    strokeWidth={2}
                    fill="url(#revFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-lg">
          <SectionHeader title="Quick actions" />
          <div className="mt-md flex flex-col gap-xs">
            {QUICK_ACTIONS.map((a) => (
              <QuickActionButton key={a.path} action={a} />
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-lg">
        <SectionHeader title="Recent activity" />
        {isLoading ? (
          <div className="mt-md space-y-xs">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-md bg-neutral-100"
              />
            ))}
          </div>
        ) : data?.recentTransactions.length ? (
          <ul className="mt-md divide-y divide-border-light">
            {data.recentTransactions.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-md py-sm first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-label-lg text-text-primary">
                    {t.description}
                  </p>
                  <p className="text-body-sm text-text-secondary">{t.date}</p>
                </div>
                <StatusBadge status={t.status} />
                <span
                  className={cn(
                    'w-32 shrink-0 text-right text-label-lg text-text-primary tabular',
                  )}
                >
                  {formatMoney(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-md text-body-sm text-text-tertiary">
            {data?.isEmpty
              ? 'No transactions yet. Add a customer and raise your first invoice to get started.'
              : 'Nothing recent.'}
          </p>
        )}
      </Card>
    </div>
  );
}
