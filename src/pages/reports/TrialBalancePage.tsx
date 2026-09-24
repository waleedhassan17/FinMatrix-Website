import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { useState } from 'react';

import { Card } from '@/components/ui/Card';
import { BalanceWarning } from '@/features/reports/BalanceWarning';
import { Figure, FigureStrip } from '@/features/reports/FigureStrip';
import { PeriodPicker } from '@/features/reports/PeriodPicker';
import { ReportShell } from '@/features/reports/ReportShell';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { csvAmount, csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import { defaultReportRange, rangeLabel } from '@/models/reportPeriod';
import { getTrialBalance } from '@/networks/reports/trialBalanceNetwork';
import { formatAmount, isBalanced as columnsBalance } from '@/utils/money';

export default function TrialBalancePage() {
  const [range, setRange] = useState(defaultReportRange);

  const query = useQuery({
    queryKey: ['reports', 'trial-balance', range],
    queryFn: () => getTrialBalance(range),
    placeholderData: keepPreviousData,
  });

  const report = query.data;

  /**
   * An independent check, not a substitute for the server's.
   *
   * The server decides `isBalanced` on unrounded four-decimal figures, which is
   * the verdict that counts. This sums the ROUNDED rows we are about to display:
   * if the two disagree, the rows on screen do not foot even though the ledger
   * does, which is worth knowing because it is what a reader adding up the column
   * by hand would find.
   */
  const rowsFoot = report
    ? columnsBalance(
        report.rows.map((r) => r.debit),
        report.rows.map((r) => r.credit),
      )
    : true;

  const exportCsv = () => {
    if (!report) return;
    const out: CsvRow[] = [
      ['Trial Balance'],
      [rangeLabel(range.startDate, range.endDate)],
      ['Accrual basis — movements in the period'],
      [],
      ['Account', 'Name', 'Debit', 'Credit'],
    ];
    for (const row of report.rows) {
      out.push([
        row.accountCode,
        row.accountName,
        csvAmount(row.debit),
        csvAmount(row.credit),
      ]);
    }
    out.push([
      'Total',
      '',
      csvAmount(report.totalDebits),
      csvAmount(report.totalCredits),
    ]);
    downloadCsv(csvFilename('trial-balance', range), toCsv(out));
  };

  return (
    <ReportShell
      title="Trial Balance"
      subtitle="Every account’s movement in the period, debits against credits."
      meta={[rangeLabel(range.startDate, range.endDate), 'Movements in the period']}
      controls={<PeriodPicker value={range} onChange={setRange} />}
      onExportCsv={exportCsv}
      pdf={{
        periodLabel: rangeLabel(range.startDate, range.endDate),
        basis: 'Movements in the period',
        cacheKey: [range.startDate, range.endDate, query.dataUpdatedAt].join('|'),
        build: () => [
          {
            columns: [
              { header: 'Account', flex: 5 },
              { header: 'Debit', align: 'right', flex: 2 },
              { header: 'Credit', align: 'right', flex: 2 },
            ],
            rows: [
              ...(report?.rows ?? []).map((r) => ({
                cells: [`${r.accountCode} · ${r.accountName}`, r.debit || null, r.credit || null],
              })),
              { cells: ['Total', report?.totalDebits ?? 0, report?.totalCredits ?? 0], grand: true },
            ],
          },
        ],
      }}
      isLoading={query.isLoading}
      isRefetching={query.isFetching}
      error={query.error as Error | null}
      onRetry={() => query.refetch()}
      hasData={Boolean(report)}
      empty={
        <>
          <p className="text-label-lg text-text-primary">
            Nothing posted in this period
          </p>
          <p className="mt-xxs text-body-sm text-text-secondary">
            Try a wider range — the trial balance shows movements, not opening
            balances.
          </p>
        </>
      }
    >
      <div className="flex flex-col gap-lg">
        {report && (
          <BalanceWarning
            balanced={report.isBalanced}
            left={{ label: 'Total debits', value: report.totalDebits }}
            right={{ label: 'Total credits', value: report.totalCredits }}
          />
        )}

        {/* The distinction this report is most often misread on. A trial balance
            over a range sums the ledger INSIDE that range, so January shows what
            moved in January — not where the accounts stood on the 31st. */}
        <div className="flex items-start gap-sm rounded-md bg-surface-2 p-md print:hidden">
          <Info className="mt-[2px] size-4 shrink-0 text-text-secondary" />
          <p className="text-body-sm text-text-secondary">
            These are <strong className="text-text-primary">movements in the
            period</strong>, not closing balances. For where each account stands,
            use the Balance Sheet — it always sums from the beginning.
          </p>
        </div>

        {report && !rowsFoot && report.isBalanced && (
          <p className="rounded-md border border-warning-light bg-warning-lighter p-md text-body-sm text-text-primary">
            The ledger balances, but the rounded figures shown below differ by a
            fraction. That is presentation rounding, not a posting error — the
            totals are the ledger’s own.
          </p>
        )}

        <FigureStrip columns={2} className="print:hidden">
          <Figure label="Total debits" value={report?.totalDebits ?? 0} caption="Moved in the period" />
          <Figure label="Total credits" value={report?.totalCredits ?? 0} caption="Moved in the period" />
        </FigureStrip>

        <Card className="p-lg">
          <ReportTitleBlock
            report="Trial Balance"
            periodLabel={rangeLabel(range.startDate, range.endDate)}
          />

          <div className="mt-md overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="px-md py-sm text-left text-overline text-text-secondary">
                    Account
                  </th>
                  <th className="px-md py-sm text-right text-overline text-text-secondary">
                    Debit
                  </th>
                  <th className="px-md py-sm text-right text-overline text-text-secondary">
                    Credit
                  </th>
                </tr>
              </thead>
              <tbody>
                {(report?.rows ?? []).map((row) => (
                  <tr key={row.accountCode} className="border-b border-border-light">
                    <td className="px-md py-sm">
                      <span className="block text-body-sm text-text-primary">
                        {row.accountName}
                      </span>
                      <span className="block text-caption tabular text-text-tertiary">
                        {row.accountCode}
                      </span>
                    </td>
                    {/* An em-dash rather than 0.00 — every account sits in exactly
                        one column, and a zero in the other is noise. */}
                    <td className="px-md py-sm text-right tabular text-body-sm whitespace-nowrap text-text-primary">
                      {row.debit ? formatAmount(row.debit) : '—'}
                    </td>
                    <td className="px-md py-sm text-right tabular text-body-sm whitespace-nowrap text-text-primary">
                      {row.credit ? formatAmount(row.credit) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-text-primary border-b-[3px] border-b-border-strong border-double bg-surface-2">
                  <td className="px-md py-sm text-h5 text-text-primary">Total</td>
                  <td className="px-md py-sm text-right tabular text-h5 whitespace-nowrap text-text-primary">
                    {formatAmount(report?.totalDebits ?? 0)}
                  </td>
                  <td className="px-md py-sm text-right tabular text-h5 whitespace-nowrap text-text-primary">
                    {formatAmount(report?.totalCredits ?? 0)}
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
