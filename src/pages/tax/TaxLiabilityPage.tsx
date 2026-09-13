import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Info, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { KpiTile } from '@/features/reports/KpiTile';
import { PeriodPicker } from '@/features/reports/PeriodPicker';
import { ReportShell } from '@/features/reports/ReportShell';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { TaxTabs } from '@/features/tax/TaxTabs';
import { useAdminOnly } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { csvAmount, csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import { defaultReportRange, rangeLabel } from '@/models/reportPeriod';
import { liabilityStatus } from '@/models/tax';
import { getTaxLiability } from '@/networks/tax/taxNetwork';
import { colors } from '@/theme/tokens';
import { formatAmount, formatMoney, parenNegative } from '@/utils/money';

/**
 * What the business owes in sales tax for a period, from the ledger.
 *
 * Both roles see it; only the owner can act on it. Staff get the figures and no
 * "Record payment" — recording a remittance is `@Roles('admin')` on the server,
 * and a button that answers with a 403 is exactly what the capability rules
 * exist to prevent.
 */
export default function TaxLiabilityPage() {
  const [range, setRange] = useState(defaultReportRange);
  const canPay = useAdminOnly('tax.recordPayment');

  const query = useQuery({
    queryKey: ['tax', 'liability', range],
    queryFn: () => getTaxLiability(range),
    placeholderData: keepPreviousData,
  });

  const report = query.data;
  const status = report ? liabilityStatus(report.totalNet) : null;

  const exportCsv = () => {
    if (!report) return;
    const out: CsvRow[] = [
      ['Sales Tax Liability'],
      [rangeLabel(range.startDate, range.endDate)],
      [],
      ['Tax', 'Collected', 'Paid', 'Net'],
    ];
    for (const row of report.rows) {
      out.push([row.taxName, csvAmount(row.collected), csvAmount(row.paid), csvAmount(row.net)]);
    }
    out.push(['Total', csvAmount(report.totalCollected), csvAmount(report.totalPaid), csvAmount(report.totalNet)]);
    downloadCsv(csvFilename('tax-liability', range), toCsv(out));
  };

  const payHref = report
    ? `/tax/payments/new?endDate=${range.endDate}&amount=${Math.max(0, report.totalNet).toFixed(2)}`
    : '/tax/payments/new';

  return (
    <div className="flex flex-col gap-lg">
      <TaxTabs />
      <ReportShell
        title="Tax liability"
        subtitle="Sales tax charged, less input tax recoverable and what has already been paid."
        controls={<PeriodPicker value={range} onChange={setRange} />}
        actions={
          canPay ? (
            <Button asChild size="sm">
              <Link to={payHref}>
                <ReceiptText className="size-4" />
                Record payment
              </Link>
            </Button>
          ) : undefined
        }
        onExportCsv={exportCsv}
        back={null}
        pdf={{
          periodLabel: rangeLabel(range.startDate, range.endDate),
          cacheKey: [range.startDate, range.endDate, query.dataUpdatedAt].join('|'),
          build: () => [
            {
              columns: [
                { header: 'Tax', flex: 3 },
                { header: 'Collected', align: 'right', flex: 2 },
                { header: 'Paid', align: 'right', flex: 2 },
                { header: 'Net', align: 'right', flex: 2 },
              ],
              rows: [
                ...(report?.rows ?? []).map((r) => ({ cells: [r.taxName, r.collected, r.paid, r.net] })),
                {
                  cells: ['Net', report?.totalCollected ?? 0, report?.totalPaid ?? 0, report?.totalNet ?? 0],
                  grand: true,
                },
              ],
            },
          ],
        }}
        isLoading={query.isLoading}
        isRefetching={query.isFetching}
        error={query.error as Error | null}
        onRetry={() => query.refetch()}
        hasData={Boolean(report)}
      >
        {report && status && (
          <div className="flex flex-col gap-lg">
            <div
              className={cn(
                'flex items-start gap-sm rounded-md border p-md',
                status === 'owed' && 'border-warning-light bg-warning-lighter',
                status === 'settled' && 'border-success-light bg-success-lighter',
                status === 'credit' && 'border-info-light bg-primary-tint',
              )}
            >
              {status === 'settled' ? (
                <CheckCircle2 className="mt-[2px] size-4 shrink-0 text-success" />
              ) : (
                <AlertCircle
                  className={cn(
                    'mt-[2px] size-4 shrink-0',
                    status === 'owed' ? 'text-warning' : 'text-info',
                  )}
                />
              )}
              <p className="text-body-sm text-text-primary">
                {status === 'owed' && (
                  <>
                    <strong className="tabular">{formatMoney(report.totalNet)}</strong> of sales
                    tax is outstanding for this period.
                  </>
                )}
                {status === 'settled' && 'Nothing is outstanding for this period — what was charged has been paid or offset.'}
                {status === 'credit' && (
                  <>
                    A credit of{' '}
                    <strong className="tabular">{formatMoney(-report.totalNet)}</strong> is due
                    to the business — more input tax is recoverable, or more was paid, than was
                    charged.
                  </>
                )}
              </p>
            </div>

            <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4 print:hidden">
              <KpiTile label="Output tax charged" value={report.outputTax} accent={colors.primary} />
              <KpiTile
                label="Input tax recoverable"
                value={report.inputTaxRecoverable}
                accent={colors.info}
              />
              <KpiTile label="Paid to the authority" value={report.taxRemitted} accent={colors.success} />
              <KpiTile
                label={status === 'credit' ? 'Credit due' : 'Net owed'}
                value={Math.abs(report.totalNet)}
                accent={status === 'owed' ? colors.warning : colors.success}
              />
            </div>

            <Card className="p-lg">
              <ReportTitleBlock
                report="Sales Tax Liability"
                periodLabel={rangeLabel(range.startDate, range.endDate)}
              />
              <div className="mt-md overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-surface-2">
                      <th className="px-md py-sm text-left text-overline text-text-secondary">Tax</th>
                      <th className="px-md py-sm text-right text-overline text-text-secondary">Collected</th>
                      <th className="px-md py-sm text-right text-overline text-text-secondary">Paid</th>
                      <th className="px-md py-sm text-right text-overline text-text-secondary">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr key={row.taxRateId} className="border-b border-border-light">
                        <td className="px-md py-sm text-body-sm text-text-primary">{row.taxName}</td>
                        <td className="px-md py-sm text-right text-body-sm tabular text-text-primary">
                          {row.collected ? formatAmount(row.collected) : '—'}
                        </td>
                        <td className="px-md py-sm text-right text-body-sm tabular text-text-primary">
                          {row.paid ? formatAmount(row.paid) : '—'}
                        </td>
                        <td className="px-md py-sm text-right text-body-sm tabular text-text-primary">
                          {parenNegative(row.net, '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-text-primary">
                      <td className="px-md py-sm text-h5 text-text-primary">Net</td>
                      <td className="px-md py-sm text-right text-h5 tabular text-text-primary">
                        {formatAmount(report.totalCollected)}
                      </td>
                      <td className="px-md py-sm text-right text-h5 tabular text-text-primary">
                        {formatAmount(report.totalPaid)}
                      </td>
                      <td className="px-md py-sm text-right text-h5 tabular text-text-primary">
                        {parenNegative(report.totalNet, '')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>

            <div className="flex items-start gap-sm rounded-md bg-surface-2 p-md print:hidden">
              <Info className="mt-[2px] size-4 shrink-0 text-text-secondary" />
              <p className="text-body-sm text-text-secondary">
                Every figure is a movement inside the period. A payment counts in the
                period it was made — so paying last quarter’s tax this quarter shows last
                quarter as owed and this quarter with a credit.
                {canPay && ' Payments are posted from Cash (1000).'}
              </p>
            </div>
          </div>
        )}
      </ReportShell>
    </div>
  );
}
