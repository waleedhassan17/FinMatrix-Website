import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { Card } from '@/components/ui/Card';
import { PanelHeader, PanelLink } from '@/features/dashboard/PanelHeader';
import { useDocumentCompany } from '@/features/documents/useDocumentContext';
import { AssessmentPill } from '@/features/reports/AssessmentPill';
import { CashBalanceChart } from '@/features/reports/CashCharts';
import { CashCycle } from '@/features/reports/CashCycle';
import { DonutChart } from '@/features/reports/DonutChart';
import { FigureStrip } from '@/features/reports/FigureStrip';
import { FinancialHealthStrip } from '@/features/reports/FinancialHealthStrip';
import { InsightsList } from '@/features/reports/InsightsList';
import { KpiCard } from '@/features/reports/KpiCard';
import { PeriodMenu } from '@/features/reports/PeriodMenu';
import { RankedBars } from '@/features/reports/RankedBars';
import { ReportShell } from '@/features/reports/ReportShell';
import { SeriesChart, type ChartSeries } from '@/features/reports/SeriesChart';
import { useRangeParam, useReportParams } from '@/features/reports/useReportParams';
import { cn } from '@/lib/cn';
import { varianceLabel, varianceTone, type BudgetVsActual } from '@/models/budget';
import { canDonut, OTHER_KEY, type SlicePoint } from '@/models/chartSlices';
import { INSIGHT_REPORT_LABEL } from '@/models/insights';
import { assessmentLabel, formatKpiChange, formatKpiValue, kpiStatusText } from '@/models/kpi';
import { csvAmount, csvFilename, csvHeaderBlock, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import { defaultReportRange, formatShortDate, PERIOD_PRESETS, rangeLabel } from '@/models/reportPeriod';
import { getOwnerCockpit } from '@/networks/reports/analyticsNetwork';
import type { Kpi } from '@/serializers/kpiSerializer';
import { CATEGORY_PALETTE } from '@/theme/tokens';
import { formatMoney, parenNegative } from '@/utils/money';

/** The donut and the customer list name five, and fold the rest into Other on the server. */
const TOP = { expenseTop: 5, customerTop: 5 } as const;

/** Revenue and gross profit as columns, net profit a line through them — one money axis. */
const PROFIT_SERIES: ChartSeries[] = [
  { key: 'revenue', label: 'Revenue', kind: 'bar', color: CATEGORY_PALETTE[0] },
  { key: 'grossProfit', label: 'Gross profit', kind: 'bar', color: CATEGORY_PALETTE[1] },
  { key: 'netIncome', label: 'Net profit', kind: 'line', color: CATEGORY_PALETTE[2] },
];

/** The figures on the CSV and the PDF, in the order the page shows them. */
const EXPORT_KPIS = [
  'revenue',
  'grossProfit',
  'grossMarginPct',
  'netIncome',
  'netMarginPct',
  'operatingExpenses',
  'operatingCashFlow',
  'endingCash',
  'runwayMonths',
  'dso',
  'dio',
  'dpo',
  'ccc',
];

/**
 * Analytics — the business at a glance, against the period before.
 *
 * Read top to bottom the way an owner asks: how much came in and what was
 * kept (four headline figures, each with its trend and its move), what stands
 * out, the months behind it, where the money went, then cash, the cash cycle
 * and customers, and last the balance-sheet health the lender asks about.
 *
 * Every figure and every sentence is the server's (GET /reports/analytics):
 * the comparison period, each KPI's verdict, the "what stands out" lines and
 * the top-five folds. Nothing is added up here.
 */
export default function AnalyticsPage() {
  const company = useDocumentCompany();
  const navigate = useNavigate();
  const { params, update } = useReportParams();
  const range = useRangeParam(params, defaultReportRange);

  const query = useQuery({
    queryKey: ['reports', 'owner-cockpit', range.startDate, range.endDate, TOP.expenseTop, TOP.customerTop],
    queryFn: () => getOwnerCockpit(range, TOP),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const period = rangeLabel(range.startDate, range.endDate);
  const priorPeriod = data?.comparisonRange.startDate
    ? rangeLabel(data.comparisonRange.startDate, data.comparisonRange.endDate)
    : null;
  const vsPrior = priorPeriod ? 'vs previous period' : undefined;

  const kpi = (key: string): Kpi | undefined => data?.kpis[key];
  const series = data?.series ?? [];
  const hasAnything = !!data && (series.length > 0 || Object.keys(data.kpis).length > 0);
  const periodQuery = `from=${range.startDate}&to=${range.endDate}`;

  const margin = (key: string, label: string) => {
    const m = kpi(key);
    if (!m || m.value === null) return null;
    const move = formatKpiChange(m);
    return `${formatKpiValue(m.value, 'percent')} ${label}${move && m.change ? ` · ${move}` : ''}`;
  };
  const runway = kpi('runwayMonths');
  const runwayText = runway
    ? runway.value !== null
      ? `${formatKpiValue(runway.value, 'months')} of runway`
      : kpiStatusText(runway.status)
    : null;

  const expenseSlices: SlicePoint[] = (data?.expenseByAccount ?? []).map((e) => ({
    key: e.accountCode || OTHER_KEY,
    label: e.accountCode ? e.label : 'Other accounts',
    value: e.amount,
    sharePct: e.sharePct,
  }));
  const sales = data?.salesByCustomer;

  const exportCsv = () => {
    if (!data) return;
    const out: CsvRow[] = [
      ...csvHeaderBlock({
        company: company.name,
        report: 'Analytics',
        period,
        basis: 'Ledger basis',
        comparison: priorPeriod ? `Compared with ${priorPeriod}` : null,
      }),
      ['Figure', 'This period', 'Previous period', 'Change', 'Reading'],
    ];
    for (const key of EXPORT_KPIS) {
      const k = kpi(key);
      if (!k) continue;
      out.push([k.label, k.value ?? '', k.prior ?? '', k.change ?? '', assessmentLabel(k.assessment) ?? '']);
    }
    if (data.insights.length) {
      out.push([], ['What stands out', 'Detail', 'Report']);
      for (const i of data.insights) out.push([i.title, i.detail, INSIGHT_REPORT_LABEL[i.report.key] ?? '']);
    }
    out.push([], ['Month', 'Revenue', 'Cost of sales', 'Gross profit', 'Operating expenses', 'Net profit', 'Operating cash flow', 'Ending cash']);
    for (const m of series) {
      out.push([
        m.label,
        csvAmount(m.revenue),
        csvAmount(m.cogs),
        csvAmount(m.grossProfit),
        csvAmount(m.operatingExpenses),
        csvAmount(m.netIncome),
        csvAmount(m.operatingCashFlow),
        csvAmount(m.endingCash),
      ]);
    }
    out.push([], ['Expense account', 'Amount', 'Share %']);
    for (const e of data.expenseByAccount) {
      out.push([`${e.accountCode} ${e.label}`.trim(), csvAmount(e.amount), e.sharePct === null ? '' : e.sharePct.toFixed(1)]);
    }
    out.push([], [`Sales by customer (${data.salesByCustomer.basis})`, 'Amount', 'Share %']);
    for (const c of data.salesByCustomer.customers) {
      out.push([c.name, csvAmount(c.amount), c.sharePct === null ? '' : c.sharePct.toFixed(1)]);
    }
    if (data.salesByCustomer.other) {
      const o = data.salesByCustomer.other;
      out.push([`Other (${o.count})`, csvAmount(o.amount), o.sharePct === null ? '' : o.sharePct.toFixed(1)]);
    }
    return downloadCsv(csvFilename('analytics', range), toCsv(out));
  };

  return (
    <ReportShell
      title="Analytics"
      subtitle="How the business is doing, against the period before — every figure from the ledger."
      meta={data ? [period, ...(priorPeriod ? [`Compared with ${priorPeriod}`] : []), 'Ledger basis'] : undefined}
      controls={
        <PeriodMenu
          label="Period"
          presets={PERIOD_PRESETS}
          value={range}
          onChange={(next) => {
            const fallback = defaultReportRange();
            const isDefault = next.startDate === fallback.startDate && next.endDate === fallback.endDate;
            update({ from: isDefault ? null : next.startDate, to: isDefault ? null : next.endDate });
          }}
        />
      }
      onExportCsv={exportCsv}
      pdf={{
        periodLabel: period,
        basis: 'Ledger basis',
        comparisonLabel: priorPeriod ? `Compared with ${priorPeriod}` : null,
        cacheKey: [range.startDate, range.endDate, query.dataUpdatedAt].join('|'),
        build: () => [
          {
            title: 'Key figures',
            columns: [
              { header: 'Figure', flex: 3 },
              { header: 'This period', align: 'right', flex: 2 },
              { header: 'Previous period', align: 'right', flex: 2 },
              { header: 'Change', align: 'right', flex: 2 },
              { header: 'Reading', align: 'right', flex: 1.4 },
            ],
            rows: EXPORT_KPIS.map((key) => kpi(key))
              .filter((k): k is Kpi => !!k)
              .map((k) => ({
                cells: [
                  k.label,
                  formatKpiValue(k.value, k.unit),
                  formatKpiValue(k.prior, k.unit),
                  formatKpiChange(k) ?? '—',
                  assessmentLabel(k.assessment) ?? '—',
                ],
              })),
          },
          ...(data?.insights.length
            ? [
                {
                  title: 'What stands out',
                  columns: [{ header: 'Finding', flex: 1 }],
                  rows: data.insights.map((i) => ({ cells: [i.title], sub: i.detail })),
                },
              ]
            : []),
          {
            title: 'By month',
            columns: [
              { header: 'Month', flex: 2 },
              { header: 'Revenue', align: 'right', flex: 2 },
              { header: 'Gross profit', align: 'right', flex: 2 },
              { header: 'Net profit', align: 'right', flex: 2 },
              { header: 'Operating cash', align: 'right', flex: 2 },
              { header: 'Ending cash', align: 'right', flex: 2 },
            ],
            rows: series.map((m) => ({
              cells: [m.label, m.revenue, m.grossProfit, m.netIncome, m.operatingCashFlow, m.endingCash],
            })),
          },
          {
            title: 'Where the money went',
            columns: [
              { header: 'Expense account', flex: 4 },
              { header: 'Share', align: 'right', flex: 1 },
              { header: 'Amount', align: 'right', flex: 2 },
            ],
            rows: (data?.expenseByAccount ?? []).map((e) => ({
              cells: [
                `${e.accountCode} ${e.label}`.trim(),
                e.sharePct === null ? '—' : `${e.sharePct.toFixed(1)}%`,
                e.amount,
              ],
            })),
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
          <p className="mt-xxs text-body-sm text-text-secondary">Nothing was posted in this period. Try a longer one.</p>
        </>
      }
    >
      <div className="flex flex-col gap-lg">
        {/* ── The four headline figures ─────────────────────────────── */}
        <section aria-label="Headline figures">
          <FigureStrip columns="hero">
            {kpi('revenue') && (
              <KpiCard
                kpi={kpi('revenue')!}
                size="lg"
                priorLabel={vsPrior}
                trend={series.map((m) => m.revenue)}
                context={null}
                href={`/reports/profit-loss?${periodQuery}`}
              />
            )}
            {kpi('grossProfit') && (
              <KpiCard
                kpi={kpi('grossProfit')!}
                size="lg"
                priorLabel={vsPrior}
                trend={series.map((m) => m.grossProfit)}
                context={margin('grossMarginPct', 'gross margin')}
                href={`/reports/profit-loss?${periodQuery}`}
              />
            )}
            {kpi('netIncome') && (
              <KpiCard
                kpi={kpi('netIncome')!}
                size="lg"
                priorLabel={vsPrior}
                trend={series.map((m) => m.netIncome)}
                context={margin('netMarginPct', 'net margin')}
                href={`/reports/profit-loss?${periodQuery}`}
              />
            )}
            {kpi('endingCash') && (
              <KpiCard
                kpi={{ ...kpi('endingCash')!, label: 'Cash and bank' }}
                size="lg"
                priorLabel={vsPrior}
                trend={series.map((m) => m.endingCash)}
                context={runwayText}
                // How long the cash lasts says more than whether there is any.
                assessment={runway?.assessment ?? kpi('endingCash')!.assessment}
                href={`/reports/cash-flow?${periodQuery}`}
              />
            )}
          </FigureStrip>
        </section>

        {/* ── What stands out ───────────────────────────────────────── */}
        {data && data.insights.length > 0 && (
          <Card className="overflow-hidden">
            <PanelHeader title="What stands out" description={priorPeriod ? `${period}, against ${priorPeriod}` : period} />
            <div className="px-lg pt-xs pb-md">
              <InsightsList insights={data.insights} />
            </div>
          </Card>
        )}

        {/* ── The months, and where the money went ─────────────────── */}
        <div className="grid items-stretch gap-lg xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <PanelHeader
              title="Revenue and profit by month"
              description="Revenue and gross profit as columns, net profit as the line"
              action={<PanelLink to={`/reports/profit-loss?${periodQuery}`}>Profit &amp; Loss</PanelLink>}
            />
            <div className="px-lg pt-xs pb-md">
              <SeriesChart title="Revenue, gross profit and net profit by month" data={series} series={PROFIT_SERIES} />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <PanelHeader
              title="Where the money went"
              description="Operating expenses by account — the five largest, then the rest"
              action={<PanelLink to={`/reports/profit-loss?${periodQuery}`}>Profit &amp; Loss</PanelLink>}
            />
            <div className="px-lg pt-xs pb-md">
              {canDonut(expenseSlices) ? (
                <DonutChart
                  title="Operating expenses by account"
                  slices={expenseSlices}
                  palette={CATEGORY_PALETTE}
                  total={kpi('operatingExpenses')?.value ?? undefined}
                  centerLabel="Operating expenses"
                  labelHeader="Account"
                  onSelect={(code) =>
                    navigate(`/reports/general-ledger?view=accounts&account=${encodeURIComponent(code)}&${periodQuery}`)
                  }
                  selectVerb="Open the ledger for"
                />
              ) : (
                <>
                  <RankedBars
                    points={expenseSlices.map((s) => ({ key: s.key, label: s.label, value: s.value }))}
                    // In brackets, as every negative figure on the reports is.
                    format={(v) => parenNegative(v)}
                    hrefFor={(key) =>
                      key === OTHER_KEY
                        ? null
                        : `/reports/general-ledger?view=accounts&account=${encodeURIComponent(key)}&${periodQuery}`
                    }
                    emptyLabel="No operating expenses in this period."
                  />
                  {kpi('operatingExpenses') && (
                    <p className="mt-sm flex justify-between gap-sm border-t border-border pt-xs text-label-md text-text-primary">
                      <span>Operating expenses</span>
                      <span className="tabular">{parenNegative(kpi('operatingExpenses')!.value ?? 0)}</span>
                    </p>
                  )}
                  {expenseSlices.some((s) => s.value < 0) && (
                    <p className="mt-sm text-caption text-text-tertiary">
                      An account ran a credit this period, so the accounts are shown as bars rather than shares of a
                      whole.
                    </p>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>

        {/* ── Cash, the cash cycle, customers ───────────────────────── */}
        <div className="grid items-stretch gap-lg lg:grid-cols-3">
          <Card className="flex flex-col overflow-hidden">
            <PanelHeader
              title="Cash"
              description="Cash and bank at each month end"
              action={<PanelLink to={`/reports/cash-flow?${periodQuery}`}>Cash Flow</PanelLink>}
            />
            <div className="flex flex-1 flex-col gap-sm px-lg pt-xs pb-md">
              <CashBalanceChart compact title="Cash and bank at each month end" points={series} />
              <dl className="flex flex-col divide-y divide-border-light text-body-sm">
                {(['operatingCashFlow', 'runwayMonths'] as const).map((key) => {
                  const k = kpi(key);
                  if (!k) return null;
                  return (
                    <div key={key} className="py-xs">
                      <dt className="text-caption text-text-tertiary">{k.label}</dt>
                      <dd className="mt-[2px] flex items-center justify-between gap-sm">
                        <span className="tabular text-label-lg text-text-primary">
                          {k.value === null ? (kpiStatusText(k.status) ?? '—') : formatKpiValue(k.value, k.unit)}
                        </span>
                        <AssessmentPill assessment={k.assessment} />
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </Card>

          <Card className="flex flex-col overflow-hidden">
            <PanelHeader
              title="Cash cycle"
              description={`Days cash is tied up, as of ${formatShortDate(range.endDate)}`}
              action={<PanelLink to="/reports/ar-aging">AR Aging</PanelLink>}
            />
            <div className="px-lg pt-xs pb-md">
              <CashCycle kpis={{ dso: kpi('dso'), dio: kpi('dio'), dpo: kpi('dpo'), ccc: kpi('ccc') }} />
            </div>
          </Card>

          <Card className="flex flex-col overflow-hidden">
            <PanelHeader
              title="Customers"
              description={sales?.basis ? `Top five by sales · ${sales.basis}` : 'Top five by sales'}
              action={<PanelLink to="/reports/ar-aging">AR Aging</PanelLink>}
            />
            <div className="flex flex-1 flex-col gap-sm px-lg pt-xs pb-md">
              {sales && sales.top5SharePct !== null && (
                <div className="flex items-start justify-between gap-sm">
                  <p className="text-body-sm text-text-secondary">
                    The top five hold{' '}
                    <span className="tabular text-text-primary">{sales.top5SharePct.toFixed(1)}%</span> of sales
                  </p>
                  <AssessmentPill assessment={sales.assessment} />
                </div>
              )}
              <RankedBars
                points={[
                  ...(sales?.customers ?? []).map((c, i) => ({
                    key: c.customerId || `c-${i}`,
                    label: c.name,
                    value: c.amount,
                    hint: [
                      c.sharePct !== null ? `${c.sharePct.toFixed(1)}% of sales` : null,
                      c.invoices ? `${c.invoices} invoice${c.invoices === 1 ? '' : 's'}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  })),
                  ...(sales?.other
                    ? [{ key: '__other__', label: `Other customers (${sales.other.count})`, value: sales.other.amount }]
                    : []),
                ]}
                limit={6}
                format={formatMoney}
                hrefFor={(key) => (key.startsWith('c-') ? null : `/customers/${encodeURIComponent(key)}`)}
                emptyLabel="No invoiced sales in this period."
              />
            </div>
          </Card>
        </div>

        {/* ── Balance-sheet health ──────────────────────────────────── */}
        {data?.health && (
          <section aria-label="Business health" className="flex flex-col gap-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-sm">
              <h2 className="text-h5 text-text-primary">Business health</h2>
              <PanelLink to={`/reports/balance-sheet?asOf=${range.endDate}`}>
                Balance Sheet at {formatShortDate(range.endDate)}
              </PanelLink>
            </div>
            <FinancialHealthStrip health={data.health} />
          </section>
        )}

        {data?.budgetVsActual && <BudgetCard budget={data.budgetVsActual} />}
      </div>
    </ReportShell>
  );
}

function BudgetCard({ budget }: { budget: BudgetVsActual }) {
  const rows = [...budget.rows].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 8);
  return (
    <Card className="overflow-hidden">
      <PanelHeader
        title={`Budget against actual — ${budget.budget.name}`}
        description={`Calendar year ${budget.budget.fiscalYear}; the accounts furthest from budget first`}
        action={<PanelLink to={`/budgets/${encodeURIComponent(budget.budget.id)}`}>Open budget</PanelLink>}
      />
      <div className="px-lg pt-xs pb-md">
        <dl className="grid grid-cols-3 gap-md">
          {(
            [
              ['Budgeted', budget.totals.budgeted],
              ['Actual', budget.totals.actual],
              ['Variance', budget.totals.variance],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-caption text-text-tertiary">{label}</dt>
              <dd className="text-h4 tabular text-text-primary">{formatMoney(value)}</dd>
            </div>
          ))}
        </dl>
        <table className="mt-md w-full border-collapse text-body-sm">
          <caption className="sr-only">Accounts against budget</caption>
          <thead>
            <tr className="border-b border-border text-overline text-text-secondary">
              <th scope="col" className="py-xs text-left">
                Account
              </th>
              <th scope="col" className="py-xs text-right">
                Budget
              </th>
              <th scope="col" className="py-xs text-right">
                Actual
              </th>
              <th scope="col" className="py-xs text-right">
                Against budget
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tone = varianceTone(r);
              return (
                <tr key={r.accountId || r.accountCode} className="border-b border-border-light">
                  <td className="py-xs">
                    <span className="mr-xs tabular text-text-tertiary">{r.accountCode}</span>
                    {r.accountName}
                  </td>
                  <td className="py-xs text-right tabular">{formatMoney(r.budgeted)}</td>
                  <td className="py-xs text-right tabular">{formatMoney(r.actual)}</td>
                  <td
                    className={cn(
                      'py-xs text-right tabular',
                      tone === 'favourable' ? 'text-success' : tone === 'unfavourable' ? 'text-danger' : 'text-text-secondary',
                    )}
                  >
                    {varianceLabel(r, formatMoney)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
