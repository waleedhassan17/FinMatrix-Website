import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Card } from '@/components/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Field';
import { KeyValueList } from '@/components/ui/KeyValueList';
import { Select } from '@/components/ui/Select';
import { PanelHeader, PanelLink } from '@/features/dashboard/PanelHeader';
import { Figure, FigureStrip } from '@/features/reports/FigureStrip';
import { InventoryItemsTable, type ItemsQuery } from '@/features/reports/InventoryItemsTable';
import { MetricChart } from '@/features/reports/MetricChart';
import { PeriodMenu } from '@/features/reports/PeriodMenu';
import { RankedBars } from '@/features/reports/RankedBars';
import { ReportShell } from '@/features/reports/ReportShell';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { cn } from '@/lib/cn';
import { isoToday } from '@/models/document';
import { formatQty } from '@/models/inventory';
import {
  RANK_OPTIONS,
  categoryShares,
  formatShare,
  isRankKey,
  isSortKey,
  isStockFilter,
  itemExplorerHref,
  ledgerTie,
  rankFigure,
  rankRows,
  sortForRank,
  traded,
  unsoldStock,
  valuationRows,
  type RankKey,
  type ValuationRow,
} from '@/models/inventoryValuation';
import { csvAmount, csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import {
  PERIOD_PRESETS,
  asOfLabel,
  defaultReportRange,
  formatShortDate,
  rangeLabel,
  type ReportRange,
} from '@/models/reportPeriod';
import {
  getInventoryPerformance,
  getInventoryValuation,
  getInventoryValuationTrend,
} from '@/networks/reports/inventoryValuationNetwork';
import { compactMoney, formatMoney } from '@/utils/money';

const TREND_MONTHS = 12;
/** Top items: enough to compare, few enough to read at a glance. */
const TOP = 8;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TABS = ['items', 'insights', 'reconciliation'] as const;
type Tab = (typeof TABS)[number];

const shortRange = (r: ReportRange) => `${formatShortDate(r.startDate)} – ${formatShortDate(r.endDate)}`;

/**
 * Inventory Valuation: what the stock is worth, and which of it earns.
 *
 * Laid out so the one thing a reader comes to do is the obvious thing: the
 * headline figures, then the items, each of which opens its explorer. The
 * rest is a tab away rather than stacked above and below — Insights (who
 * earns, where the money sits, how stock has moved) and Reconciliation (how
 * the figures tie to the ledger and how they are built).
 *
 * Two claims about two moments share the page, and it says which is which:
 * STOCK is as of today (quantity at average cost, tied to Inventory 1200);
 * SALES cover the period chosen at the top.
 *
 * The whole view — period, tab, search, filters, sort and page — lives in the
 * URL, so a link is a link to this view and Back from an item lands where it
 * left.
 */
export default function InventoryValuationPage() {
  const [params, setParams] = useSearchParams();

  const range: ReportRange = useMemo(() => {
    const from = params.get('from');
    const to = params.get('to');
    return from && to && ISO.test(from) && ISO.test(to) && from <= to
      ? { startDate: from, endDate: to }
      : defaultReportRange();
  }, [params]);
  const tabParam = params.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as Tab) : 'items';
  const rankParam = params.get('rank');
  const rank: RankKey = isRankKey(rankParam) ? rankParam : 'grossProfit';
  const sortParam = params.get('sort');
  const showParam = params.get('show');
  const itemsQuery: ItemsQuery = {
    search: params.get('q') ?? '',
    category: params.get('category') ?? '',
    filter: isStockFilter(showParam) ? showParam : 'all',
    sort: isSortKey(sortParam) ? sortParam : 'value',
    dir: params.get('dir') === 'asc' ? 'asc' : 'desc',
    page: Number(params.get('page')) || 1,
  };

  const update = (patch: Record<string, string | number | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, String(v));
        }
        return next;
      },
      { replace: true },
    );

  /** A change to the items view; anything but the page itself returns to page 1. */
  const updateItems = (patch: Partial<ItemsQuery>) =>
    update({
      ...('search' in patch ? { q: patch.search ?? null } : {}),
      ...('category' in patch ? { category: patch.category ?? null } : {}),
      ...('filter' in patch ? { show: patch.filter === 'all' ? null : (patch.filter ?? null) } : {}),
      ...('sort' in patch ? { sort: patch.sort === 'value' ? null : (patch.sort ?? null) } : {}),
      ...('dir' in patch ? { dir: patch.dir === 'desc' ? null : (patch.dir ?? null) } : {}),
      page: 'page' in patch && patch.page && patch.page > 1 ? patch.page : null,
    });

  const query = useQuery({
    queryKey: ['reports', 'inventory-valuation'],
    queryFn: getInventoryValuation,
  });

  // A separate query, so a failure hides the chart rather than blanking the
  // figures the user came for — and a server without the endpoint still
  // renders the report.
  const trend = useQuery({
    queryKey: ['reports', 'inventory-valuation', 'trend', TREND_MONTHS],
    queryFn: () => getInventoryValuationTrend(TREND_MONTHS),
    retry: false,
  });

  // Ranked, sorted and paged HERE, not by the server: it returns every item,
  // so the order is the page's to choose and changing it costs no request.
  const perfQuery = useQuery({
    queryKey: ['reports', 'inventory-performance', range],
    queryFn: () => getInventoryPerformance(range),
    retry: false,
    // A new period keeps the current rows on screen, dimmed, until the answer
    // lands — rather than dropping the sales columns and snapping them back.
    placeholderData: keepPreviousData,
  });

  const report = query.data;
  const perf = perfQuery.data;
  const rows = useMemo(() => valuationRows(report, perf), [report, perf]);
  const showSales = (perf?.rows.length ?? 0) > 0;
  const soldAny = showSales && rows.some(traded);

  const stockValue = perf?.totals.stockValue ?? report?.totalValue ?? 0;
  const tie = ledgerTie(stockValue, perf?.totals.ledgerValue ?? null);
  const unsold = unsoldStock(rows);
  const shares = useMemo(() => categoryShares(rows), [rows]);
  const period = rangeLabel(range.startDate, range.endDate);
  // "Stock as of September 26, 2026" — the label's own "As of", in a sentence.
  const stockAsOf = `Stock ${asOfLabel(isoToday()).replace(/^As of/, 'as of')}`;
  const periodShort = shortRange(range);

  const ranked = rankRows(rows, rank).slice(0, TOP);
  const rankLabel = RANK_OPTIONS.find((o) => o.key === rank)?.label ?? 'Gross profit';
  const rankFormat = (v: number) =>
    rank === 'marginPct' ? `${v.toFixed(1)}%` : rank === 'unitsSold' ? formatQty(v) : formatMoney(v);
  const rankHint = (r: ValuationRow) => {
    if (rank === 'stockValue') {
      const held = `${formatQty(r.qty)} on hand`;
      if (!showSales) return held;
      return r.unitsSold > 0 ? `${held} · ${formatQty(r.unitsSold)} sold` : `${held} · not sold in the period`;
    }
    const sold = `${formatQty(r.unitsSold)} sold`;
    if (rank === 'marginPct') return `${sold} · ${compactMoney(r.grossProfit)} gross profit`;
    return r.marginPct === null ? sold : `${sold} · ${r.marginPct.toFixed(1)}% margin`;
  };

  const trendPoints = (trend.data?.points ?? []).map((p) => ({
    period: p.period,
    label: p.label,
    value: p.value,
  }));

  const exportCsv = () => {
    if (!report) return;
    const out: CsvRow[] = [
      ['Inventory Valuation'],
      [stockAsOf],
      ...(showSales ? [[`Sales ${period}`]] : []),
      [],
      [
        'SKU',
        'Item',
        'Category',
        'On hand',
        'Unit cost',
        'Stock value',
        ...(showSales
          ? ['Units sold', 'Revenue', 'Cost of sales', 'Gross profit', 'Margin %', 'Last sold']
          : []),
      ],
    ];
    for (const r of rows) {
      out.push([
        r.sku,
        r.itemName,
        r.category,
        r.qty,
        csvAmount(r.unitCost),
        csvAmount(r.value),
        ...(showSales
          ? [
              r.unitsSold,
              csvAmount(r.revenue),
              csvAmount(r.cogs),
              csvAmount(r.grossProfit),
              r.marginPct === null ? '' : r.marginPct.toFixed(2),
              r.lastSoldDate ?? '',
            ]
          : []),
      ]);
    }
    out.push([
      'Total',
      '',
      '',
      '',
      '',
      csvAmount(stockValue),
      ...(showSales
        ? [
            perf?.totals.unitsSold ?? '',
            csvAmount(perf?.totals.revenue),
            csvAmount(perf?.totals.cogs),
            csvAmount(perf?.totals.grossProfit),
            perf?.totals.marginPct == null ? '' : perf.totals.marginPct.toFixed(2),
            '',
          ]
        : []),
    ]);
    downloadCsv(
      csvFilename('inventory-valuation', showSales ? range : { asOfDate: isoToday() }),
      toCsv(out),
    );
  };

  const linkButton =
    'inline-flex items-center gap-[2px] rounded-sm text-left transition-colors hover:underline';

  return (
    <ReportShell
      title="Inventory Valuation"
      subtitle="Stock at today's cost, and how each item sold."
      meta={[stockAsOf]}
      onExportCsv={exportCsv}
      pdf={{
        periodLabel: showSales ? `${stockAsOf} · sales ${period}` : asOfLabel(isoToday()),
        basis: 'Stock at average cost · revenue net of tax and discounts',
        cacheKey: `${query.dataUpdatedAt}|${perfQuery.dataUpdatedAt}|${range.startDate}|${range.endDate}`,
        build: () => [
          {
            columns: [
              { header: 'Item', flex: 3.2 },
              { header: 'On hand', align: 'right', flex: 1 },
              { header: 'Value', align: 'right', flex: 1.6 },
              ...(showSales
                ? ([
                    { header: 'Revenue', align: 'right', flex: 1.6 },
                    { header: 'Gross profit', align: 'right', flex: 1.6 },
                    { header: 'Margin', align: 'right', flex: 1 },
                  ] as const)
                : []),
            ],
            rows: [
              ...rows.map((r) => ({
                cells: [
                  r.itemName,
                  formatQty(r.qty),
                  r.value,
                  ...(showSales
                    ? [
                        r.revenue,
                        r.grossProfit,
                        r.marginPct === null ? '—' : `${r.marginPct.toFixed(1)}%`,
                      ]
                    : []),
                ],
                sub: [r.sku, r.category].filter(Boolean).join(' · ') || undefined,
              })),
              {
                cells: [
                  'Total',
                  '',
                  stockValue,
                  ...(showSales
                    ? [
                        perf?.totals.revenue ?? 0,
                        perf?.totals.grossProfit ?? 0,
                        perf?.totals.marginPct == null ? '—' : `${perf.totals.marginPct.toFixed(1)}%`,
                      ]
                    : []),
                ],
                grand: true,
              },
            ],
          },
          {
            title: 'Stock value by category',
            columns: [
              { header: 'Category', flex: 4 },
              { header: 'Items', align: 'right', flex: 1 },
              { header: 'Share', align: 'right', flex: 1 },
              { header: 'Value', align: 'right', flex: 2 },
            ],
            rows: [
              ...shares.map((c) => ({
                cells: [c.category, String(c.items), formatShare(c.share), c.value],
              })),
              { cells: ['Total', String(rows.length), '100%', stockValue], grand: true },
            ],
          },
        ],
      }}
      controls={
        <PeriodMenu
          label="Sales period"
          presets={PERIOD_PRESETS}
          value={range}
          onChange={(r) => update({ from: r.startDate, to: r.endDate, page: null })}
        />
      }
      isLoading={query.isLoading}
      isRefetching={query.isFetching || perfQuery.isFetching}
      error={query.error as Error | null}
      onRetry={() => query.refetch()}
      hasData={rows.length > 0}
      empty={
        <>
          <p className="text-label-lg text-text-primary">No stock on hand</p>
          <p className="mt-xxs text-body-sm text-text-secondary">
            Nothing is carried in inventory yet.
          </p>
        </>
      }
    >
      <div className="flex flex-col gap-lg">
        <FigureStrip>
          <Figure
            label="Stock value"
            value={stockValue}
            caption={
              tie && !tie.ties ? (
                // The one amber line on the page, and only when it is true.
                <button
                  type="button"
                  onClick={() => update({ tab: 'reconciliation' })}
                  className={cn(linkButton, 'text-warning')}
                >
                  Differs from the ledger by {formatMoney(Math.abs(tie.difference))}
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </button>
              ) : (
                `${rows.length} items${tie ? ' · matches the ledger' : ''}`
              )
            }
          />
          <Figure
            label="Revenue"
            value={showSales ? (perf?.totals.revenue ?? 0) : '—'}
            caption={showSales ? `${formatQty(perf?.totals.unitsSold ?? 0)} units sold` : 'Not available'}
          />
          <Figure
            label="Gross profit"
            value={showSales ? (perf?.totals.grossProfit ?? 0) : '—'}
            tone={showSales && (perf?.totals.grossProfit ?? 0) < 0 ? 'danger' : 'default'}
            caption={
              showSales
                ? perf?.totals.marginPct == null
                  ? 'No sales in the period'
                  : `${perf.totals.marginPct.toFixed(1)}% margin`
                : 'Not available'
            }
          />
          <Figure
            label="Unsold stock"
            value={showSales ? unsold.value : '—'}
            caption={
              !showSales ? (
                'Not available'
              ) : unsold.count === 0 ? (
                'Everything in stock sold'
              ) : (
                <button
                  type="button"
                  onClick={() => update({ tab: null, show: 'unsold', page: null })}
                  className={cn(linkButton, 'text-primary')}
                >
                  {unsold.count} item{unsold.count === 1 ? '' : 's'} not sold · View
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </button>
              )
            }
          />
        </FigureStrip>

        <Tabs value={tab} onValueChange={(v) => update({ tab: v === 'items' ? null : v })}>
          <TabsList className="print:hidden">
            <TabsTrigger value="items" count={rows.length}>
              Items
            </TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
          </TabsList>

          {/* ── Items: the report, and the way into every item ─────────── */}
          <TabsContent value="items">
            <Card className="overflow-hidden">
              {/* The statement heading belongs on paper; on screen the page
                  header already says all of it. */}
              <div className="hidden px-lg pt-lg print:block">
                <ReportTitleBlock
                  report="Inventory Valuation"
                  periodLabel={showSales ? `${stockAsOf} · sales ${period}` : asOfLabel(isoToday())}
                />
              </div>
              <InventoryItemsTable
                rows={rows}
                showSales={showSales}
                query={itemsQuery}
                onQuery={updateItems}
                hrefFor={(id) => itemExplorerHref(id, range)}
              />
            </Card>
          </TabsContent>

          {/* ── Insights: who earns, where the money sits, how it moved ── */}
          <TabsContent value="insights">
            <div className="flex flex-col gap-lg">
              <div className="grid items-start gap-lg lg:grid-cols-2">
                <Card className="overflow-hidden">
                  <PanelHeader
                    title={`Top ${TOP} by ${rankLabel.toLowerCase()}`}
                    description={rank === 'stockValue' ? 'As of today' : periodShort}
                    action={
                      <Select<RankKey>
                        compact
                        value={rank}
                        onChange={(v) => update({ rank: v === 'grossProfit' ? null : v })}
                        options={RANK_OPTIONS.filter((o) => showSales || o.key === 'stockValue').map((o) => ({
                          value: o.key,
                          label: o.label,
                        }))}
                        containerClassName="w-36"
                        label={<span className="sr-only">Rank by</span>}
                      />
                    }
                  />
                  <div className="px-lg pt-md pb-sm">
                    <RankedBars
                      points={ranked.map((r) => ({
                        key: r.itemId,
                        label: r.itemName,
                        value: rankFigure(r, rank),
                        hint: rankHint(r),
                      }))}
                      limit={TOP}
                      format={rankFormat}
                      hrefFor={(id) => itemExplorerHref(id, range)}
                      emptyLabel={rank === 'stockValue' ? 'Nothing is held in stock.' : 'Nothing sold in this period.'}
                    />
                  </div>
                  <div className="border-t border-border-light px-lg py-sm">
                    <button
                      type="button"
                      onClick={() =>
                        update({ tab: null, sort: sortForRank(rank) === 'value' ? null : sortForRank(rank), dir: null, page: null })
                      }
                      className={cn(linkButton, 'text-label-md text-primary')}
                    >
                      See all items by {rankLabel.toLowerCase()}
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </Card>

                <Card className="overflow-hidden">
                  <PanelHeader title="Stock value by category" description="As of today · choose one to list its items" />
                  <div className="px-lg py-md">
                    <RankedBars
                      points={shares.map((c) => ({
                        key: c.category,
                        label: c.category,
                        value: c.value,
                        hint: `${c.items} item${c.items === 1 ? '' : 's'} · ${formatShare(c.share)} of stock`,
                      }))}
                      format={(v) => formatMoney(v)}
                      onSelect={(key) => update({ tab: null, category: key, page: null })}
                      emptyLabel="No categories yet."
                    />
                  </div>
                </Card>
              </div>

              {trendPoints.length > 0 && (
                <Card className="overflow-hidden">
                  <PanelHeader
                    title="Stock value over time"
                    description="Inventory account 1200 at each month end"
                    action={<PanelLink to="/reports/balance-sheet">Balance Sheet</PanelLink>}
                  />
                  <div className="px-lg py-md">
                    <MetricChart metric="closingValue" type="bar" points={trendPoints} className="h-64" />
                  </div>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ── Reconciliation: how the figures tie, and how they are built ── */}
          <TabsContent value="reconciliation">
            <div className="grid items-start gap-lg xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="flex flex-col gap-lg">
                {perf && soldAny && perf.reconciliation.items.length > 0 ? (
                  // Why this report does not equal the Profit & Loss, named
                  // rather than left to be discovered as a discrepancy. It
                  // foots exactly: goods sold plus every line equals the P&L.
                  <Card className="overflow-hidden">
                    <PanelHeader
                      title="Sales against the Profit & Loss"
                      description={`${periodShort} · goods sold plus each line equals the ledger`}
                      action={<PanelLink to="/reports/profit-loss">Profit &amp; Loss</PanelLink>}
                    />
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-border bg-surface-2">
                            <th className="px-lg py-sm text-left text-overline text-text-secondary">Source</th>
                            <th className="px-md py-sm text-right text-overline text-text-secondary">Revenue</th>
                            <th className="px-lg py-sm text-right text-overline whitespace-nowrap text-text-secondary">
                              Cost of sales
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-border-light">
                            <td className="px-lg py-sm text-body-sm text-text-primary">Goods sold (this report)</td>
                            <td className="px-md py-sm text-right tabular text-body-sm text-text-primary">
                              {formatMoney(perf.reconciliation.itemRevenue, '')}
                            </td>
                            <td className="px-lg py-sm text-right tabular text-body-sm text-text-primary">
                              {formatMoney(perf.reconciliation.itemCogs, '')}
                            </td>
                          </tr>
                          {perf.reconciliation.items.map((it) => (
                            <tr key={it.label} className="border-b border-border-light">
                              <td className="px-lg py-sm text-body-sm text-text-primary">
                                {it.label}
                                <span className="block text-caption text-text-tertiary">{it.reason}</span>
                              </td>
                              <td className="px-md py-sm text-right tabular text-body-sm text-text-primary">
                                {it.revenue === 0 ? '—' : formatMoney(it.revenue, '')}
                              </td>
                              <td className="px-lg py-sm text-right tabular text-body-sm text-text-primary">
                                {it.cogs === 0 ? '—' : formatMoney(it.cogs, '')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-text-primary border-b-[3px] border-b-border-strong border-double bg-surface-2">
                            <td className="px-lg py-sm text-label-lg text-text-primary">Profit &amp; Loss</td>
                            <td className="px-md py-sm text-right tabular text-label-lg text-text-primary">
                              {formatMoney(perf.reconciliation.glRevenue, '')}
                            </td>
                            <td className="px-lg py-sm text-right tabular text-label-lg text-text-primary">
                              {formatMoney(perf.reconciliation.glCogs, '')}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </Card>
                ) : (
                  <Card className="p-lg">
                    <p className="text-body-sm text-text-secondary">
                      Nothing sold in {periodShort}, so there is nothing to tie to the Profit &amp; Loss.
                    </p>
                  </Card>
                )}

                <Card className="overflow-hidden">
                  <PanelHeader title="How these figures are built" />
                  <ul className="flex list-disc flex-col gap-xs py-md pr-lg pl-[calc(var(--spacing-lg)+1rem)] text-body-sm text-text-secondary">
                    <li>Stock is the quantity on hand at weighted-average cost, as of today.</li>
                    <li>
                      Sales are by document date: invoices and approved deliveries, less customer returns.
                      Drafts and voids are left out.
                    </li>
                    <li>Revenue is net of tax and of any invoice discount.</li>
                    <li>Cost of sales is the cost each sale was posted at.</li>
                    {perf && perf.estimatedCogsShare > 0 && (
                      <li>
                        {Math.round(perf.estimatedCogsShare * 100)}% of the cost was split across items that
                        shared an invoice. Each invoice&rsquo;s total is exact; the split is an estimate.
                      </li>
                    )}
                  </ul>
                </Card>
              </div>

              <Card className="overflow-hidden">
                <PanelHeader title="Stock against the ledger" description="As of today" />
                <div className="px-lg py-md">
                  {tie ? (
                    <>
                      <KeyValueList
                        items={[
                          { label: 'Stock value (this report)', value: formatMoney(stockValue) },
                          { label: 'Inventory account 1200', value: formatMoney(tie.ledgerValue) },
                          {
                            label: 'Difference',
                            value: (
                              <span className={tie.ties ? 'text-success' : 'text-warning'}>
                                {tie.ties ? 'None' : formatMoney(tie.difference)}
                              </span>
                            ),
                            emphasis: true,
                          },
                        ]}
                      />
                      <p className="mt-sm text-caption text-text-tertiary">
                        {tie.ties
                          ? 'The stock on hand and the balance sheet agree.'
                          : 'Stock at average cost and the Inventory account have drifted apart. The balance sheet reports the account.'}
                      </p>
                    </>
                  ) : (
                    <p className="text-body-sm text-text-secondary">
                      The ledger comparison is not available from this server.
                    </p>
                  )}
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ReportShell>
  );
}
