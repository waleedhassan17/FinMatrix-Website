import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { BalanceWarning } from '@/features/reports/BalanceWarning';
import { KpiTile } from '@/features/reports/KpiTile';
import { AsOfPicker } from '@/features/reports/PeriodPicker';
import { ReportShell } from '@/features/reports/ReportShell';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { StatementTable } from '@/features/reports/StatementTable';
import { isoToday } from '@/models/document';
import { csvAmount, csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import { asOfLabel } from '@/models/reportPeriod';
import {
  ASSET_GROUPS,
  bucketStatementLines,
  LIABILITY_GROUPS,
  reconcile,
  type BucketedLines,
  type StatementRowData,
} from '@/models/reportStatement';
import { getBalanceSheet } from '@/networks/reports/balanceSheetNetwork';
import type { StatementLine } from '@/models/reportStatement';
import { colors } from '@/theme/tokens';

/** A bucketed section rendered as heading → accounts → subtotal. */
const sectionRows = (
  bucketed: BucketedLines,
  leftoverLabel: string,
): StatementRowData[] => {
  const out: StatementRowData[] = [];

  for (const section of bucketed.sections) {
    out.push({ label: section.label, bold: true, key: `h-${section.group}` });
    for (const line of section.lines) {
      out.push({
        key: `${section.group}-${line.accountCode}`,
        label: `${line.accountCode}  ${line.accountName}`.trim(),
        amount: line.amount,
        depth: 1,
      });
    }
    out.push({
      key: `t-${section.group}`,
      label: `Total ${section.label}`,
      amount: section.subtotal,
      depth: 1,
      isTotal: true,
      bold: true,
    });
  }

  // Anything the groups did not claim. Shown rather than dropped: an account
  // missing from the balance sheet because of an odd number is far worse than one
  // under a vague heading.
  if (bucketed.leftover.length > 0) {
    out.push({ label: leftoverLabel, bold: true, key: 'h-other' });
    for (const line of bucketed.leftover) {
      out.push({
        key: `other-${line.accountCode}`,
        label: `${line.accountCode}  ${line.accountName}`.trim(),
        amount: line.amount,
        depth: 1,
      });
    }
    out.push({
      key: 't-other',
      label: `Total ${leftoverLabel}`,
      amount: bucketed.leftoverSubtotal,
      depth: 1,
      isTotal: true,
      bold: true,
    });
  }

  return out;
};

const flatRows = (lines: StatementLine[], prefix: string): StatementRowData[] =>
  lines.map((line) => ({
    key: `${prefix}-${line.accountCode}`,
    label: `${line.accountCode}  ${line.accountName}`.trim(),
    amount: line.amount,
    depth: 1,
  }));

export default function BalanceSheetPage() {
  const [asOfDate, setAsOfDate] = useState(isoToday);

  const query = useQuery({
    queryKey: ['reports', 'balance-sheet', asOfDate],
    queryFn: () => getBalanceSheet(asOfDate),
    placeholderData: keepPreviousData,
  });

  const report = query.data;

  // The server returns flat arrays — no grouping at all — so the statement's
  // shape comes entirely from the account numbers.
  const assets = useMemo(
    () => bucketStatementLines(report?.assets, ASSET_GROUPS),
    [report],
  );
  const liabilities = useMemo(
    () => bucketStatementLines(report?.liabilities, LIABILITY_GROUPS),
    [report],
  );

  const assetRows = useMemo((): StatementRowData[] => {
    if (!report) return [];
    return [
      ...sectionRows(assets, 'Other Assets'),
      {
        label: 'TOTAL ASSETS',
        amount: reconcile(
          assets.sections.reduce((s, x) => s + x.subtotal, 0) +
            assets.leftoverSubtotal,
          report.totalAssets,
          'Balance Sheet — assets',
        ),
        isGrand: true,
      },
    ];
  }, [report, assets]);

  const liabilityRows = useMemo((): StatementRowData[] => {
    if (!report) return [];
    return [
      ...sectionRows(liabilities, 'Other Liabilities'),
      {
        label: 'Total Liabilities',
        amount: reconcile(
          liabilities.sections.reduce((s, x) => s + x.subtotal, 0) +
            liabilities.leftoverSubtotal,
          report.totalLiabilities,
          'Balance Sheet — liabilities',
        ),
        isTotal: true,
        bold: true,
      },
      { label: 'Equity', bold: true, key: 'h-equity' },
      ...flatRows(report.equity, 'equity'),
      {
        label: 'Total Equity',
        amount: report.totalEquity,
        isTotal: true,
        bold: true,
      },
      {
        label: 'TOTAL LIABILITIES AND EQUITY',
        // The one figure on the statement added on this side, because the server
        // sends the two halves and not their sum. Whether it ties to total assets
        // is answered by `BalanceWarning` above — prominently and with the
        // difference named — rather than by a dev-only console warning nobody
        // running the business will ever see.
        amount: report.totalLiabilities + report.totalEquity,
        isGrand: true,
      },
    ];
  }, [report, liabilities]);

  const exportCsv = () => {
    if (!report) return;
    const out: CsvRow[] = [
      ['Balance Sheet'],
      [asOfLabel(asOfDate)],
      ['Accrual basis'],
      [],
      ['Line', 'Amount'],
      ['ASSETS'],
    ];
    for (const row of assetRows) out.push([row.label, csvAmount(row.amount)]);
    out.push([], ['LIABILITIES AND EQUITY']);
    for (const row of liabilityRows) out.push([row.label, csvAmount(row.amount)]);

    downloadCsv(csvFilename('balance-sheet', { asOfDate }), toCsv(out));
  };

  return (
    <ReportShell
      title="Balance Sheet"
      subtitle="What the business owns and owes on a given day."
      controls={<AsOfPicker value={asOfDate} onChange={setAsOfDate} />}
      onExportCsv={exportCsv}
      isLoading={query.isLoading}
      isRefetching={query.isFetching}
      error={query.error as Error | null}
      onRetry={() => query.refetch()}
      hasData={Boolean(report)}
    >
      <div className="flex flex-col gap-lg">
        {report && (
          <BalanceWarning
            balanced={report.isBalanced}
            left={{ label: 'Total assets', value: report.totalAssets }}
            right={{
              label: 'Liabilities and equity',
              value: report.totalLiabilities + report.totalEquity,
            }}
          />
        )}

        <div className="grid gap-md sm:grid-cols-3 print:hidden">
          <KpiTile label="Total assets" value={report?.totalAssets ?? 0} accent={colors.info} />
          <KpiTile
            label="Total liabilities"
            value={report?.totalLiabilities ?? 0}
            accent={colors.warning}
          />
          <KpiTile label="Total equity" value={report?.totalEquity ?? 0} accent={colors.primary} />
        </div>

        <Card className="p-lg">
          <ReportTitleBlock report="Balance Sheet" periodLabel={asOfLabel(asOfDate)} />

          <h3 className="mt-lg text-overline text-text-secondary">Assets</h3>
          <StatementTable className="mt-xs" rows={assetRows} />

          <h3 className="mt-xl text-overline text-text-secondary">
            Liabilities and Equity
          </h3>
          <StatementTable className="mt-xs" rows={liabilityRows} />
        </Card>

        <p className="text-caption text-text-tertiary">
          Balances are cumulative through {asOfLabel(asOfDate).toLowerCase()}. The
          current period’s earnings are carried into equity as Net Income, which
          matches the figure on the Profit &amp; Loss for the same period.
        </p>
      </div>
    </ReportShell>
  );
}
