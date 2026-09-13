import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Field';
import { KpiTile } from '@/features/reports/KpiTile';
import { PeriodPicker } from '@/features/reports/PeriodPicker';
import { ReportShell } from '@/features/reports/ReportShell';
import { statementSection } from '@/features/reports/reportPdfTable';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { StatementTable } from '@/features/reports/StatementTable';
import { csvAmount, csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import {
  comparisonRange,
  defaultReportRange,
  rangeLabel,
} from '@/models/reportPeriod';
import { reconcile, type StatementRowData } from '@/models/reportStatement';
import { getProfitLoss } from '@/networks/reports/profitLossNetwork';
import type { ProfitLossReport } from '@/serializers/reportSerializers';
import { colors } from '@/theme/tokens';
import { sumMoney } from '@/utils/money';

const lineRows = (
  lines: ProfitLossReport['income'],
  priorLines?: ProfitLossReport['income'],
): StatementRowData[] =>
  lines.map((line) => {
    // Matched by account CODE, not position — the two periods rarely touch the
    // same accounts in the same order, and matching by index would pair a prior
    // figure with the wrong account.
    const prior = priorLines?.find((p) => p.accountCode === line.accountCode);
    return {
      key: line.accountCode || line.accountName,
      label: `${line.accountCode}  ${line.accountName}`.trim(),
      amount: line.amount,
      depth: 1,
      prior: priorLines ? (prior?.amount ?? 0) : undefined,
    };
  });

export default function ProfitLossPage() {
  // In component state, not module scope: a range captured once at import freezes
  // its end date on the day the bundle loaded.
  const [range, setRange] = useState(defaultReportRange);
  const [comparing, setComparing] = useState(false);

  const prior = useMemo(() => comparisonRange(range), [range]);

  const current = useQuery({
    queryKey: ['reports', 'profit-loss', range],
    queryFn: () => getProfitLoss(range),
    placeholderData: keepPreviousData,
  });

  // A second call, because no endpoint takes a comparison parameter.
  const comparison = useQuery({
    queryKey: ['reports', 'profit-loss', prior],
    queryFn: () => getProfitLoss(prior),
    enabled: comparing,
    placeholderData: keepPreviousData,
  });

  const report = current.data;
  const priorReport = comparing ? comparison.data : undefined;

  const rows = useMemo((): StatementRowData[] => {
    if (!report) return [];
    const p = priorReport;
    const out: StatementRowData[] = [];

    out.push({ label: 'Income', bold: true });
    out.push(...lineRows(report.income, p?.income));
    out.push({
      label: 'Total Income',
      // Every total is the server's. It foots from unrounded four-decimal figures
      // and rounds once; re-adding the rounded lines here is what makes a
      // statement disagree with itself by a paisa.
      amount: reconcile(
        sumMoney(report.income.map((l) => l.amount)).toNumber(),
        report.totalIncome,
        'P&L — income',
      ),
      isTotal: true,
      bold: true,
      prior: p?.totalIncome,
    });

    out.push({ label: 'Cost of Goods Sold', bold: true });
    out.push(...lineRows(report.cogsLines, p?.cogsLines));
    out.push({
      label: 'Total Cost of Goods Sold',
      amount: reconcile(
        sumMoney(report.cogsLines.map((l) => l.amount)).toNumber(),
        report.totalCogs,
        'P&L — COGS',
      ),
      isTotal: true,
      bold: true,
      prior: p?.totalCogs,
    });

    out.push({
      label: 'Gross Profit',
      amount: report.grossProfit,
      isTotal: true,
      bold: true,
      prior: p?.grossProfit,
    });

    out.push({ label: 'Expenses', bold: true });
    out.push(...lineRows(report.expenseLines, p?.expenseLines));
    out.push({
      label: 'Total Expenses',
      amount: reconcile(
        sumMoney(report.expenseLines.map((l) => l.amount)).toNumber(),
        report.totalExpenses,
        'P&L — expenses',
      ),
      isTotal: true,
      bold: true,
      prior: p?.totalExpenses,
    });

    out.push({
      label: 'Net Operating Income',
      amount: report.netOperatingIncome,
      isTotal: true,
      bold: true,
      prior: p?.netOperatingIncome,
    });

    // Shown only when they carry something. A statement with empty "Other Income"
    // and "Other Expenses" headings invites the question of what is missing.
    const hasOther =
      report.otherIncome.length > 0 || report.otherExpense.length > 0;
    if (hasOther) {
      if (report.otherIncome.length > 0) {
        out.push({ label: 'Other Income', bold: true });
        out.push(...lineRows(report.otherIncome, p?.otherIncome));
      }
      if (report.otherExpense.length > 0) {
        out.push({ label: 'Other Expenses', bold: true });
        out.push(...lineRows(report.otherExpense, p?.otherExpense));
      }
      out.push({
        label: 'Net Other Income',
        amount: report.netOtherIncome,
        isTotal: true,
        bold: true,
        prior: p?.netOtherIncome,
      });
    }

    out.push({
      label: 'Net Income',
      amount: report.netIncome,
      isGrand: true,
      prior: p?.netIncome,
    });

    return out;
  }, [report, priorReport]);

  const exportCsv = () => {
    if (!report) return;
    const out: CsvRow[] = [
      ['Profit & Loss'],
      [rangeLabel(range.startDate, range.endDate)],
      ['Accrual basis'],
      [],
      comparing ? ['Line', 'Amount', 'Prior'] : ['Line', 'Amount'],
    ];
    for (const row of rows) {
      out.push(
        comparing
          ? [row.label, csvAmount(row.amount), csvAmount(row.prior)]
          : [row.label, csvAmount(row.amount)],
      );
    }
    downloadCsv(csvFilename('profit-loss', range), toCsv(out));
  };

  return (
    <ReportShell
      title="Profit & Loss"
      subtitle="What you earned and what it cost over the period."
      controls={<PeriodPicker value={range} onChange={setRange} />}
      actions={
        <Switch
          checked={comparing}
          onCheckedChange={setComparing}
          label="Compare with prior period"
        />
      }
      onExportCsv={exportCsv}
      pdf={{
        periodLabel: rangeLabel(range.startDate, range.endDate),
        basis: 'Accrual basis',
        cacheKey: [range.startDate, range.endDate, comparing, current.dataUpdatedAt, comparison.dataUpdatedAt].join('|'),
        build: () => [
          statementSection(rows, {
            comparing,
            currentLabel: rangeLabel(range.startDate, range.endDate),
            priorLabel: rangeLabel(prior.startDate, prior.endDate),
          }),
        ],
      }}
      isLoading={current.isLoading}
      isRefetching={current.isFetching || (comparing && comparison.isFetching)}
      error={current.error as Error | null}
      onRetry={() => current.refetch()}
      hasData={Boolean(report)}
    >
      <div className="flex flex-col gap-lg">
        <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4 print:hidden">
          <KpiTile label="Revenue" value={report?.revenue ?? 0} accent={colors.success} />
          <KpiTile label="Gross profit" value={report?.grossProfit ?? 0} accent={colors.info} />
          <KpiTile label="Expenses" value={report?.expenses ?? 0} accent={colors.warning} />
          <KpiTile
            label="Net income"
            value={report?.netIncome ?? 0}
            accent={(report?.netIncome ?? 0) < 0 ? colors.danger : colors.primary}
          />
        </div>

        <Card className="p-lg">
          <ReportTitleBlock
            report="Profit & Loss"
            periodLabel={rangeLabel(range.startDate, range.endDate)}
          />
          <StatementTable
            className="mt-md"
            rows={rows}
            comparing={comparing}
            currentLabel={rangeLabel(range.startDate, range.endDate)}
            priorLabel={rangeLabel(prior.startDate, prior.endDate)}
          />
        </Card>

        <p className="text-caption text-text-tertiary">
          Revenue and expenses are taken from posted journal entries, net of sales
          tax. Net income here is the figure the Balance Sheet carries into equity
          for the same period.
        </p>
      </div>
    </ReportShell>
  );
}
