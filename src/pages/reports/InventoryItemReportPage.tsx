import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ExternalLink, Info } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { DetailLayout, RailSection } from '@/components/layout/DetailLayout';
import { PageMessage } from '@/components/layout/PageState';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { KeyValueList } from '@/components/ui/KeyValueList';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { isPathAllowedForRole } from '@/config/routeAccess';
import { PanelHeader } from '@/features/dashboard/PanelHeader';
import { ChartTypeToggle, MetricPicker } from '@/features/reports/ExplorerControls';
import { Change, Figure, FigureStrip } from '@/features/reports/FigureStrip';
import { ItemSalesEntries } from '@/features/reports/ItemSalesEntries';
import { MetricChart, type ChartType } from '@/features/reports/MetricChart';
import { MetricTable } from '@/features/reports/MetricTable';
import { PeriodPicker } from '@/features/reports/PeriodPicker';
import { RankedBars } from '@/features/reports/RankedBars';
import { ReportShell } from '@/features/reports/ReportShell';
import { useFeature } from '@/hooks/useCapability';
import { STOCK_STATUS_DISPLAY, formatQty } from '@/models/inventory';
import {
  EXPLORER_METRICS,
  buildExplorerMonths,
  changeTone,
  daysOfCover,
  daysSince,
  defaultMetric,
  explorerCsvRows,
  explorerMetric,
  formatChange,
  formatMetric,
  isExplorerMetricKey,
  metricChange,
  summarizeMetric,
  type ExplorerMetricKey,
  type ExplorerMonth,
} from '@/models/itemExplorer';
import { csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import {
  TREND_PRESETS,
  endOfMonth,
  formatShortDate,
  monthsSpanned,
  priorWindow,
  rangeLabel,
  trailingMonths,
  type ReportRange,
} from '@/models/reportPeriod';
import { isoDate } from '@/models/document';
import { ApiError } from '@/networks/network/apiHelpers';
import {
  getInventoryItemHistory,
  getItemPerformance,
} from '@/networks/reports/inventoryValuationNetwork';
import { selectRole } from '@/store/authSlice';
import { useAppSelector } from '@/store/store';
import { compactMoney, formatMoney } from '@/utils/money';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_START = /^\d{4}-\d{2}-01$/;
const PERIOD = /^\d{4}-\d{2}$/;

/** A missing item or a malformed id is an answer, not something to retry. */
const retryUnlessFinal = (count: number, error: unknown) =>
  !(error instanceof ApiError && (error.status === 404 || error.status === 400)) && count < 1;

/** "45 units", "1 unit", "12 kg" — only the generic word takes a plural. */
const unitWord = (uom: string, qty: number) => (uom === 'unit' && qty !== 1 ? 'units' : uom);

const shortRange = (r: ReportRange) => `${formatShortDate(r.startDate)} – ${formatShortDate(r.endDate)}`;

/** One month, clipped to the window — the first and last months may be partial. */
const monthRange = (period: string, window: ReportRange): ReportRange => {
  const first = `${period}-01`;
  const last = isoDate(endOfMonth(new Date(`${first}T00:00:00`)));
  return {
    startDate: first < window.startDate ? window.startDate : first,
    endDate: last > window.endDate ? window.endDate : last,
  };
};

/**
 * One item, explored: every figure it has, month by month.
 *
 * Laid out the way a financial data terminal lays out a company. The headline
 * figures for the window sit on top, each against the window before it. Below
 * them, one metric is charted — any of ten, as columns or a line — and under
 * the chart every metric sits in a table of months. Choosing a row charts it;
 * choosing a month opens the documents behind it, so any bar can be traced to
 * the invoices that made it.
 *
 * Sales and stock come from two endpoints over the same window and are joined
 * by month. Each fails on its own: an older server without stock values, or a
 * failed request, leaves the other half of the page working.
 *
 * Everything the reader chooses — window, metric, chart type, month — lives in
 * the URL, so the view can be shared and Back retraces it.
 */
export default function InventoryItemReportPage() {
  const { itemId = '' } = useParams<{ itemId: string }>();
  const [params, setParams] = useSearchParams();
  const role = useAppSelector(selectRole);
  const inventoryOn = useFeature('inventory');

  const range: ReportRange = useMemo(() => {
    const from = params.get('from');
    const to = params.get('to');
    return from && to && ISO.test(from) && ISO.test(to) && from <= to
      ? { startDate: from, endDate: to }
      : trailingMonths(12);
  }, [params]);
  const prior = useMemo(() => priorWindow(range), [range]);
  const chart: ChartType = params.get('chart') === 'line' ? 'line' : 'bar';
  const monthParam = params.get('month');
  const selectedPeriod = monthParam && PERIOD.test(monthParam) ? monthParam : null;

  const update = (patch: Record<string, string | null>, push = false) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: !push },
    );

  const perfQuery = useQuery({
    queryKey: ['reports', 'item-performance', itemId, range],
    queryFn: () => getItemPerformance(itemId, range),
    enabled: !!itemId,
    placeholderData: keepPreviousData,
    retry: retryUnlessFinal,
  });
  // The window before, for the headline changes. Optional: without it the
  // figures stand alone.
  const priorQuery = useQuery({
    queryKey: ['reports', 'item-performance', itemId, prior],
    queryFn: () => getItemPerformance(itemId, prior),
    enabled: !!itemId,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ['reports', 'inventory-item-history', itemId, range],
    queryFn: () => getInventoryItemHistory(itemId, 12, range),
    enabled: !!itemId,
    placeholderData: keepPreviousData,
    retry: retryUnlessFinal,
  });

  const perf = perfQuery.data;
  const priorPerf = priorQuery.data;
  const history = historyQuery.data;
  const months = useMemo(() => buildExplorerMonths(perf, history), [perf, history]);

  const empty = useMemo(
    () =>
      EXPLORER_METRICS.filter((m) => months.every((mo) => mo.values[m.key] === null)).map((m) => m.key),
    [months],
  );
  const metricParam = params.get('metric');
  const metric: ExplorerMetricKey =
    isExplorerMetricKey(metricParam) && !empty.includes(metricParam) ? metricParam : defaultMetric(months);
  const def = explorerMetric(metric);
  const summary = summarizeMetric(months, metric);
  const selectedMonth = months.find((m) => m.period === selectedPeriod) ?? null;

  const notFound = [perfQuery.error, historyQuery.error].some(
    (e) => e instanceof ApiError && e.status === 404 && e.code === 'ITEM_NOT_FOUND',
  );
  const badId = [perfQuery.error, historyQuery.error].some(
    (e) => e instanceof ApiError && e.status === 400,
  );
  if (notFound || badId) {
    return (
      <PageMessage
        title="This item could not be found"
        description="It may have been deleted, or it belongs to another company."
        backTo="/reports/inventory-valuation"
        backLabel="Inventory Valuation"
      />
    );
  }

  const itemName = perf?.itemName || history?.itemName || 'Item';
  const sku = perf?.sku || history?.sku || '';
  const facts = perf?.item ?? null;
  const showOpenItem = inventoryOn && isPathAllowedForRole(`/inventory/${itemId}`, role);
  const customersAllowed = isPathAllowedForRole('/customers/x', role);

  const exportCsv = () => {
    const out: CsvRow[] = [
      [`${itemName}${sku ? ` (${sku})` : ''}`],
      [rangeLabel(range.startDate, range.endDate)],
      ['Revenue net of tax and invoice discounts; stock at each month end'],
      [],
      ...explorerCsvRows(months),
    ];
    downloadCsv(csvFilename(`item-${(sku || itemName).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, range), toCsv(out));
  };

  // ── Headline figures, each against the window before ───────────────────
  // The header names the comparison window in full; the captions say it
  // short, so four figures do not repeat one long date range.
  const priorWords = PERIOD_START.test(range.startDate)
    ? `the ${monthsSpanned(range)} month${monthsSpanned(range) === 1 ? '' : 's'} before`
    : 'the period before';
  const priorEmpty =
    !!priorPerf && priorPerf.totals.revenue === 0 && priorPerf.totals.unitsSold === 0;
  const headline = (
    key: ExplorerMetricKey,
    current: number | null,
    before: number | null | undefined,
  ): ReactNode => {
    if (current === null) return 'No sales in this window';
    if (before === undefined) return undefined;
    // Nothing sold in the window before: "+Rs 82K" against it is true and says
    // nothing, and a margin has nothing to move from. Said once, on revenue.
    if (priorEmpty) return key === 'revenue' ? `Nothing sold in ${priorWords}` : undefined;
    const change = metricChange(key, current, before);
    const text = formatChange(key, change);
    if (!text) return before === null ? undefined : `Unchanged on ${priorWords}`;
    const tone = changeTone(key, change);
    return (
      <>
        {tone ? <Change text={text} good={tone === 'good'} /> : <span className="tabular">{text}</span>}{' '}
        on {priorWords}
      </>
    );
  };
  const t = perf?.totals;
  const p = priorPerf?.totals;

  const onHand = facts?.qtyOnHand ?? [...months].reverse().find((m) => m.values.closingQty !== null)?.values.closingQty ?? null;
  const cover = facts && t ? daysOfCover(facts.qtyOnHand, t.unitsSold, range) : null;
  const sinceSold = daysSince(facts?.lastSoldDate ?? null);
  const belowReorder = !!facts && facts.reorderPoint > 0 && facts.qtyOnHand <= facts.reorderPoint;
  const listMargin =
    facts && facts.sellingPrice > 0
      ? ((facts.sellingPrice - facts.unitCost) / facts.sellingPrice) * 100
      : null;

  const notes: string[] = [];
  if (perf && perf.estimatedCogsShare > 0) {
    notes.push(
      `${Math.round(perf.estimatedCogsShare * 100)}% of this item's cost of sales was split across items that shared an invoice. Each invoice's total cost is exact; how it divides between the items on it is an estimate.`,
    );
  }
  if (perf?.points.some((pt) => !pt.costKnown)) {
    notes.push('Some sales carry no recorded cost, so their margin reads higher than it was.');
  }
  if (history?.coverage.message) notes.push(history.coverage.message);

  const summaryParts: string[] = [];
  if (summary.value !== null) {
    summaryParts.push(
      `${def.kind === 'flow' ? 'Total' : def.kind === 'level' ? 'Latest' : 'Over the window'} ${formatMetric(metric, summary.value)}`,
    );
  }
  if (summary.average !== null && summary.readings > 1 && def.kind !== 'ratio') {
    summaryParts.push(`${formatMetric(metric, summary.average)} a month on average (dashed)`);
  }
  if (summary.best) summaryParts.push(`best ${summary.best.label} (${formatMetric(metric, summary.best.value)})`);
  if (summary.worst) summaryParts.push(`lowest ${summary.worst.label} (${formatMetric(metric, summary.worst.value)})`);

  return (
    <ReportShell
      title={itemName}
      subtitle={[sku && `SKU ${sku}`, facts?.category].filter(Boolean).join(' · ') || undefined}
      back={{ to: '/reports/inventory-valuation', label: 'Inventory Valuation' }}
      meta={[
        rangeLabel(range.startDate, range.endDate),
        `Compared with ${shortRange(prior)}`,
        'Revenue net of tax and discounts',
      ]}
      actions={
        showOpenItem ? (
          <Button asChild variant="secondary" size="sm">
            <Link to={`/inventory/${itemId}`}>
              <ExternalLink className="size-4" aria-hidden="true" />
              Open item
            </Link>
          </Button>
        ) : undefined
      }
      onExportCsv={exportCsv}
      pdf={{
        periodLabel: rangeLabel(range.startDate, range.endDate),
        basis: 'Revenue net of tax and discounts · stock at each month end',
        cacheKey: `${itemId}|${perfQuery.dataUpdatedAt}|${historyQuery.dataUpdatedAt}`,
        build: () => [
          {
            title: `${itemName}${sku ? ` · ${sku}` : ''} — monthly figures`,
            columns: [
              { header: 'Month', flex: 1.2 },
              { header: 'Units sold', align: 'right', flex: 1 },
              { header: 'Revenue', align: 'right', flex: 1.6 },
              { header: 'Cost of sales', align: 'right', flex: 1.6 },
              { header: 'Gross profit', align: 'right', flex: 1.6 },
              { header: 'Margin', align: 'right', flex: 1 },
              { header: 'On hand', align: 'right', flex: 1 },
              { header: 'Stock value', align: 'right', flex: 1.6 },
            ],
            rows: [
              ...months.map((m: ExplorerMonth) => ({
                cells: [
                  m.label,
                  formatMetric('unitsSold', m.values.unitsSold),
                  m.values.revenue,
                  m.values.cogs,
                  m.values.grossProfit,
                  formatMetric('marginPct', m.values.marginPct),
                  formatMetric('closingQty', m.values.closingQty),
                  m.values.closingValue,
                ],
              })),
              {
                cells: [
                  'Window',
                  formatMetric('unitsSold', t?.unitsSold ?? null),
                  t?.revenue ?? null,
                  t?.cogs ?? null,
                  t?.grossProfit ?? null,
                  formatMetric('marginPct', t?.marginPct ?? null),
                  '',
                  '',
                ],
                grand: true,
              },
            ],
          },
          ...(perf && perf.customers.length > 0
            ? [
                {
                  title: 'Top customers',
                  columns: [
                    { header: 'Customer', flex: 4 },
                    { header: 'Units', align: 'right' as const, flex: 1 },
                    { header: 'Revenue', align: 'right' as const, flex: 2 },
                    { header: 'Gross profit', align: 'right' as const, flex: 2 },
                  ],
                  rows: perf.customers.map((c) => ({
                    cells: [c.customerName, formatQty(c.unitsSold), c.revenue, c.grossProfit],
                  })),
                },
              ]
            : []),
        ],
      }}
      controls={
        <PeriodPicker
          value={range}
          presets={TREND_PRESETS}
          onChange={(r) => update({ from: r.startDate, to: r.endDate, month: null })}
        />
      }
      isLoading={perfQuery.isLoading && historyQuery.isLoading}
      isRefetching={perfQuery.isFetching || historyQuery.isFetching}
      error={perfQuery.error && historyQuery.error ? (perfQuery.error as Error) : null}
      onRetry={() => {
        void perfQuery.refetch();
        void historyQuery.refetch();
      }}
      hasData={months.length > 0}
      empty={
        <>
          <p className="text-label-lg text-text-primary">Nothing recorded for this item</p>
          <p className="mt-xxs text-body-sm text-text-secondary">
            It has not been received, sold or adjusted in this window.
          </p>
        </>
      }
    >
      <DetailLayout
        aside={
          <>
            <RailSection
              title="Stock position"
              action={belowReorder ? <StatusBadge status={STOCK_STATUS_DISPLAY.low.badge} label="Below reorder point" /> : undefined}
            >
              <KeyValueList
                items={[
                  {
                    label: 'On hand',
                    value:
                      onHand === null
                        ? '—'
                        : `${formatMetric('closingQty', onHand)}${facts ? ` ${unitWord(facts.unitOfMeasure, onHand)}` : ''}`,
                    emphasis: true,
                  },
                  { label: 'Average cost', value: facts ? formatMoney(facts.unitCost) : '—', hidden: !facts },
                  { label: 'Stock value', value: facts ? formatMoney(facts.stockValue) : '—', hidden: !facts },
                  {
                    label: 'Selling price',
                    value: facts ? (
                      <>
                        {formatMoney(facts.sellingPrice)}
                        {listMargin !== null && (
                          <span
                            className={
                              listMargin < 0
                                ? 'block text-caption text-danger'
                                : 'block text-caption text-text-tertiary'
                            }
                          >
                            {listMargin < 0
                              ? `${Math.abs(listMargin).toFixed(1)}% below average cost`
                              : `${listMargin.toFixed(1)}% margin at average cost`}
                          </span>
                        )}
                      </>
                    ) : (
                      '—'
                    ),
                    hidden: !facts || facts.sellingPrice <= 0,
                  },
                  {
                    label: 'Reorder point',
                    value: facts ? formatQty(facts.reorderPoint) : '—',
                    hidden: !facts || facts.reorderPoint <= 0,
                  },
                  {
                    label: 'Days of cover',
                    value:
                      cover === null ? (
                        <span className="text-text-tertiary">No sales to measure by</span>
                      ) : (
                        <span className={cover <= 14 && (facts?.qtyOnHand ?? 0) > 0 ? 'text-warning' : undefined}>
                          {cover === 0
                            ? 'Out of stock'
                            : cover > 365
                              ? 'Over a year'
                              : `${cover.toLocaleString('en-US')} day${cover === 1 ? '' : 's'}`}
                        </span>
                      ),
                    hidden: !facts,
                  },
                  {
                    label: 'Last sold',
                    value: facts?.lastSoldDate ? (
                      <>
                        {formatShortDate(facts.lastSoldDate)}
                        {sinceSold !== null && (
                          <span className="block text-caption text-text-tertiary">
                            {sinceSold === 0 ? 'Today' : `${sinceSold} day${sinceSold === 1 ? '' : 's'} ago`}
                          </span>
                        )}
                      </>
                    ) : (
                      'Never'
                    ),
                    hidden: !facts,
                  },
                ]}
              />
              <p className="mt-sm text-caption text-text-tertiary">As of today, at weighted-average cost.</p>
            </RailSection>

            {perf && (
              <RailSection title="Top customers">
                <RankedBars
                  points={perf.customers.map((c, i) => ({
                    key: c.customerId ?? `none-${i}`,
                    label: c.customerName,
                    value: c.revenue,
                    hint: `${formatQty(c.unitsSold)} units · ${compactMoney(c.grossProfit)} gross profit`,
                  }))}
                  format={(v) => formatMoney(v)}
                  hrefFor={
                    customersAllowed
                      ? (key) => (key.startsWith('none-') ? null : `/customers/${key}`)
                      : undefined
                  }
                  emptyLabel="Nobody bought it in this window."
                />
                {perf.otherCustomers.count > 0 && (
                  <p className="mt-sm text-caption text-text-tertiary">
                    And {perf.otherCustomers.count} more · {formatMoney(perf.otherCustomers.revenue)}
                  </p>
                )}
              </RailSection>
            )}

            {notes.length > 0 && (
              <RailSection title="About these figures">
                <ul className="flex flex-col gap-sm">
                  {notes.map((n) => (
                    <li key={n} className="flex items-start gap-xs text-caption text-text-secondary">
                      <Info className="mt-[2px] size-3.5 shrink-0" aria-hidden="true" />
                      {n}
                    </li>
                  ))}
                </ul>
              </RailSection>
            )}
          </>
        }
      >
        <FigureStrip>
          <Figure
            label="Revenue"
            value={t ? t.revenue : '—'}
            caption={t ? headline('revenue', t.revenue, p?.revenue) : 'Not available'}
          />
          <Figure
            label="Gross profit"
            value={t ? t.grossProfit : '—'}
            tone={t && t.grossProfit < 0 ? 'danger' : 'default'}
            caption={t ? headline('grossProfit', t.grossProfit, p?.grossProfit) : 'Not available'}
          />
          <Figure
            label="Margin"
            value={formatMetric('marginPct', t?.marginPct ?? null)}
            tone={t?.marginPct !== null && t?.marginPct !== undefined && t.marginPct < 0 ? 'danger' : 'default'}
            caption={t ? headline('marginPct', t.marginPct, p ? p.marginPct : undefined) : 'Not available'}
          />
          <Figure
            label="Units sold"
            value={formatMetric('unitsSold', t?.unitsSold ?? null)}
            caption={t ? headline('unitsSold', t.unitsSold, p?.unitsSold) : 'Not available'}
          />
        </FigureStrip>

        <Card className="overflow-hidden">
          <PanelHeader
            title={def.label}
            description={def.description}
            action={<ChartTypeToggle value={chart} onChange={(c) => update({ chart: c === 'bar' ? null : c })} />}
          />
          <div className="flex flex-col gap-md px-lg py-md">
            <MetricPicker
              value={metric}
              onChange={(k) => update({ metric: k })}
              disabled={empty}
            />
            {summary.readings === 0 ? (
              <p className="py-xl text-center text-body-sm text-text-tertiary">
                Nothing recorded for {def.label.toLowerCase()} in this window.
              </p>
            ) : (
              <MetricChart
                metric={metric}
                type={chart}
                points={months.map((m) => ({ period: m.period, label: m.label, value: m.values[metric] }))}
                selected={selectedPeriod}
                onSelect={(period) => update({ month: period }, true)}
                average={summary.readings > 1 ? summary.average : null}
              />
            )}
            <div className="flex flex-col gap-xxs border-t border-border-light pt-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-caption text-text-secondary">
                {summaryParts.length > 0 ? summaryParts.join(' · ') : 'No readings in this window.'}
              </p>
              <p className="text-caption text-text-tertiary print:hidden">
                Choose a month to see the documents behind it.
              </p>
            </div>
          </div>
        </Card>

        {selectedMonth && (
          <ItemSalesEntries
            key={selectedMonth.period}
            itemId={itemId}
            label={selectedMonth.label}
            range={monthRange(selectedMonth.period, range)}
            onClose={() => update({ month: null })}
          />
        )}

        <Card className="overflow-hidden">
          <PanelHeader
            title="Monthly figures"
            description="Choose a metric to chart it, or a month to see its documents"
          />
          <MetricTable
            months={months}
            metric={metric}
            onMetric={(k) => update({ metric: k })}
            selectedPeriod={selectedPeriod}
            onPeriod={(period) => update({ month: period }, true)}
            hidden={EXPLORER_METRICS.filter((m) => (m.group === 'sales' ? !perf : !history)).map((m) => m.key)}
          />
        </Card>
      </DetailLayout>
    </ReportShell>
  );
}
