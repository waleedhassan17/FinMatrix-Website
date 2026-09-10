import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, SectionHeader } from '@/components/ui/Card';
import { AgingChart } from '@/features/reports/AgingChart';
import { KpiTile } from '@/features/reports/KpiTile';
import { ReportShell } from '@/features/reports/ReportShell';
import { csvAmount, csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import { variance } from '@/models/reportStatement';
import { getAnalytics } from '@/networks/reports/analyticsNetwork';
import type { TrendPoint } from '@/serializers/reportSerializers';
import { CHART_SERIES, colors, typography } from '@/theme/tokens';
import { compactMoney, formatMoney, sumMoney } from '@/utils/money';

// SVG <text> needs a numeric size, and reading it from the typography role is what
// keeps a literal `fontSize: 12` — which the token gate bans — out of this file.
const AXIS_TICK = {
  fill: colors.textTertiary,
  fontSize: typography.caption.fontSize,
} as const;

const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
} as const;

/** Month-on-month movement between the last two points of a series. */
const lastMonthOnMonth = (points: TrendPoint[]) => {
  if (points.length < 2) return null;
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  return { ...variance(latest.value, previous.value), label: latest.label };
};

function RankedBars({ points }: { points: TrendPoint[] }) {
  const max = Math.max(...points.map((p) => p.value), 0);
  if (points.length === 0 || max === 0) {
    return (
      <p className="mt-md text-body-sm text-text-tertiary">Nothing to rank yet.</p>
    );
  }

  return (
    <ul className="mt-md flex flex-col gap-sm">
      {points.slice(0, 5).map((point, index) => (
        <li key={`${point.label}-${index}`}>
          <div className="flex items-baseline justify-between gap-sm">
            <span className="truncate text-body-sm text-text-primary">
              {point.label}
            </span>
            <span className="shrink-0 text-label-md tabular text-text-primary">
              {formatMoney(point.value)}
            </span>
          </div>
          <div className="mt-xxs h-[6px] overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full"
              // Width and colour are both runtime values, so neither can be a
              // Tailwind class.
              style={{
                width: `${(point.value / max) * 100}%`,
                backgroundColor: CHART_SERIES[index % CHART_SERIES.length],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function AnalyticsPage() {
  const query = useQuery({
    queryKey: ['reports', 'analytics'],
    queryFn: getAnalytics,
  });

  const data = query.data;

  const kpis = useMemo(() => {
    const revenue = data?.revenueTrend ?? [];
    const spend = data?.expenseCategories ?? [];
    return {
      totalRevenue: sumMoney(revenue.map((p) => p.value)).toNumber(),
      totalSpend: sumMoney(spend.map((p) => p.value)).toNumber(),
      revenueMoM: lastMonthOnMonth(revenue),
      cashMoM: lastMonthOnMonth(data?.cashFlowTrend ?? []),
      topCustomer: [...(data?.topCustomers ?? [])].sort((a, b) => b.value - a.value)[0],
    };
  }, [data]);

  // A successful response can still hold nothing — a company with no invoices yet.
  // The app renders a zeroed dashboard AND a global "no data" line at the same
  // time, because its two conditions are not exclusive.
  const hasAnything =
    (data?.revenueTrend.length ?? 0) > 0 ||
    (data?.expenseCategories.length ?? 0) > 0 ||
    (data?.topCustomers.length ?? 0) > 0;

  const exportCsv = () => {
    if (!data) return;
    const out: CsvRow[] = [['Analytics'], []];

    out.push(['Revenue trend'], ['Month', 'Revenue']);
    for (const p of data.revenueTrend) out.push([p.label, csvAmount(p.value)]);

    out.push([], ['Cash flow trend'], ['Month', 'Net']);
    for (const p of data.cashFlowTrend) out.push([p.label, csvAmount(p.value)]);

    out.push([], ['Spend by supplier'], ['Supplier', 'Amount']);
    for (const p of data.expenseCategories) out.push([p.label, csvAmount(p.value)]);

    out.push([], ['Top customers'], ['Customer', 'Revenue']);
    for (const p of data.topCustomers) out.push([p.label, csvAmount(p.value)]);

    downloadCsv(csvFilename('analytics', {}), toCsv(out));
  };

  return (
    <ReportShell
      title="Analytics"
      subtitle="Revenue and cash trends, top customers, and where the money goes."
      onExportCsv={exportCsv}
      isLoading={query.isLoading}
      isRefetching={query.isFetching}
      error={query.error as Error | null}
      onRetry={() => query.refetch()}
      hasData={hasAnything}
      empty={
        <>
          <p className="text-label-lg text-text-primary">Nothing to analyse yet</p>
          <p className="mt-xxs text-body-sm text-text-secondary">
            Trends appear once there are invoices and bills to chart.
          </p>
        </>
      }
    >
      <div className="flex flex-col gap-lg">
        <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            label="Revenue charted"
            value={kpis.totalRevenue}
            accent={colors.success}
            compact
            hint={
              kpis.revenueMoM?.percent !== null && kpis.revenueMoM
                ? `${kpis.revenueMoM.percent > 0 ? '+' : ''}${kpis.revenueMoM.percent}% on the prior month`
                : undefined
            }
          />
          <KpiTile
            label="Supplier spend"
            value={kpis.totalSpend}
            accent={colors.warning}
            compact
          />
          <KpiTile
            label="Latest net cash"
            value={
              data?.cashFlowTrend[data.cashFlowTrend.length - 1]?.value ?? 0
            }
            accent={
              (data?.cashFlowTrend[data.cashFlowTrend.length - 1]?.value ?? 0) < 0
                ? colors.danger
                : colors.info
            }
            hint={kpis.cashMoM?.label}
          />
          <KpiTile
            label="Top customer"
            value={kpis.topCustomer?.value ?? 0}
            accent={colors.secondary}
            compact
            hint={kpis.topCustomer?.label}
          />
        </div>

        <Card className="p-lg">
          <SectionHeader title="Revenue trend" />
          <p className="text-caption text-text-tertiary">Amounts in Rs</p>
          <div className="mt-md h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.revenueTrend ?? []}>
                <defs>
                  <linearGradient id="analyticsRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_SERIES[0]} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={CHART_SERIES[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={colors.borderLight} />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(v: number) => compactMoney(v)}
                />
                <Tooltip
                  formatter={(v) => formatMoney(v as number)}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={CHART_SERIES[0]}
                  strokeWidth={2}
                  fill="url(#analyticsRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-lg">
          <SectionHeader title="Net cash by month" />
          <p className="text-caption text-text-tertiary">
            Invoiced less billed. Amounts in Rs.
          </p>
          <div className="mt-md h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.cashFlowTrend ?? []}>
                <CartesianGrid vertical={false} stroke={colors.borderLight} />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(v: number) => compactMoney(v)}
                />
                <Tooltip
                  formatter={(v) => formatMoney(v as number)}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={CHART_SERIES[1]}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="grid gap-lg lg:grid-cols-2">
          <Card className="p-lg">
            {/* Named for what it is. The API calls this `expenseCategories`, but
                the query groups bills by VENDOR — there is no expense account in
                it. Repeating the API's wording would be a mislabel on screen. */}
            <SectionHeader title="Spend by supplier" />
            <RankedBars points={data?.expenseCategories ?? []} />
          </Card>

          <Card className="p-lg">
            <SectionHeader title="Top customers" />
            <RankedBars points={data?.topCustomers ?? []} />
          </Card>
        </div>

        {data?.arAgingTrend[0] && (
          <Card className="p-lg">
            <SectionHeader title="Receivables by age" />
            <AgingChart
              totals={{
                ...data.arAgingTrend[0],
                total:
                  data.arAgingTrend[0].current +
                  data.arAgingTrend[0].bucket1to30 +
                  data.arAgingTrend[0].bucket31to60 +
                  data.arAgingTrend[0].bucket61to90 +
                  data.arAgingTrend[0].bucket90Plus,
              }}
            />
          </Card>
        )}

        <p className="text-caption text-text-tertiary">
          Trends are drawn from invoice and bill dates across the last twelve months
          that have activity, so sparse months are months with no documents. Revenue
          here is invoiced totals including tax — the Profit &amp; Loss is the
          statement for earned revenue net of tax.
        </p>
      </div>
    </ReportShell>
  );
}
