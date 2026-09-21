import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { Card, SectionHeader } from '@/components/ui/Card';
import { CountTile } from '@/features/reports/KpiTile';
import { MonthlySeriesChart } from '@/features/reports/MonthlySeriesChart';
import { ReportShell } from '@/features/reports/ReportShell';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { asOfLabel } from '@/models/reportPeriod';
import { isoToday } from '@/models/document';
import {
  getInventoryItemHistory,
  getItemPerformance,
} from '@/networks/reports/inventoryValuationNetwork';
import { defaultReportRange } from '@/models/reportPeriod';
import { KpiTile } from '@/features/reports/KpiTile';
import { StatTile } from '@/components/ui/StatTile';
import { colors } from '@/theme/tokens';
import { compactMoney, formatMoney } from '@/utils/money';

const MONTHS = 12;

const compactQty = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${Math.round(n)}`;
};

/**
 * One item's history, reached by clicking a row in Inventory Valuation.
 *
 * Answers the question the valuation table raises and cannot answer: this item
 * is worth Rs X today — how did it get there?
 *
 * Quantity and value are two charts rather than one with two axes. They do not
 * share a scale, so overlaying them would put the crossing point wherever the
 * scales happened to fall, which says something about the axes and nothing
 * about the stock.
 */
export default function InventoryItemReportPage() {
  const { itemId = '' } = useParams<{ itemId: string }>();

  const query = useQuery({
    queryKey: ['reports', 'inventory-item-history', itemId, MONTHS],
    queryFn: () => getInventoryItemHistory(itemId, MONTHS),
    enabled: !!itemId,
  });

  // Same window the other reports open on. A separate query from the stock
  // history: margin is an addition to it, not a replacement, and a server
  // deployed before this endpoint existed must not blank the charts that work.
  const range = useMemo(() => defaultReportRange(), []);
  const perfQuery = useQuery({
    queryKey: ['reports', 'item-performance', itemId, range],
    queryFn: () => getItemPerformance(itemId, range),
    enabled: !!itemId,
    retry: false,
  });

  const history = query.data;
  const points = history?.points ?? [];
  const perf = perfQuery.data;
  const perfPoints = perf?.points ?? [];
  const traded = perfPoints.some((p) => p.revenue !== 0 || p.cogs !== 0);
  // Above a third, the split between items sharing an invoice is carrying
  // enough of the answer that the reader should be told before acting on it.
  const mostlyEstimated = (perf?.estimatedCogsShare ?? 0) > 0.33;

  const qtyPoints = points.map((p) => ({
    period: p.period,
    label: p.label,
    value: p.closingQty,
  }));
  const valuePoints = points.map((p) => ({
    period: p.period,
    label: p.label,
    value: p.valueKnown ? p.closingValue : null,
  }));
  const valueKnown = points.some((p) => p.valueKnown);

  const received = points.reduce((t, p) => t + p.qtyIn, 0);
  const issued = points.reduce((t, p) => t + p.qtyOut, 0);
  const onHand =
    [...points].reverse().find((p) => p.closingQty !== null)?.closingQty ?? 0;

  return (
    <ReportShell
      title={history?.itemName || 'Item history'}
      subtitle={history?.sku ? `SKU ${history.sku}` : undefined}
      back={{ to: '/reports/inventory-valuation', label: 'Inventory Valuation' }}
      isLoading={query.isLoading}
      isRefetching={query.isFetching}
      error={query.error ?? undefined}
      onRetry={() => query.refetch()}
      hasData={points.length > 0}
      empty={
        <>
          <p className="text-label-lg text-text-primary">No stock movements</p>
          <p className="mt-xxs text-body-sm text-text-secondary">
            This item has not been received, sold or adjusted yet.
          </p>
        </>
      }
    >
      <div className="flex flex-col gap-lg">
        <div className="grid gap-md sm:grid-cols-3 print:hidden">
          <CountTile label="On hand" value={onHand} />
          <CountTile label={`Received (${MONTHS}m)`} value={received} />
          <CountTile label={`Issued (${MONTHS}m)`} value={issued} />
        </div>

        <Card className="p-lg">
          <ReportTitleBlock
            report={`${history?.itemName ?? 'Item'} — stock history`}
            periodLabel={asOfLabel(isoToday())}
          />
        </Card>

        {perf && traded && (
          <>
            <div className="grid gap-md sm:grid-cols-4 print:hidden">
              <KpiTile label="Revenue" value={perf.totals.revenue} accent={colors.primary} />
              <KpiTile label="Cost of sales" value={perf.totals.cogs} accent={colors.warning} />
              <KpiTile
                label="Gross profit"
                value={perf.totals.grossProfit}
                accent={perf.totals.grossProfit >= 0 ? colors.success : colors.danger}
              />
              <StatTile
                label="Margin"
                value={perf.totals.marginPct === null ? '—' : `${perf.totals.marginPct.toFixed(1)}%`}
                tone={
                  perf.totals.marginPct !== null && perf.totals.marginPct < 0
                    ? 'danger'
                    : 'default'
                }
              />
            </div>

            {mostlyEstimated && (
              // A margin built mostly on apportioned cost is a number nobody
              // should act on without knowing that. Each invoice's total is
              // exact; how it divides between items on it is not.
              <div className="flex items-start gap-sm rounded-md bg-surface-2 p-md print:hidden">
                <Info className="mt-[2px] size-4 shrink-0 text-text-secondary" />
                <p className="text-body-sm text-text-secondary">
                  {Math.round(perf.estimatedCogsShare * 100)}% of this cost was split
                  across items that shared an invoice. Each invoice&rsquo;s total cost
                  is exact; how it divides between the items on it is an estimate.
                </p>
              </div>
            )}

            {/* Two charts, not one with two axes. Revenue and gross profit
                share a scale; margin % does not, and overlaying it would put
                the crossing point wherever the axes happened to fall. */}
            <Card className="p-lg">
              <SectionHeader title="Revenue" right={<span className="text-caption text-text-tertiary">By month</span>} />
              <div className="mt-md">
                <MonthlySeriesChart
                  points={perfPoints.map((p) => ({ period: p.period, label: p.label, value: p.revenue }))}
                  format={(v) => formatMoney(v)}
                  compact={(v) => compactMoney(v)}
                  emptyLabel="No sales in this period."
                />
              </div>
            </Card>

            <Card className="p-lg">
              <SectionHeader title="Gross profit" right={<span className="text-caption text-text-tertiary">Revenue less cost of sales</span>} />
              <div className="mt-md">
                <MonthlySeriesChart
                  points={perfPoints.map((p) => ({ period: p.period, label: p.label, value: p.grossProfit }))}
                  format={(v) => formatMoney(v)}
                  compact={(v) => compactMoney(v)}
                  color={colors.navy400}
                  emptyLabel="No sales in this period."
                />
              </div>
            </Card>
          </>
        )}

        <Card className="p-lg">
          <SectionHeader title="Stock on hand" right={<span className="text-caption text-text-tertiary">At each month end</span>} />
          <div className="mt-md">
            <MonthlySeriesChart
              points={qtyPoints}
              format={(v) => `${compactQty(v)} on hand`}
              compact={compactQty}
              emptyLabel="No movements in this period."
            />
          </div>
        </Card>

        <Card className="p-lg">
          <SectionHeader title="Stock value" right={<span className="text-caption text-text-tertiary">At each month end</span>} />
          <div className="mt-md">
            {valueKnown ? (
              <MonthlySeriesChart
                points={valuePoints}
                format={(v) => formatMoney(v)}
                compact={(v) => compactMoney(v)}
                color={colors.navy400}
              />
            ) : (
              // Stating the gap rather than drawing a plausible zero. The server
              // explains why in `coverage.message`; repeating its own words
              // keeps one explanation rather than two that drift apart.
              <div className="flex items-start gap-sm rounded-md bg-surface-2 p-md">
                <Info className="mt-[2px] size-4 shrink-0 text-text-secondary" />
                <p className="text-body-sm text-text-secondary">
                  {history?.coverage.message ||
                    'Month-end value is not available for this item yet.'}
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </ReportShell>
  );
}
