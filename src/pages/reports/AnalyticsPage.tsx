import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { Card } from '@/components/ui/Card';
import { PanelHeader, PanelLink } from '@/features/dashboard/PanelHeader';
import { ReceivablesAgeCard } from '@/features/dashboard/ReceivablesAgeCard';
import {
  AnalyticsLegend,
  AnalyticsMonthlyChart,
} from '@/features/reports/AnalyticsMonthlyChart';
import { Change, Figure, FigureStrip } from '@/features/reports/FigureStrip';
import { RankedBars } from '@/features/reports/RankedBars';
import { ReportShell } from '@/features/reports/ReportShell';
import { cn } from '@/lib/cn';
import {
  analyticsMonths,
  analyticsPeriodLabel,
  analyticsSummary,
  formatChange,
} from '@/models/analytics';
import { formatShare } from '@/models/reportAging';
import { csvAmount, csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import { getAnalytics } from '@/networks/reports/analyticsNetwork';
import type { TrendPoint } from '@/serializers/reportSerializers';
import { compactMoney, formatAmount, formatMoney } from '@/utils/money';

/** How many customers and suppliers get a bar before the rest fold into "Other". */
const RANK_LIMIT = 5;

const ranked = (points: TrendPoint[]) =>
  points.map((p, i) => ({ key: `${p.label}-${i}`, label: p.label || '(no name)', value: p.value }));

/**
 * Twelve months of trading, in the shape an operator reads it: the headline
 * figures, the monthly picture, who owes what by age, who the money comes from
 * and goes to, and the table behind the chart.
 *
 * Every panel says what period it covers. The payload mixes them — the monthly
 * series are the last twelve months with invoices, the customer and supplier
 * rankings are all-time, receivables are today — and a page that lets those sit
 * side by side unlabelled invites someone to add them together.
 */
export default function AnalyticsPage() {
  const query = useQuery({
    queryKey: ['reports', 'analytics'],
    queryFn: getAnalytics,
  });

  const data = query.data;

  const months = useMemo(
    () => analyticsMonths(data?.revenueTrend ?? [], data?.cashFlowTrend ?? []),
    [data],
  );
  const summary = useMemo(() => analyticsSummary(months), [months]);
  const period = analyticsPeriodLabel(months);

  // The receivables snapshot uses the classic five buckets; overdue is
  // everything past "current".
  const aging = data?.arAgingTrend[0];
  const outstanding = aging
    ? aging.current + aging.bucket1to30 + aging.bucket31to60 + aging.bucket61to90 + aging.bucket90Plus
    : 0;
  const overdue = outstanding - (aging?.current ?? 0);

  // A successful response can still hold nothing — a company with no invoices yet.
  const hasAnything =
    (data?.revenueTrend.length ?? 0) > 0 ||
    (data?.expenseCategories.length ?? 0) > 0 ||
    (data?.topCustomers.length ?? 0) > 0;

  const latestChange = formatChange(summary.latest?.change ?? null);

  const exportCsv = () => {
    if (!data) return;
    const out: CsvRow[] = [['Analytics'], [period], []];

    out.push(['Invoiced and billed by month'], ['Month', 'Invoiced', 'Billed', 'Invoiced less billed']);
    for (const m of months) {
      out.push([m.label, csvAmount(m.invoiced), csvAmount(m.billed), csvAmount(m.net)]);
    }
    out.push(['Total', csvAmount(summary.invoiced), csvAmount(summary.billed), csvAmount(summary.net)]);

    out.push([], ['Top customers (all time)'], ['Customer', 'Invoiced']);
    for (const p of data.topCustomers) out.push([p.label, csvAmount(p.value)]);

    out.push([], ['Spend by supplier (all time)'], ['Supplier', 'Billed']);
    for (const p of data.expenseCategories) out.push([p.label, csvAmount(p.value)]);

    downloadCsv(csvFilename('analytics', {}), toCsv(out));
  };

  return (
    <ReportShell
      title="Analytics"
      subtitle="What the business invoiced and was billed, month by month."
      meta={
        data && period
          ? [period, 'Invoice and bill totals, tax included', 'Drafts and voids excluded']
          : undefined
      }
      onExportCsv={exportCsv}
      pdf={{
        periodLabel: period,
        basis: 'Invoice and bill totals, tax included',
        cacheKey: String(query.dataUpdatedAt),
        build: () => [
          {
            title: 'Invoiced and billed by month',
            columns: [
              { header: 'Month', flex: 2 },
              { header: 'Invoiced', align: 'right', flex: 2 },
              { header: 'Billed', align: 'right', flex: 2 },
              { header: 'Invoiced less billed', align: 'right', flex: 2.4 },
            ],
            rows: [
              ...months.map((m) => ({ cells: [m.label, m.invoiced, m.billed, m.net] })),
              { cells: ['Total', summary.invoiced, summary.billed, summary.net], grand: true },
            ],
          },
          {
            title: 'Top customers (all time)',
            columns: [
              { header: 'Customer', flex: 5 },
              { header: 'Invoiced', align: 'right', flex: 2 },
            ],
            rows: (data?.topCustomers ?? []).map((p) => ({ cells: [p.label, p.value] })),
          },
          {
            title: 'Spend by supplier (all time)',
            columns: [
              { header: 'Supplier', flex: 5 },
              { header: 'Billed', align: 'right', flex: 2 },
            ],
            rows: (data?.expenseCategories ?? []).map((p) => ({ cells: [p.label, p.value] })),
          },
        ],
      }}
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
        <FigureStrip>
          <Figure
            label="Invoiced"
            value={summary.invoiced}
            caption={
              months.length > 0
                ? `${months.length} month${months.length === 1 ? '' : 's'} · ${compactMoney(summary.averageInvoiced)} a month`
                : 'No invoices yet'
            }
          />
          <Figure
            label={summary.latest ? `Invoiced in ${summary.latest.label}` : 'Latest month'}
            value={summary.latest?.invoiced ?? 0}
            caption={
              latestChange && summary.previous ? (
                <>
                  <Change text={latestChange} good={(summary.latest?.change?.delta ?? 0) >= 0} />{' '}
                  on {summary.previous.label}
                </>
              ) : (
                'No earlier month to compare'
              )
            }
          />
          <Figure
            label="Invoiced less billed"
            value={summary.net}
            tone={summary.net < 0 ? 'danger' : 'default'}
            caption={`Billed ${compactMoney(summary.billed)} over the same months`}
          />
          <Figure
            label="Overdue receivables"
            value={overdue}
            tone={overdue > 0 ? 'warning' : 'default'}
            caption={
              outstanding > 0
                ? `${formatShare(overdue / outstanding)} of ${compactMoney(outstanding)} owed today`
                : 'Nothing owed today'
            }
          />
        </FigureStrip>

        <div className="grid gap-lg xl:grid-cols-3">
          <Card className="flex flex-col overflow-hidden xl:col-span-2">
            <PanelHeader
              title="Invoiced and billed by month"
              description={period ? `${period} · months with invoices` : undefined}
              action={<PanelLink to="/reports/profit-loss">Profit &amp; Loss</PanelLink>}
            />
            <div className="flex flex-1 flex-col px-md pb-sm pt-md">
              <AnalyticsLegend className="px-sm" />
              {months.length > 0 ? (
                <AnalyticsMonthlyChart months={months} className="mt-sm min-h-[18rem] flex-1" />
              ) : (
                <p className="px-sm py-lg text-body-sm text-text-tertiary">
                  No invoices in the last twelve months.
                </p>
              )}
            </div>
          </Card>

          <ReceivablesAgeCard
            aging={aging}
            loading={false}
            failed={false}
            onRetry={() => query.refetch()}
          />
        </div>

        <div className="grid gap-lg lg:grid-cols-2">
          <Card className="flex flex-col overflow-hidden">
            <PanelHeader
              title="Top customers"
              description="All time · invoice totals"
              action={<PanelLink to="/customers">Customers</PanelLink>}
            />
            <div className="px-lg py-md">
              <RankedBars
                points={ranked(data?.topCustomers ?? [])}
                limit={RANK_LIMIT}
                format={(v) => formatMoney(v)}
                emptyLabel="No customer has been invoiced yet."
              />
            </div>
          </Card>

          <Card className="flex flex-col overflow-hidden">
            {/* Named for what it is. The API calls this `expenseCategories`, but
                the query groups bills by VENDOR — there is no expense account in
                it. Repeating the API's wording would be a mislabel on screen. */}
            <PanelHeader
              title="Spend by supplier"
              description="All time · bill totals"
              action={<PanelLink to="/vendors">Vendors</PanelLink>}
            />
            <div className="px-lg py-md">
              <RankedBars
                points={ranked(data?.expenseCategories ?? [])}
                limit={RANK_LIMIT}
                format={(v) => formatMoney(v)}
                emptyLabel="No supplier has billed yet."
              />
            </div>
          </Card>
        </div>

        {months.length > 0 && (
          <Card className="overflow-hidden">
            <PanelHeader title="Monthly detail" description="The figures behind the chart" />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-surface-2">
                    <th className="px-lg py-sm text-left text-overline text-text-secondary">Month</th>
                    <th className="px-md py-sm text-right text-overline text-text-secondary">Invoiced</th>
                    <th className="px-md py-sm text-right text-overline text-text-secondary">Billed</th>
                    <th className="px-md py-sm text-right text-overline whitespace-nowrap text-text-secondary">
                      Invoiced less billed
                    </th>
                    <th className="px-lg py-sm text-right text-overline whitespace-nowrap text-text-secondary">
                      Invoiced vs prior
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => {
                    const change = formatChange(m.change);
                    return (
                      <tr key={m.label} className="border-b border-border-light hover:bg-surface-2">
                        <td className="px-lg py-sm text-body-sm whitespace-nowrap text-text-primary">{m.label}</td>
                        <td className="px-md py-sm text-right tabular text-body-sm whitespace-nowrap text-text-primary">
                          {formatAmount(m.invoiced)}
                        </td>
                        <td className="px-md py-sm text-right tabular text-body-sm whitespace-nowrap text-text-primary">
                          {m.billed ? formatAmount(m.billed) : '—'}
                        </td>
                        <td
                          className={cn(
                            'px-md py-sm text-right tabular text-body-sm whitespace-nowrap',
                            m.net < 0 ? 'text-danger' : 'text-text-primary',
                          )}
                        >
                          {formatAmount(m.net)}
                        </td>
                        <td className="px-lg py-sm text-right text-caption whitespace-nowrap">
                          {change ? (
                            <Change text={change} good={(m.change?.delta ?? 0) >= 0} />
                          ) : (
                            <span className="text-text-tertiary">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-text-primary border-b-[3px] border-b-border-strong border-double bg-surface-2">
                    <td className="px-lg py-sm text-label-lg text-text-primary">Total</td>
                    <td className="px-md py-sm text-right tabular text-label-lg whitespace-nowrap text-text-primary">
                      {formatAmount(summary.invoiced)}
                    </td>
                    <td className="px-md py-sm text-right tabular text-label-lg whitespace-nowrap text-text-primary">
                      {formatAmount(summary.billed)}
                    </td>
                    <td
                      className={cn(
                        'px-md py-sm text-right tabular text-label-lg whitespace-nowrap',
                        summary.net < 0 ? 'text-danger' : 'text-text-primary',
                      )}
                    >
                      {formatAmount(summary.net)}
                    </td>
                    <td className="px-lg py-sm" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}

        <p className="text-caption text-text-tertiary">
          Monthly figures are invoice and bill totals by document date, tax included,
          over the last twelve months that have invoices — a month with none is not
          shown. Invoiced less billed is not cash: nothing here says what was
          collected or paid. Profit &amp; Loss is the statement for earned revenue
          net of tax.
        </p>
      </div>
    </ReportShell>
  );
}
