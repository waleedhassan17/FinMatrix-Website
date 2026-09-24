import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Card, SectionHeader } from '@/components/ui/Card';
import { CountTile, KpiTile } from '@/features/reports/KpiTile';
import { MonthlySeriesChart } from '@/features/reports/MonthlySeriesChart';
import { RankedBars } from '@/features/reports/RankedBars';
import { PeriodPicker } from '@/features/reports/PeriodPicker';
import { ReportShell } from '@/features/reports/ReportShell';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { StatementTable } from '@/features/reports/StatementTable';
import { isoToday } from '@/models/document';
import { csvAmount, csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import { asOfLabel } from '@/models/reportPeriod';
import {
  getInventoryPerformance,
  getInventoryValuation,
  getInventoryValuationTrend,
} from '@/networks/reports/inventoryValuationNetwork';
import type { InventoryPerformanceSort } from '@/serializers/reportSerializers';
import { defaultReportRange, rangeLabel } from '@/models/reportPeriod';
import { colors } from '@/theme/tokens';
import { compactMoney, formatAmount, formatMoney } from '@/utils/money';

const TREND_MONTHS = 12;

/**
 * What the table can be ordered by.
 *
 * The backend used to sort by carrying value alone. With earnings beside stock
 * that ordering actively misleads — the stock with the most capital tied up is
 * not the stock that earns — so ordering is the control that makes the new
 * columns usable.
 */
const SORTS: { key: InventoryPerformanceSort; label: string }[] = [
  { key: 'grossProfit', label: 'Gross profit' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'marginPct', label: 'Margin' },
  { key: 'stockValue', label: 'Stock value' },
];

export default function InventoryValuationPage() {
  const navigate = useNavigate();
  // Governs the MARGIN columns only. Stock stays as of now, because those
  // figures tie to the balance sheet and a period-end valuation would not.
  const [range, setRange] = useState(defaultReportRange);
  const [sort, setSort] = useState<InventoryPerformanceSort>('grossProfit');

  const query = useQuery({
    queryKey: ['reports', 'inventory-valuation'],
    queryFn: getInventoryValuation,
  });

  // A separate query, so a failure hides the chart rather than blanking the
  // figures the user came for — and so a server deployed before this endpoint
  // existed does not take the report down.
  const trend = useQuery({
    queryKey: ['reports', 'inventory-valuation', 'trend', TREND_MONTHS],
    queryFn: () => getInventoryValuationTrend(TREND_MONTHS),
    retry: false,
  });

  // A separate query, so a failure hides the margin columns rather than
  // blanking the stock figures — and a server without the endpoint still
  // renders the report it always did.
  const perfQuery = useQuery({
    queryKey: ['reports', 'inventory-performance', range, sort],
    queryFn: () => getInventoryPerformance(range, sort),
    retry: false,
    // A new period or ranking keeps the current rows on screen, dimmed, until
    // the answer lands. Without it the table drops its revenue and margin
    // columns, the ranking card and the P&L tie-out vanish, and all of it
    // snaps back a moment later.
    placeholderData: keepPreviousData,
  });

  const report = query.data;
  const perf = perfQuery.data;
  const perfRows = perf?.rows ?? [];
  const usingPerf = perfRows.length > 0;
  const traded = perfRows.some((r) => r.revenue !== 0 || r.cogs !== 0);

  // The performance rows carry the same stock figures plus what each item
  // earned, already ordered as asked, so they replace the snapshot when
  // present. The snapshot remains the fallback.
  const rows = usingPerf
    ? perfRows.map((r) => ({
        itemId: r.itemId,
        itemName: r.itemName,
        sku: r.sku,
        category: r.category,
        qty: r.qtyOnHand,
        cost: r.unitCost,
        value: r.stockValue,
        revenue: r.revenue,
        grossProfit: r.grossProfit,
        marginPct: r.marginPct,
      }))
    : (report?.rows ?? []).map((r) => ({
        ...r,
        revenue: 0,
        grossProfit: 0,
        marginPct: null as number | null,
      }));

  const rankPoints = perfRows
    .filter((r) => r.revenue !== 0 || r.cogs !== 0)
    .map((r) => ({
      key: r.itemId,
      label: r.itemName,
      value:
        sort === 'revenue'
          ? r.revenue
          : sort === 'stockValue'
            ? r.stockValue
            : r.grossProfit,
      hint:
        r.marginPct === null
          ? `${r.unitsSold} sold`
          : `${r.unitsSold} sold · ${r.marginPct.toFixed(1)}% margin`,
    }));
  const trendPoints = (trend.data?.points ?? []).map((p) => ({
    period: p.period,
    label: p.label,
    value: p.value,
  }));

  const exportCsv = () => {
    if (!report) return;
    const out: CsvRow[] = [
      ['Inventory Valuation'],
      [asOfLabel(isoToday())],
      [],
      ['SKU', 'Item', 'Category', 'Quantity', 'Unit cost', 'Value'],
    ];
    for (const row of rows) {
      out.push([
        row.sku,
        row.itemName,
        row.category,
        row.qty,
        csvAmount(row.cost),
        csvAmount(row.value),
      ]);
    }
    out.push(['Total', '', '', '', '', csvAmount(report.totalValue)]);
    downloadCsv(csvFilename('inventory-valuation', {}), toCsv(out));
  };

  return (
    <ReportShell
      title="Inventory Valuation"
      subtitle="Stock on hand at what the books carry it at."
      onExportCsv={exportCsv}
      pdf={{
        periodLabel: asOfLabel(isoToday()),
        cacheKey: String(query.dataUpdatedAt),
        build: () => [
          {
            columns: [
              { header: 'Item', flex: 3.4 },
              { header: 'Category', flex: 2 },
              { header: 'Qty', align: 'right', flex: 1 },
              { header: 'Unit cost', align: 'right', flex: 1.6 },
              { header: 'Value', align: 'right', flex: 1.8 },
            ],
            rows: [
              ...rows.map((r) => ({
                cells: [r.itemName, r.category, r.qty.toLocaleString('en-US'), r.cost, r.value],
                sub: r.sku || undefined,
              })),
              { cells: ['Total', '', '', '', report?.totalValue ?? 0], grand: true },
            ],
          },
        ],
      }}
      controls={
        <div className="flex flex-wrap items-end gap-md">
          <PeriodPicker value={range} onChange={setRange} />
          <div>
            <p className="mb-xs text-overline text-text-tertiary">Rank by</p>
            <div className="flex flex-wrap gap-xs">
              {SORTS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={sort === o.key}
                  onClick={() => setSort(o.key)}
                  className={
                    'rounded-full border px-md py-xxs text-label-sm transition-colors ' +
                    (sort === o.key
                      ? 'border-primary bg-primary text-text-inverse'
                      : 'border-border bg-surface text-text-secondary hover:bg-surface-hover')
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
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
        <div className="flex items-start gap-sm rounded-md bg-surface-2 p-md print:hidden">
          <Info className="mt-[2px] size-4 shrink-0 text-text-secondary" />
          <p className="text-body-sm text-text-secondary">
            A snapshot of current quantities, so there is no date to choose. The
            total should agree with the Balance Sheet’s Inventory line — if it does
            not, stock and the control account have drifted apart.
          </p>
        </div>

        <div className="grid gap-md sm:grid-cols-3 print:hidden">
          <KpiTile
            label="Total value"
            value={report?.totalValue ?? 0}
            accent={colors.primary}
          />
          <CountTile label="Items" value={rows.length} hint="With a quantity on hand" />
          <CountTile
            label="Categories"
            value={report?.byCategory.length ?? 0}
          />
        </div>

        {traded && (
          <Card className="p-lg print:hidden">
            <SectionHeader
              title={`Top items by ${SORTS.find((o) => o.key === sort)?.label.toLowerCase()}`}
              right={
                <span className="text-caption text-text-tertiary">
                  {rangeLabel(range.startDate, range.endDate)}
                </span>
              }
            />
            <div className="mt-md">
              <RankedBars
                points={rankPoints}
                format={(v) => formatMoney(v)}
                emptyLabel="Nothing sold in this period."
              />
            </div>
          </Card>
        )}

        {trendPoints.length > 0 && (
          <Card className="p-lg print:hidden">
            <SectionHeader
              title="Stock value over time"
              right={
                <span className="text-caption text-text-tertiary">
                  From the inventory control account — ties to the balance sheet
                </span>
              }
            />
            <div className="mt-md">
              <MonthlySeriesChart
                points={trendPoints}
                format={(v) => formatMoney(v)}
                compact={(v) => compactMoney(v)}
              />
            </div>
          </Card>
        )}

        {(report?.byCategory.length ?? 0) > 0 && (
          <Card className="p-lg">
            <SectionHeader title="Value by category" />
            <StatementTable
              className="mt-md"
              rows={[
                ...(report?.byCategory ?? []).map((c) => ({
                  key: c.category,
                  label: c.category,
                  amount: c.totalValue,
                  depth: 1,
                })),
                {
                  label: 'Total',
                  amount: report?.totalValue ?? 0,
                  isGrand: true,
                },
              ]}
            />
          </Card>
        )}

        <Card className="p-lg">
          <ReportTitleBlock
            report="Inventory Valuation"
            periodLabel={asOfLabel(isoToday())}
          />

          <div className="mt-md overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="px-md py-sm text-left text-overline text-text-secondary">
                    Item
                  </th>
                  <th className="px-md py-sm text-left text-overline text-text-secondary">
                    Category
                  </th>
                  <th className="px-md py-sm text-right text-overline text-text-secondary">
                    Qty
                  </th>
                  <th className="px-md py-sm text-right text-overline text-text-secondary">
                    Unit cost
                  </th>
                  <th className="px-md py-sm text-right text-overline text-text-secondary">
                    Value
                  </th>
                  {usingPerf && (
                    <>
                      {/* These cover a PERIOD while the columns left of them
                          are as of now. Two different claims, said out loud. */}
                      <th className="px-md py-sm text-right text-overline whitespace-nowrap text-text-secondary">
                        Revenue
                      </th>
                      <th className="px-md py-sm text-right text-overline whitespace-nowrap text-text-secondary">
                        Gross profit
                      </th>
                      <th className="px-md py-sm text-right text-overline text-text-secondary">
                        Margin
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.itemId}
                    onClick={() => navigate(`/reports/inventory-valuation/${row.itemId}`)}
                    className="cursor-pointer border-b border-border-light hover:bg-surface-hover"
                  >
                    <td className="px-md py-sm">
                      <span className="block text-body-sm text-text-primary">
                        {row.itemName}
                      </span>
                      {row.sku && (
                        <span className="block text-caption text-text-tertiary">
                          {row.sku}
                        </span>
                      )}
                    </td>
                    <td className="px-md py-sm text-body-sm text-text-secondary">
                      {row.category}
                    </td>
                    <td className="px-md py-sm text-right tabular text-body-sm whitespace-nowrap text-text-primary">
                      {row.qty.toLocaleString('en-US')}
                    </td>
                    <td className="px-md py-sm text-right tabular text-body-sm whitespace-nowrap text-text-primary">
                      {formatAmount(row.cost)}
                    </td>
                    <td className="px-md py-sm text-right tabular text-label-lg whitespace-nowrap text-text-primary">
                      {formatAmount(row.value)}
                    </td>
                    {usingPerf && (
                      <>
                        <td className="px-md py-sm text-right tabular text-body-sm whitespace-nowrap text-text-primary">
                          {row.revenue ? formatAmount(row.revenue) : '—'}
                        </td>
                        {/* Selling below cost is the one thing on this report
                            worth interrupting someone for. */}
                        <td
                          className={
                            'px-md py-sm text-right tabular text-body-sm whitespace-nowrap ' +
                            (row.grossProfit < 0 ? 'text-danger' : 'text-text-primary')
                          }
                        >
                          {row.revenue || row.grossProfit
                            ? formatAmount(row.grossProfit)
                            : '—'}
                        </td>
                        <td
                          className={
                            'px-md py-sm text-right tabular text-body-sm whitespace-nowrap ' +
                            (row.marginPct === null
                              ? 'text-text-tertiary'
                              : row.marginPct < 0
                                ? 'text-danger'
                                : 'text-text-primary')
                          }
                        >
                          {row.marginPct === null ? '—' : `${row.marginPct.toFixed(1)}%`}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-text-primary">
                  <td className="px-md py-sm text-h5 text-text-primary" colSpan={4}>
                    Total
                  </td>
                  <td className="px-md py-sm text-right tabular text-h5 whitespace-nowrap text-text-primary">
                    {formatAmount(
                      usingPerf ? (perf?.totals.stockValue ?? 0) : (report?.totalValue ?? 0),
                    )}
                  </td>
                  {usingPerf && (
                    <>
                      <td className="px-md py-sm text-right tabular text-h5 whitespace-nowrap text-text-primary">
                        {formatAmount(perf?.totals.revenue ?? 0)}
                      </td>
                      <td className="px-md py-sm text-right tabular text-h5 whitespace-nowrap text-text-primary">
                        {formatAmount(perf?.totals.grossProfit ?? 0)}
                      </td>
                      <td className="px-md py-sm text-right tabular text-h5 whitespace-nowrap text-text-primary">
                        {perf?.totals.marginPct === null || perf === undefined
                          ? '—'
                          : `${perf.totals.marginPct.toFixed(1)}%`}
                      </td>
                    </>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {perf && traded && perf.reconciliation.items.length > 0 && (
          // Why this report does not equal the Profit & Loss, named rather than
          // left to be discovered as a discrepancy. It foots exactly: goods
          // sold plus every line below equals the P&L figure. An accountant who
          // cannot see this stops trusting the rows above it.
          <Card className="p-lg">
            <SectionHeader
              title="How this ties to Profit & Loss"
              right={
                <span className="text-caption text-text-tertiary">
                  {rangeLabel(range.startDate, range.endDate)}
                </span>
              }
            />
            <div className="mt-md overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-surface-2">
                    <th className="px-md py-sm text-left text-overline text-text-secondary">
                      Source
                    </th>
                    <th className="px-md py-sm text-right text-overline text-text-secondary">
                      Revenue
                    </th>
                    <th className="px-md py-sm text-right text-overline whitespace-nowrap text-text-secondary">
                      Cost of sales
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border-light">
                    <td className="px-md py-sm text-body-sm text-text-primary">
                      Goods sold (this report)
                    </td>
                    <td className="px-md py-sm text-right tabular text-body-sm text-text-primary">
                      {formatAmount(perf.reconciliation.itemRevenue)}
                    </td>
                    <td className="px-md py-sm text-right tabular text-body-sm text-text-primary">
                      {formatAmount(perf.reconciliation.itemCogs)}
                    </td>
                  </tr>
                  {perf.reconciliation.items.map((it) => (
                    <tr key={it.label} className="border-b border-border-light">
                      <td className="px-md py-sm text-body-sm text-text-primary">
                        {it.label}
                        <span className="block text-overline text-text-tertiary">
                          {it.reason}
                        </span>
                      </td>
                      <td className="px-md py-sm text-right tabular text-body-sm text-text-primary">
                        {it.revenue === 0 ? '—' : formatAmount(it.revenue)}
                      </td>
                      <td className="px-md py-sm text-right tabular text-body-sm text-text-primary">
                        {it.cogs === 0 ? '—' : formatAmount(it.cogs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-text-primary">
                    <td className="px-md py-sm text-label-lg text-text-primary">
                      Profit &amp; Loss
                    </td>
                    <td className="px-md py-sm text-right tabular text-label-lg text-text-primary">
                      {formatAmount(perf.reconciliation.glRevenue)}
                    </td>
                    <td className="px-md py-sm text-right tabular text-label-lg text-text-primary">
                      {formatAmount(perf.reconciliation.glCogs)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {perf.estimatedCogsShare > 0.33 && (
              <p className="mt-sm text-caption text-text-secondary">
                {Math.round(perf.estimatedCogsShare * 100)}% of the cost above was split
                across items that shared an invoice. Each invoice&rsquo;s total is exact;
                how it divides between the items on it is an estimate.
              </p>
            )}
          </Card>
        )}
      </div>
    </ReportShell>
  );
}
