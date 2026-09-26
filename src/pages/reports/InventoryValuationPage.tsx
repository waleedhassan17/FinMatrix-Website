import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { PanelHeader, PanelLink } from '@/features/dashboard/PanelHeader';
import { Figure, FigureStrip } from '@/features/reports/FigureStrip';
import { InventoryItemsTable } from '@/features/reports/InventoryItemsTable';
import { MetricChart } from '@/features/reports/MetricChart';
import { PeriodPicker } from '@/features/reports/PeriodPicker';
import { RankedBars } from '@/features/reports/RankedBars';
import { ReportShell } from '@/features/reports/ReportShell';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { isoToday } from '@/models/document';
import { formatQty } from '@/models/inventory';
import {
  RANK_OPTIONS,
  categoryShares,
  formatShare,
  isRankKey,
  itemExplorerHref,
  ledgerTie,
  rankFigure,
  rankRows,
  traded,
  unsoldStock,
  valuationRows,
  type RankKey,
  type ValuationRow,
} from '@/models/inventoryValuation';
import { csvAmount, csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import {
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
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const shortRange = (r: ReportRange) =>
  `${formatShortDate(r.startDate)} – ${formatShortDate(r.endDate)}`;

/**
 * Inventory Valuation: what the stock is worth, and which of it earns.
 *
 * Two claims about two different moments share this page, and it says so
 * wherever they meet. STOCK is as of now — quantity on hand at average cost,
 * which ties to Inventory 1200 on the balance sheet (and the headline shows
 * the ledger beside it). SALES cover the period picked above — revenue net of
 * tax and discounts, the cost frozen on each sale, and the margin between.
 *
 * Every item opens its explorer: monthly figures, charted, down to the
 * documents behind each month.
 *
 * The period, ranking and category live in the URL, so a link to this page
 * is a link to this view and coming Back from an item lands where it left.
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
  const rankParam = params.get('rank');
  const rank: RankKey = isRankKey(rankParam) ? rankParam : 'grossProfit';
  const category = params.get('category') ?? '';

  const update = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );

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

  // Ranked and sorted HERE, not by the server: it returns every item, so the
  // order is the page's to choose, and changing it costs no request.
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

  const ranked = rankRows(rows, rank);
  const rankLabel = RANK_OPTIONS.find((o) => o.key === rank)?.label ?? 'Gross profit';
  const rankFormat = (v: number) =>
    rank === 'marginPct' ? `${v.toFixed(1)}%` : rank === 'unitsSold' ? formatQty(v) : formatMoney(v);
  const rankHint = (r: ValuationRow) => {
    if (rank === 'stockValue') {
      const held = `${formatQty(r.qty)} on hand`;
      if (!showSales) return held;
      return r.unitsSold > 0 ? `${held} · ${formatQty(r.unitsSold)} sold` : `${held} · not sold in period`;
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

  return (
    <ReportShell
      title="Inventory Valuation"
      subtitle="What the stock is worth, and which of it earns."
      meta={[
        stockAsOf,
        `Sales ${period}`,
        'Revenue net of tax and discounts',
      ]}
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
      controls={<PeriodPicker value={range} onChange={(r) => update({ from: r.startDate, to: r.endDate })} />}
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
        <div className="flex items-start gap-sm rounded-md bg-surface-2 p-md print:hidden">
          <Info className="mt-[2px] size-4 shrink-0 text-text-secondary" aria-hidden="true" />
          <p className="text-body-sm text-text-secondary">
            Stock figures are as of today and tie to the balance sheet&rsquo;s Inventory line.
            {showSales
              ? ` Revenue, gross profit and margin cover ${period}.`
              : ' Sales figures are not available from this server, so only stock is shown.'}{' '}
            Choose any item to explore it month by month.
          </p>
        </div>

        <FigureStrip>
          <Figure
            label="Stock value"
            value={stockValue}
            caption={
              tie && !tie.ties ? (
                <span className="text-warning">
                  Ledger {formatMoney(tie.ledgerValue)} · differs by {formatMoney(tie.difference)}
                </span>
              ) : (
                `${rows.length} items · ${shares.length} categor${shares.length === 1 ? 'y' : 'ies'}${tie ? ' · ties to the ledger' : ''}`
              )
            }
          />
          <Figure
            label="Revenue"
            value={showSales ? (perf?.totals.revenue ?? 0) : '—'}
            caption={
              showSales ? `${formatQty(perf?.totals.unitsSold ?? 0)} units sold · ${periodShort}` : 'Not available'
            }
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
            tone={showSales && unsold.value > 0 ? 'warning' : 'default'}
            caption={
              showSales
                ? unsold.count === 0
                  ? 'Every item in stock sold in the period'
                  : `${unsold.count} item${unsold.count === 1 ? '' : 's'} · ${formatShare(stockValue > 0 ? unsold.value / stockValue : 0)} of stock · no sales in period`
                : 'Not available'
            }
          />
        </FigureStrip>

        <div className="grid items-start gap-lg lg:grid-cols-2">
          <Card className="flex flex-col overflow-hidden print:hidden">
            <PanelHeader
              title={`Top items by ${rankLabel.toLowerCase()}`}
              description={rank === 'stockValue' ? 'As of today · every item held' : `${periodShort} · items that sold`}
              action={
                <Select<RankKey>
                  compact
                  value={rank}
                  onChange={(v) => update({ rank: v === 'grossProfit' ? null : v })}
                  options={RANK_OPTIONS.filter((o) => showSales || o.key === 'stockValue').map((o) => ({
                    value: o.key,
                    label: o.label,
                  }))}
                  containerClassName="w-40"
                  label={<span className="sr-only">Rank by</span>}
                />
              }
            />
            <div className="px-lg py-md">
              <RankedBars
                points={ranked.map((r) => ({
                  key: r.itemId,
                  label: r.itemName,
                  value: rankFigure(r, rank),
                  hint: rankHint(r),
                }))}
                format={rankFormat}
                hrefFor={(id) => itemExplorerHref(id, range)}
                emptyLabel={
                  rank === 'stockValue' ? 'Nothing is held in stock.' : 'Nothing sold in this period.'
                }
              />
            </div>
          </Card>

          <Card className="flex flex-col overflow-hidden print:hidden">
            <PanelHeader
              title="Stock value by category"
              description={category ? `Filtering the table to ${category}` : 'As of today · choose one to filter the table'}
              action={
                category ? (
                  <button
                    type="button"
                    onClick={() => update({ category: null })}
                    className="text-label-md text-primary hover:text-primary-dark"
                  >
                    Show all
                  </button>
                ) : undefined
              }
            />
            <div className="px-lg py-md">
              <RankedBars
                points={shares.map((c) => ({
                  key: c.category,
                  label: c.category,
                  value: c.value,
                  hint: `${c.items} item${c.items === 1 ? '' : 's'} · ${formatShare(c.share)} of stock`,
                }))}
                format={(v) => formatMoney(v)}
                onSelect={(key) => update({ category: key === category ? null : key })}
                activeKey={category || null}
                emptyLabel="No categories yet."
              />
            </div>
          </Card>
        </div>

        {trendPoints.length > 0 && (
          <Card className="overflow-hidden print:hidden">
            <PanelHeader
              title="Stock value over time"
              description="Inventory account 1200 at each month end · ties to the balance sheet"
              action={<PanelLink to="/reports/balance-sheet">Balance Sheet</PanelLink>}
            />
            <div className="px-lg py-md">
              <MetricChart metric="closingValue" type="bar" points={trendPoints} className="h-60" />
            </div>
          </Card>
        )}

        <Card className="overflow-hidden">
          <div className="px-lg pt-lg">
            <ReportTitleBlock
              report="Inventory Valuation"
              periodLabel={
                showSales
                  ? `${stockAsOf} · sales ${period}`
                  : asOfLabel(isoToday())
              }
            />
          </div>
          <div className="mt-md">
            <InventoryItemsTable
              rows={rows}
              showSales={showSales}
              totalValue={stockValue}
              category={category}
              onCategory={(c) => update({ category: c || null })}
              hrefFor={(id) => itemExplorerHref(id, range)}
              periodLabel={periodShort}
            />
          </div>
        </Card>

        {perf && soldAny && perf.reconciliation.items.length > 0 && (
          // Why this report does not equal the Profit & Loss, named rather than
          // left to be discovered as a discrepancy. It foots exactly: goods
          // sold plus every line below equals the P&L figure. An accountant who
          // cannot see this stops trusting the rows above it.
          <Card className="overflow-hidden">
            <PanelHeader
              title="How this ties to Profit & Loss"
              description={`${periodShort} · goods sold plus each line below equals the ledger`}
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
            {perf.estimatedCogsShare > 0.33 && (
              <p className="px-lg py-sm text-caption text-text-secondary">
                {Math.round(perf.estimatedCogsShare * 100)}% of the cost above was split across
                items that shared an invoice. Each invoice&rsquo;s total is exact; how it divides
                between the items on it is an estimate.
              </p>
            )}
          </Card>
        )}

        <p className="text-caption text-text-tertiary">
          Stock is quantity on hand at weighted-average cost, as of today. Sales are by
          document date: invoices and approved deliveries less customer returns, net of tax and
          of any invoice discount, with the cost each sale was posted at. Drafts and voids are
          excluded.
        </p>
      </div>
    </ReportShell>
  );
}
