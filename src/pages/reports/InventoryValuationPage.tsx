import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';

import { Card, SectionHeader } from '@/components/ui/Card';
import { CountTile, KpiTile } from '@/features/reports/KpiTile';
import { ReportShell } from '@/features/reports/ReportShell';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { StatementTable } from '@/features/reports/StatementTable';
import { isoToday } from '@/models/document';
import { csvAmount, csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import { asOfLabel } from '@/models/reportPeriod';
import { getInventoryValuation } from '@/networks/reports/inventoryValuationNetwork';
import { colors } from '@/theme/tokens';
import { formatAmount } from '@/utils/money';

export default function InventoryValuationPage() {
  const query = useQuery({
    queryKey: ['reports', 'inventory-valuation'],
    queryFn: getInventoryValuation,
  });

  const report = query.data;
  const rows = report?.rows ?? [];

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
      isLoading={query.isLoading}
      isRefetching={query.isFetching}
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
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.itemId} className="border-b border-border-light">
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
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-text-primary">
                  <td className="px-md py-sm text-h5 text-text-primary" colSpan={4}>
                    Total
                  </td>
                  <td className="px-md py-sm text-right tabular text-h5 whitespace-nowrap text-text-primary">
                    {formatAmount(report?.totalValue ?? 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </div>
    </ReportShell>
  );
}
