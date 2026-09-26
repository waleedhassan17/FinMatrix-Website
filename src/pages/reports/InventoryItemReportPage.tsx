import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ExternalLink, Info, MousePointerClick } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { DetailLayout, RailSection } from '@/components/layout/DetailLayout';
import { PageMessage } from '@/components/layout/PageState';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { KeyValueList } from '@/components/ui/KeyValueList';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { isPathAllowedForRole } from '@/config/routeAccess';
import { PanelHeader } from '@/features/dashboard/PanelHeader';
import { ChartTypeToggle, MoreMetricsMenu } from '@/features/reports/ExplorerControls';
import { Change } from '@/features/reports/FigureStrip';
import { ItemMonthPanel } from '@/features/reports/ItemSalesEntries';
import { MetricChart, type ChartType } from '@/features/reports/MetricChart';
import { MetricTable } from '@/features/reports/MetricTable';
import { MetricTabs } from '@/features/reports/MetricTabs';
import { PeriodMenu } from '@/features/reports/PeriodMenu';
import { RankedBars } from '@/features/reports/RankedBars';
import { ReportShell } from '@/features/reports/ReportShell';
import { useFeature } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { STOCK_STATUS_DISPLAY, formatQty } from '@/models/inventory';
import { itemExplorerHref } from '@/models/inventoryValuation';
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
  getInventoryValuation,
  getItemPerformance,
} from '@/networks/reports/inventoryValuationNetwork';
import { selectRole } from '@/store/authSlice';
import { useAppSelector } from '@/store/store';
import { compactMoney, formatMoney } from '@/utils/money';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_START = /^\d{4}-\d{2}-01$/;
const PERIOD = /^\d{4}-\d{2}$/;

/** The figures across the top — the four a reader asks about first. */
const HEADLINE: readonly ExplorerMetricKey[] = ['revenue', 'grossProfit', 'marginPct', 'unitsSold'];
/** Everything else, one menu away. */
const MORE: readonly ExplorerMetricKey[] = EXPLORER_METRICS.map((m) => m.key).filter(
  (k) => !HEADLINE.includes(k),
);

const WINDOW_LABELS = { last6m: '6M', last12m: '12M', last24m: '24M', ytd: 'YTD', lastYear: 'Last year' } as const;

/** A missing item or a malformed id is an answer, not something to retry. */
const retryUnlessFinal = (count: number, error: unknown) =>
  !(error instanceof ApiError && (error.status === 404 || error.status === 400)) && count < 1;

/** "45 units", "1 unit", "12 kg" — only the generic word takes a plural. */
const unitWord = (uom: string, qty: number) => (uom === 'unit' && qty !== 1 ? 'units' : uom);

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
 * One item, explored.
 *
 * Built as one chart card, the way a dashboard reads: the four headline
 * figures ARE the chart's tabs — choose one and the chart below draws it month
 * by month — with the other six metrics a menu away. Under it, every metric by
 * month in one table; choosing a row charts it, choosing a month opens the
 * documents behind it in a side panel, so the page itself never moves.
 *
 * The rail says where the stock stands today and who buys it. "Switch item"
 * moves to another item without going back, keeping the window.
 *
 * Everything chosen — window, metric, chart type, month — lives in the URL,
 * so the view can be shared and Back retraces it.
 */
