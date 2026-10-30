import { useQuery, type Query } from '@tanstack/react-query';
import { ExternalLink, Info, Maximize2, MousePointerClick } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { DetailLayout } from '@/components/layout/DetailLayout';
import { PageMessage } from '@/components/layout/PageState';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Field';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { isPathAllowedForRole } from '@/config/routeAccess';
import { PanelHeader } from '@/features/dashboard/PanelHeader';
import { ItemPhotoDialog } from '@/features/inventory/ItemPhotoDialog';
import { ItemThumb } from '@/features/inventory/ItemThumb';
import { ChartTypeToggle, MoreMetricsMenu } from '@/features/reports/ExplorerControls';
import { ItemPriceMargin } from '@/features/reports/ItemPriceMargin';
import { ItemRevenueBreakdown, type BreakdownView } from '@/features/reports/ItemRevenueBreakdown';
import { ItemMonthPanel } from '@/features/reports/ItemSalesEntries';
import { ItemStockPosition } from '@/features/reports/ItemStockPosition';
import { MetricChart, type ChartType } from '@/features/reports/MetricChart';
import { MetricTable } from '@/features/reports/MetricTable';
import { MetricTabs, type MetricTab } from '@/features/reports/MetricTabs';
import { PeriodMenu } from '@/features/reports/PeriodMenu';
import { ReportShell } from '@/features/reports/ReportShell';
import { useFeature } from '@/hooks/useCapability';
import { formatQty } from '@/models/inventory';
import { itemExplorerHref } from '@/models/inventoryValuation';
import {
  CHANNEL_LABEL,
  EXPLORER_METRICS,
  STOCK_BADGE,
  buildExplorerMonths,
  changeTone,
  comparisonCaption,
  coverText,
  daysSince,
  defaultMetric,
  explorerCsvRows,
  explorerMetric,
  formatChange,
  formatMetric,
  hasChannelBreakdown,
  isExplorerMetricKey,
  itemCover,
  metricChange,
  monthsWithSales,
  priceAndMargin,
  stockBadge,
  summarizeMetric,
  unitsText,
  type BreakdownDimension,
  type ExplorerMetricKey,
  type ExplorerMonth,
} from '@/models/itemExplorer';
import { csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import {
  TREND_PRESETS,
  endOfMonth,
  formatShortDate,
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

const ISO = /^\d{4}-\d{2}-\d{2}$/;
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
 * Laid out as a record page, the way an enterprise system shows one thing:
 * who it is across the top — photo, name, one badge for the state of its
 * stock — then how it is doing, then what surrounds it.
 *
 *   · The figures are the chart's tabs: choose one and the chart below draws
 *     it month by month; the other six metrics are a menu away. Each figure
 *     carries its move against the window before, and its shape.
 *   · Under the chart, two tabs: the revenue broken down — by customer, or by
 *     channel when the item went out both ways, as a ring or bars — and every
 *     metric by month in one table.
 *   · The rail says where the stock stands today and what a unit earns.
 *
 * Choosing a month opens the documents behind it in a side panel, so the
 * page never moves. Everything chosen — window, metric, chart, breakdown,
 * tab, month — lives in the URL, so the view can be shared and Back retraces
 * the drill-ins.
 */
export default function InventoryItemReportPage() {
  const { itemId = '' } = useParams<{ itemId: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const role = useAppSelector(selectRole);
  const inventoryOn = useFeature('inventory');
  const [photoOpen, setPhotoOpen] = useState(false);

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
  const tab = params.get('tab') === 'months' ? 'months' : 'revenue';
  const mix: BreakdownDimension = params.get('mix') === 'channel' ? 'channel' : 'customer';
  const mixChart: BreakdownView = params.get('mixChart') === 'bar' ? 'bar' : 'pie';

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

  // The previous figures stay on screen while a new WINDOW loads — dimmed —
  // but never while a new ITEM does: its name and photo would sit above the
  // last item's chart at full strength.
  const sameItem = <T,>(prev: T | undefined, prevQuery: Query<T, Error, T, readonly unknown[]> | undefined) =>
    prevQuery?.queryKey[2] === itemId ? prev : undefined;

  const perfQuery = useQuery({
    queryKey: ['reports', 'item-performance', itemId, range],
    queryFn: () => getItemPerformance(itemId, range),
    enabled: !!itemId,
    placeholderData: sameItem,
    retry: retryUnlessFinal,
  });
  // The window before, for the changes under each figure. Optional.
  const priorQuery = useQuery({
    queryKey: ['reports', 'item-performance', itemId, prior],
    queryFn: () => getItemPerformance(itemId, prior),
    enabled: !!itemId,
    placeholderData: sameItem,
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ['reports', 'inventory-item-history', itemId, range],
    queryFn: () => getInventoryItemHistory(itemId, 12, range),
    enabled: !!itemId,
    placeholderData: sameItem,
    retry: retryUnlessFinal,
  });
  // For "Switch item". Usually already cached by the page this was opened from.
  const itemsQuery = useQuery({
    queryKey: ['reports', 'inventory-valuation'],
    queryFn: () => getInventoryValuation(),
    staleTime: 60_000,
  });

  const perf = perfQuery.data;
  const priorPerf = priorQuery.isError ? undefined : priorQuery.data;
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

  // While a newly switched-to item loads, the list it was picked from already knows its name.
  const listed = itemsQuery.data?.rows.find((r) => r.itemId === itemId);
  const itemName = perf?.itemName || history?.itemName || listed?.itemName || 'Item';
  const sku = perf?.sku || history?.sku || listed?.sku || '';
  const facts = perf?.item ?? null;
  const uom = facts?.unitOfMeasure ?? 'unit';
  const showOpenItem = inventoryOn && isPathAllowedForRole(`/inventory/${itemId}`, role);
  const customersAllowed = isPathAllowedForRole('/customers/x', role);

  const onHand =
    facts?.qtyOnHand ??
    [...months].reverse().find((m) => m.values.closingQty !== null)?.values.closingQty ??
    null;
  const t = perf?.totals;
  const p = priorPerf?.totals;
  const cover = facts && t ? itemCover(facts, t.unitsSold, range) : null;
  const sinceSold = daysSince(facts?.lastSoldDate ?? null);
  const badge = facts ? stockBadge(facts) : null;

  // ── The comparison, said once beside the window ─────────────────────────
  const priorEmpty = priorPerf ? priorPerf.totals.revenue === 0 && priorPerf.totals.unitsSold === 0 : null;
  const comparison = comparisonCaption(range, priorEmpty);

  // ── The figure tabs: value, move against the window before, shape ───────
  const tabs: MetricTab<ExplorerMetricKey>[] = HEADLINE.map((key) => {
    const pick = (x: typeof t) =>
      x ? (key === 'marginPct' ? x.marginPct : x[key as 'revenue' | 'grossProfit' | 'unitsSold']) : null;
    const current = pick(t);
    const change = !priorEmpty && p ? metricChange(key, current, pick(p)) : null;
    const text = formatChange(key, change);
    return {
      key,
      label: explorerMetric(key).label,
      value: formatMetric(key, current),
      tone: current !== null && current < 0 ? ('danger' as const) : ('default' as const),
      change: text ? { text, tone: changeTone(key, change) } : null,
      caption: !t ? 'Not available' : current === null ? 'No sales in this window' : undefined,
      // A run of zeros has no shape to show — only a line along the floor.
      trend: months.some((m) => (m.values[key] ?? 0) !== 0) ? months.map((m) => m.values[key]) : undefined,
    };
  });

  // ── About these figures ─────────────────────────────────────────────────
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

  // One line under the chart: the dashed average, the best month, how often it sold.
  const legend: string[] = [];
  if (summary.average !== null && summary.readings > 1 && def.kind !== 'ratio') {
    legend.push(`Average ${formatMetric(metric, summary.average)} a month`);
  }
  if (summary.best) legend.push(`Best ${summary.best.label} · ${formatMetric(metric, summary.best.value)}`);
  if (def.group === 'sales' && perf && months.length > 0) {
    legend.push(`Sold in ${monthsWithSales(months)} of ${months.length} month${months.length === 1 ? '' : 's'}`);
  }

  const customerHref = customersAllowed ? (id: string) => `/customers/${id}` : undefined;
  const windowLabel = rangeLabel(range.startDate, range.endDate);
  const margin = facts && t ? priceAndMargin(facts, t) : null;
  const channelsShown = hasChannelBreakdown(perf);

  const exportCsv = () => {
    const out: CsvRow[] = [
      [`${itemName}${sku ? ` (${sku})` : ''}`],
      [windowLabel],
      ['Revenue net of tax and invoice discounts; stock at each month end'],
      [],
      ...explorerCsvRows(months),
    ];
    if (perf && perf.customers.length > 0) {
      out.push([], ['Revenue by customer'], ['Customer', 'Units', 'Revenue', 'Share (%)', 'Gross profit']);
      for (const c of perf.customers) {
        out.push([c.customerName, c.unitsSold, c.revenue.toFixed(2), c.sharePct === null ? '' : c.sharePct.toFixed(1), c.grossProfit.toFixed(2)]);
      }
      const o = perf.otherCustomers;
      if (o.count > 0) {
        out.push([`Other (${o.count})`, o.unitsSold, o.revenue.toFixed(2), o.sharePct === null ? '' : o.sharePct.toFixed(1), o.grossProfit.toFixed(2)]);
      }
    }
    if (perf?.channels && perf.channels.length > 0) {
      out.push([], ['Revenue by channel'], ['Channel', 'Units', 'Revenue', 'Share (%)', 'Documents']);
      for (const c of perf.channels) {
        out.push([CHANNEL_LABEL[c.key], c.unitsSold, c.revenue.toFixed(2), c.sharePct === null ? '' : c.sharePct.toFixed(1), c.documents]);
      }
      if (perf.returns) {
        out.push(['Returns', perf.returns.unitsSold, perf.returns.revenue.toFixed(2), '', perf.returns.documents]);
      }
    }
    if (facts) {
      out.push(
        [],
        ['Stock position (today)'],
        ['On hand', facts.qtyOnHand],
        ['Stock value', facts.stockValue.toFixed(2)],
        ['Average cost', facts.unitCost.toFixed(2)],
        ['Selling price', facts.sellingPrice.toFixed(2)],
        ['Reorder point', facts.reorderPoint],
        ['Days of cover', cover?.days ?? ''],
        ['Last sold', facts.lastSoldDate ?? 'Never'],
      );
    }
    return downloadCsv(
      csvFilename(`item-${(sku || itemName).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, range),
      toCsv(out),
    );
  };

  return (
    <ReportShell
      title={itemName}
      back={{ to: '/reports/inventory-valuation', label: 'Inventory Valuation' }}
      leading={
        facts?.imageUrl ? (
          <button
            type="button"
            onClick={() => setPhotoOpen(true)}
            aria-label={`View the photo of ${itemName} full size`}
            className="group relative block overflow-hidden rounded-md border border-border focus-visible:outline-2 focus-visible:outline-border-focus"
          >
            <ItemThumb src={facts.thumbnailUrl ?? facts.imageUrl} alt="" className="size-14" iconClassName="size-6" />
            <span className="absolute inset-0 hidden items-center justify-center bg-neutral-900/40 text-neutral-0 group-hover:flex">
              <Maximize2 className="size-4" aria-hidden="true" />
            </span>
          </button>
        ) : (
          <ItemThumb src={null} alt="" className="size-14 rounded-md" iconClassName="size-6" />
        )
      }
      status={
        badge && (
          <span title={STOCK_BADGE[badge].hint}>
            <StatusBadge status={STOCK_BADGE[badge].status} label={STOCK_BADGE[badge].label} />
          </span>
        )
      }
      meta={[
        sku ? `SKU ${sku}` : null,
        facts?.category || null,
        facts ? `Sold by ${uom}` : null,
      ]}
      actions={
        showOpenItem && (
          <Button asChild variant="secondary" size="sm">
            <Link to={`/inventory/${itemId}`}>
              <ExternalLink className="size-4" aria-hidden="true" />
              Open item
            </Link>
          </Button>
        )
      }
      onExportCsv={exportCsv}
      pdf={{
        periodLabel: windowLabel,
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
                  'Period',
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
                  title: 'Revenue by customer',
                  columns: [
                    { header: 'Customer', flex: 4 },
                    { header: 'Units', align: 'right' as const, flex: 1 },
                    { header: 'Revenue', align: 'right' as const, flex: 2 },
                    { header: 'Share', align: 'right' as const, flex: 1 },
                    { header: 'Gross profit', align: 'right' as const, flex: 2 },
                  ],
                  rows: [
                    ...perf.customers.map((c) => ({
                      cells: [
                        c.customerName,
                        formatQty(c.unitsSold),
                        c.revenue,
                        c.sharePct === null ? '' : `${c.sharePct.toFixed(1)}%`,
                        c.grossProfit,
                      ],
                    })),
                    ...(perf.otherCustomers.count > 0
                      ? [
                          {
                            cells: [
                              `Other (${perf.otherCustomers.count})`,
                              formatQty(perf.otherCustomers.unitsSold),
                              perf.otherCustomers.revenue,
                              perf.otherCustomers.sharePct === null ? '' : `${perf.otherCustomers.sharePct.toFixed(1)}%`,
                              perf.otherCustomers.grossProfit,
                            ],
                          },
                        ]
                      : []),
                  ],
                },
              ]
            : []),
          ...(perf?.channels && perf.channels.length > 0
            ? [
                {
                  title: 'Revenue by channel',
                  columns: [
                    { header: 'Channel', flex: 3 },
                    { header: 'Units', align: 'right' as const, flex: 1 },
                    { header: 'Revenue', align: 'right' as const, flex: 2 },
                    { header: 'Share', align: 'right' as const, flex: 1 },
                    { header: 'Documents', align: 'right' as const, flex: 1 },
                  ],
                  rows: [
                    ...perf.channels.map((c) => ({
                      cells: [
                        CHANNEL_LABEL[c.key],
                        formatQty(c.unitsSold),
                        c.revenue,
                        c.sharePct === null ? '' : `${c.sharePct.toFixed(1)}%`,
                        String(c.documents),
                      ],
                    })),
                    ...(perf.returns
                      ? [
                          {
                            cells: [
                              'Returns',
                              formatQty(perf.returns.unitsSold),
                              perf.returns.revenue,
                              '',
                              String(perf.returns.documents),
                            ],
                          },
                        ]
                      : []),
                  ],
                },
              ]
            : []),
          ...(facts
            ? [
                {
                  title: 'Stock position — today',
                  columns: [
                    { header: 'Figure', flex: 2 },
                    { header: 'Value', align: 'right' as const, flex: 2 },
                  ],
                  rows: [
                    { cells: ['On hand', unitsText(facts.qtyOnHand, uom)] },
                    { cells: ['Stock value', facts.stockValue] },
                    { cells: ['Average cost', facts.unitCost] },
                    { cells: ['Selling price', facts.sellingPrice] },
                    ...(facts.reorderPoint > 0 ? [{ cells: ['Reorder point', unitsText(facts.reorderPoint, uom)] }] : []),
                    { cells: ['Days of cover', coverText(cover?.days ?? null)] },
                    { cells: ['Last sold', facts.lastSoldDate ? formatShortDate(facts.lastSoldDate) : 'Never'] },
                  ],
                },
              ]
            : []),
        ],
      }}
      controls={
        <div className="flex flex-wrap items-start justify-between gap-sm">
          <PeriodMenu
            className="min-w-0 flex-1"
            layout="segments"
            presets={TREND_PRESETS}
            shortLabels={WINDOW_LABELS}
            value={range}
            onChange={(r) => update({ from: r.startDate, to: r.endDate, month: null })}
            note={comparison}
          />
          {itemOptions.length > 1 && (
            // Beside the window it keeps: another item, the same months. Full
            // width on a phone, where it is the only way to another item.
            <Combobox
              compact
              value={itemId}
              onChange={(id) => {
                if (id !== itemId) navigate(itemExplorerHref(id, range));
              }}
              options={itemOptions}
              placeholder="Switch item"
              searchPlaceholder="Find an item…"
              containerClassName="w-full sm:w-64"
            />
          )}
        </div>
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
            <ItemStockPosition facts={facts} onHand={onHand} cover={cover} sinceSold={sinceSold} />
            {facts && margin && margin.price > 0 && <ItemPriceMargin facts={facts} totals={t} />}
          </>
        }
      >
        {/* ── Performance: the figures choose what the chart draws ─────── */}
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

            <div className="mt-xs flex flex-wrap items-center justify-between gap-x-lg gap-y-xxs border-t border-border-light pt-sm">
              <p className="flex min-w-0 flex-wrap items-center gap-x-xs gap-y-xxs text-caption text-text-secondary">
                {summary.average !== null && def.kind !== 'ratio' && summary.readings > 1 && (
                  <span aria-hidden="true" className="inline-block w-4 shrink-0 border-t border-dashed border-neutral-400" />
                )}
                {legend.map((l, i) => (
                  <span key={l} className="whitespace-nowrap">
                    {i > 0 && <span aria-hidden="true">· </span>}
                    {l}
                  </span>
                ))}
              </p>
              {summary.readings > 0 && (
                <p className="flex shrink-0 items-center gap-xs text-caption text-text-tertiary print:hidden">
                  <MousePointerClick className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  Click a month to see its documents
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* ── Under the chart: what the revenue is made of, and every figure by month ── */}
        <Tabs value={tab} onValueChange={(v) => update({ tab: v === 'revenue' ? null : v })}>
          <TabsList className="print:hidden">
            <TabsTrigger value="revenue">Revenue breakdown</TabsTrigger>
            <TabsTrigger value="months">Monthly breakdown</TabsTrigger>
          </TabsList>
          <TabsContent value="revenue" className="pt-md">
            {perf ? (
              <ItemRevenueBreakdown
                perf={perf}
                dimension={channelsShown ? mix : 'customer'}
                view={mixChart}
                onDimension={(d) => update({ mix: d === 'customer' ? null : d })}
                onView={(v) => update({ mixChart: v === 'pie' ? null : v })}
                windowLabel={windowLabel}
                unitOfMeasure={uom}
                customerHref={customerHref}
              />
            ) : (
              <Card className="p-xl text-center text-body-sm text-text-tertiary">
                The sales behind this item could not be loaded.
              </Card>
            )}
          </TabsContent>
          <TabsContent value="months" className="pt-md">
            <Card className="overflow-hidden">
              <PanelHeader
                title="Every figure, month by month"
                description="Choose a row to chart it, or a month to see its documents"
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
          </TabsContent>
        </Tabs>
      </DetailLayout>

      {/* Last on every screen: what to bear in mind about the figures above. */}
      {notes.length > 0 && (
        <Card className="mt-lg px-lg py-md">
          <h2 className="text-label-lg text-text-primary">About these figures</h2>
          <ul className="mt-sm flex flex-col gap-sm">
            {notes.map((n) => (
              <li key={n} className="flex items-start gap-xs text-caption text-text-secondary">
                <Info className="mt-[2px] size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                {n}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ItemMonthPanel
        itemId={itemId}
        itemName={itemName}
        period={selectedMonth ? selectedMonth.period : null}
        range={selectedMonth ? monthRange(selectedMonth.period, range) : null}
        onClose={() => update({ month: null })}
      />

      {facts?.imageUrl && (
        <ItemPhotoDialog src={facts.imageUrl} title={itemName} open={photoOpen} onOpenChange={setPhotoOpen} />
      )}
    </ReportShell>
  );
}