export default function InventoryItemReportPage() {
  const { itemId = '' } = useParams<{ itemId: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
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
  // The window before, for the changes under each figure. Optional.
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
  // For "Switch item". Usually already cached by the page this was opened from.
  const itemsQuery = useQuery({
    queryKey: ['reports', 'inventory-valuation'],
    queryFn: getInventoryValuation,
    staleTime: 60_000,
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

  const itemOptions = useMemo(
    () =>
      [...(itemsQuery.data?.rows ?? [])]
        .sort((a, b) => a.itemName.localeCompare(b.itemName))
        .map((r) => ({ value: r.itemId, label: r.sku ? `${r.itemName} · ${r.sku}` : r.itemName })),
    [itemsQuery.data],
  );

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

  const onHand =
    facts?.qtyOnHand ??
    [...months].reverse().find((m) => m.values.closingQty !== null)?.values.closingQty ??
    null;

  const exportCsv = () => {
    const out: CsvRow[] = [
      [`${itemName}${sku ? ` (${sku})` : ''}`],
      [rangeLabel(range.startDate, range.endDate)],
      ['Revenue net of tax and invoice discounts; stock at each month end'],
      [],
      ...explorerCsvRows(months),
    ];
    downloadCsv(
      csvFilename(`item-${(sku || itemName).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, range),
      toCsv(out),
    );
  };

  // ── The figure tabs, each against the window before ─────────────────────
  const priorWords = PERIOD_START.test(range.startDate)
    ? `prior ${monthsSpanned(range)} month${monthsSpanned(range) === 1 ? '' : 's'}`
    : 'prior period';
  const priorEmpty =
    !!priorPerf && priorPerf.totals.revenue === 0 && priorPerf.totals.unitsSold === 0;
  const t = perf?.totals;
  const p = priorPerf?.totals;
  const caption = (
    key: ExplorerMetricKey,
    current: number | null,
    before: number | null | undefined,
  ): ReactNode => {
    if (current === null) return 'No sales in this window';
    if (before === undefined) return undefined;
    // Nothing sold before: "+Rs 82K" against it says nothing. Said once.
    if (priorEmpty) return key === 'revenue' ? `No sales in the ${priorWords}` : ' ';
    const change = metricChange(key, current, before);
    const text = formatChange(key, change);
    if (!text) return before === null ? ' ' : `Unchanged on the ${priorWords}`;
    const tone = changeTone(key, change);
    return (
      <>
        {tone ? <Change text={text} good={tone === 'good'} /> : <span className="tabular">{text}</span>}{' '}
        vs {priorWords}
      </>
    );
  };
  const tabs = HEADLINE.map((key) => {
    const current = t ? (key === 'marginPct' ? t.marginPct : t[key as 'revenue' | 'grossProfit' | 'unitsSold']) : null;
    const before = p === undefined ? undefined : key === 'marginPct' ? p.marginPct : p[key as 'revenue' | 'grossProfit' | 'unitsSold'];
    return {
      key,
      label: explorerMetric(key).label,
      value: formatMetric(key, current),
      tone: current !== null && current < 0 ? ('danger' as const) : ('default' as const),
      caption: t ? caption(key, current, before) : 'Not available',
    };
  });

  // ── Stock position ─────────────────────────────────────────────────────
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
      `${Math.round(perf.estimatedCogsShare * 100)}% of the cost of sales was split across items sharing an invoice; each invoice's total is exact.`,
    );
  }
  if (perf?.points.some((pt) => !pt.costKnown)) {
    notes.push('Some sales carry no recorded cost, so their margin reads high.');
  }
  if (history?.coverage.message) notes.push(history.coverage.message);

  // One line under the chart: the dashed average, and the best month.
  const legend: string[] = [];
  if (summary.average !== null && summary.readings > 1 && def.kind !== 'ratio') {
    legend.push(`Average ${formatMetric(metric, summary.average)} a month`);
  }
  if (summary.best) legend.push(`Best ${summary.best.label} · ${formatMetric(metric, summary.best.value)}`);

  const subtitle = [
    sku,
    facts?.category,
    onHand !== null ? `${formatMetric('closingQty', onHand)} ${facts ? unitWord(facts.unitOfMeasure, onHand) : 'on hand'}${facts ? ' on hand' : ''}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ReportShell
      title={itemName}
      subtitle={subtitle || undefined}
      back={{ to: '/reports/inventory-valuation', label: 'Inventory Valuation' }}
      actions={
        <>
          {itemOptions.length > 1 && (
            <Combobox
              compact
              value={itemId}
              onChange={(id) => {
                if (id !== itemId) navigate(itemExplorerHref(id, range));
              }}
              options={itemOptions}
              placeholder="Switch item"
              searchPlaceholder="Find an item…"
              containerClassName="hidden w-60 sm:flex"
            />
          )}
          {showOpenItem && (
            <Button asChild variant="secondary" size="sm">
              <Link to={`/inventory/${itemId}`}>
                <ExternalLink className="size-4" aria-hidden="true" />
                Open item
              </Link>
            </Button>
          )}
        </>
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
        <PeriodMenu
          layout="segments"
          presets={TREND_PRESETS}
          shortLabels={WINDOW_LABELS}
          value={range}
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
              action={
                belowReorder ? (
                  <StatusBadge status={STOCK_STATUS_DISPLAY.low.badge} label="Below reorder point" />
                ) : undefined
              }
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
                  { label: 'Stock value', value: facts ? formatMoney(facts.stockValue) : '—', hidden: !facts },
                  { label: 'Average cost', value: facts ? formatMoney(facts.unitCost) : '—', hidden: !facts },
                  {
                    label: 'Selling price',
                    value: facts ? (
                      <>
                        {formatMoney(facts.sellingPrice)}
                        {listMargin !== null && (
                          <span
                            className={cn(
                              'block text-caption',
                              listMargin < 0 ? 'text-danger' : 'text-text-tertiary',
                            )}
                          >
                            {listMargin < 0
                              ? `${Math.abs(listMargin).toFixed(1)}% below cost`
                              : `${listMargin.toFixed(1)}% margin`}
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
                        <span className="text-text-tertiary">No recent sales</span>
                      ) : (
                        <span className={cover > 0 && cover <= 14 ? 'text-warning' : undefined}>
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
              <RailSection title="Notes">
                <ul className="flex flex-col gap-sm">
                  {notes.map((n) => (
                    <li key={n} className="flex items-start gap-xs text-caption text-text-secondary">
                      <Info className="mt-[2px] size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                      {n}
                    </li>
                  ))}
                </ul>
              </RailSection>
            )}
          </>
        }
      >
        {/* ── One chart card: the figures choose what the chart draws ─── */}
        <Card className="overflow-hidden">
          <MetricTabs
            items={tabs}
            selected={HEADLINE.includes(metric) ? metric : null}
            onSelect={(k) => update({ metric: k })}
            label="Metric to chart"
          />
          <div className="border-t border-border-light px-lg pt-md pb-sm">
            <div className="flex flex-wrap items-start justify-between gap-sm">
              <div className="min-w-0">
                <h2 className="text-h5 text-text-primary">{def.label} by month</h2>
                <p className="mt-[2px] text-caption text-text-tertiary">{def.description}</p>
              </div>
              <div className="flex items-center gap-xs">
                <MoreMetricsMenu
                  metrics={MORE}
                  value={metric}
                  onChange={(k) => update({ metric: k })}
                  disabled={empty}
                />
                <ChartTypeToggle value={chart} onChange={(c) => update({ chart: c === 'bar' ? null : c })} />
              </div>
            </div>

            {summary.readings === 0 ? (
              <p className="py-xxl text-center text-body-sm text-text-tertiary">
                Nothing recorded for {def.label.toLowerCase()} in this window.
              </p>
            ) : (
              <MetricChart
                className="mt-md"
                metric={metric}
                type={chart}
                points={months.map((m) => ({ period: m.period, label: m.label, value: m.values[metric] }))}
                selected={selectedPeriod}
                onSelect={(period) => update({ month: period }, true)}
                average={summary.readings > 1 && def.kind !== 'ratio' ? summary.average : null}
              />
            )}

            <div className="mt-xs flex flex-col gap-xxs border-t border-border-light pt-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-xs text-caption text-text-secondary">
                {legend.length > 0 && def.kind !== 'ratio' && summary.readings > 1 && (
                  <span aria-hidden="true" className="inline-block w-4 border-t border-dashed border-neutral-400" />
                )}
                <span className="truncate">{legend.join(' · ') || ' '}</span>
              </p>
              <p className="flex items-center gap-xs text-caption text-text-tertiary print:hidden">
                <MousePointerClick className="size-4 shrink-0 text-primary" aria-hidden="true" />
                Click a month to see its documents
              </p>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <PanelHeader
            title="Monthly breakdown"
            description="Every figure by month · choose a row to chart it"
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

      <ItemMonthPanel
        itemId={itemId}
        itemName={itemName}
        period={selectedMonth ? selectedMonth.period : null}
        range={selectedMonth ? monthRange(selectedMonth.period, range) : null}
        onClose={() => update({ month: null })}
      />
    </ReportShell>
  );
}
