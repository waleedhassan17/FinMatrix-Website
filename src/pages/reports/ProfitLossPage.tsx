import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { useDocumentCompany } from '@/features/documents/useDocumentContext';
import { ComparisonPicker } from '@/features/reports/ComparisonPicker';
import { Figure, FigureStrip } from '@/features/reports/FigureStrip';
import { PeriodPicker } from '@/features/reports/PeriodPicker';
import { ReportShell } from '@/features/reports/ReportShell';
import { statementSection } from '@/features/reports/reportPdfTable';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { statementColumns, statementCsvRows } from '@/features/reports/statementColumns';
import { StatementLineDetail } from '@/features/reports/StatementLineDetail';
import { StatementOptions } from '@/features/reports/StatementOptions';
import { StatementTable } from '@/features/reports/StatementTable';
import { readEnum, useRangeParam, useReportParams } from '@/features/reports/useReportParams';
import { csvFilename, csvHeaderBlock, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import {
  RANGE_COMPARE_KEYS,
  rangeComparisonLabel,
  resolveRangeComparison,
  type RangeCompareKey,
} from '@/models/reportComparison';
import { defaultReportRange, rangeLabel, type ReportRange } from '@/models/reportPeriod';
import { formatRatio, reconcile, type StatementRowData } from '@/models/reportStatement';
import { getProfitLoss } from '@/networks/reports/profitLossNetwork';
import type { ProfitLossReport } from '@/serializers/reportSerializers';
import { sumMoney } from '@/utils/money';

const lineRows = (
  lines: ProfitLossReport['income'],
  priorLines: ProfitLossReport['income'] | undefined,
  section: string,
): StatementRowData[] =>
  lines.map((line) => {
    // Matched by account CODE, not position — the two periods rarely touch the
    // same accounts in the same order, and matching by index would pair a prior
    // figure with the wrong account.
    const prior = priorLines?.find((p) => p.accountCode === line.accountCode);
    return {
      key: line.accountCode || line.accountName,
      label: `${line.accountCode}  ${line.accountName}`.trim(),
      name: line.accountName,
      amount: line.amount,
      depth: 1,
      section,
      prior: priorLines ? (prior?.amount ?? 0) : undefined,
      // Carrying the code is what makes the row expandable — see
      // StatementRowData. Headings and subtotals leave it unset because they
      // span several accounts and have nothing single to drill into.
      accountCode: line.accountCode || undefined,
    };
  });

/**
 * Which way is good news, by section: more income is, more cost is not. Only
 * the Change column is coloured, and only where the answer is not a matter of
 * opinion.
 */
const RISE_IS_GOOD: Record<string, boolean> = {
  income: true,
  otherIncome: true,
  cogs: false,
  expenses: false,
  otherExpense: false,
};
const TOTAL_TONE: Record<string, boolean> = {
  'Total Income': true,
  'Total Cost of Goods Sold': false,
  'Gross Profit': true,
  'Total Expenses': false,
  'Net Operating Income': true,
  'Net Other Income': true,
  'Net Income': true,
};
const changeTone = (row: StatementRowData): boolean | null =>
  (row.section ? RISE_IS_GOOD[row.section] : undefined) ?? TOTAL_TONE[row.label] ?? null;

export default function ProfitLossPage() {
  const company = useDocumentCompany();
  const { params, update } = useReportParams();
  // The period and the comparison are in the URL (`?from=&to=&compare=`), so
  // the balance sheet's Net Income line and the cockpit can link straight to
  // the period they mean. The default — year to date — is computed per
  // render, never captured at import, so it never freezes on the day the
  // bundle loaded.
  const range = useRangeParam(params, defaultReportRange);
  const compareKey = readEnum<RangeCompareKey>(params.get('compare'), RANGE_COMPARE_KEYS, 'none');
  const comparing = compareKey !== 'none';
  // Which account lines are open. Reset when the period changes: the cached
  // transactions describe the old one, and leaving them under a new figure
  // would be right-looking and wrong.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const prior: ReportRange = useMemo(
    () => resolveRangeComparison(compareKey === 'none' ? 'previous' : compareKey, range) as ReportRange,
    [compareKey, range],
  );
  const setRange = (next: ReportRange) => {
    const fallback = defaultReportRange();
    const isDefault = next.startDate === fallback.startDate && next.endDate === fallback.endDate;
    update({ from: isDefault ? null : next.startDate, to: isDefault ? null : next.endDate });
  };

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
    out.push(...lineRows(report.income, p?.income, 'income'));
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
    out.push(...lineRows(report.cogsLines, p?.cogsLines, 'cogs'));
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
    out.push(...lineRows(report.expenseLines, p?.expenseLines, 'expenses'));
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
        out.push(...lineRows(report.otherIncome, p?.otherIncome, 'otherIncome'));
      }
      if (report.otherExpense.length > 0) {
        out.push({ label: 'Other Expenses', bold: true });
        out.push(...lineRows(report.otherExpense, p?.otherExpense, 'otherExpense'));
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

  const columns = useMemo(
    () =>
      statementColumns({
        comparing,
        currentLabel: comparing ? rangeLabel(range.startDate, range.endDate) : 'Amount',
        priorLabel: rangeLabel(prior.startDate, prior.endDate),
      }),
    [comparing, range, prior],
  );
  const comparisonLabel = comparing ? rangeComparisonLabel(prior) : null;

  const exportCsv = () => {
    if (!report) return;
    const out: CsvRow[] = [
      ...csvHeaderBlock({
        company: company.name,
        report: 'Profit & Loss',
        period: rangeLabel(range.startDate, range.endDate),
        basis: 'Accrual basis',
        comparison: comparisonLabel,
      }),
      ...statementCsvRows(rows, columns),
    ];
    return downloadCsv(csvFilename('profit-loss', range), toCsv(out));
  };

  return (
    <ReportShell
      title="Profit & Loss"
      subtitle="What you earned and what it cost over the period."
      meta={[
        rangeLabel(range.startDate, range.endDate),
        'Accrual basis',
        ...(comparisonLabel ? [comparisonLabel] : []),
      ]}
      controls={
        <div className="flex flex-wrap items-start gap-md">
          <PeriodPicker
            value={range}
            onChange={(next) => {
              setRange(next);
              // Collapse rather than refetch: the open rows describe the old
              // period, and StatementLineDetail keys its query on the range, so
              // leaving them open would fire one request per open line at once.
              setExpanded({});
            }}
          />
          <ComparisonPicker
            kind="range"
            value={compareKey}
            range={range}
            onChange={(key) => update({ compare: key === 'none' ? null : key })}
          />
        </div>
      }
      onExportCsv={exportCsv}
      pdf={{
        periodLabel: rangeLabel(range.startDate, range.endDate),
        basis: 'Accrual basis',
        comparisonLabel,
        cacheKey: [range.startDate, range.endDate, compareKey, current.dataUpdatedAt, comparison.dataUpdatedAt].join('|'),
        build: () => [statementSection(rows, { columns })],
      }}
      isLoading={current.isLoading}
      isRefetching={current.isFetching || (comparing && comparison.isFetching)}
      error={current.error as Error | null}
      onRetry={() => current.refetch()}
      hasData={Boolean(report)}
    >
      <div className="flex flex-col gap-lg">
        {/* The same figure strip as the other reports: one surface, colour
            only where it is a fact (a loss). */}
        <FigureStrip className="print:hidden">
          <Figure label="Revenue" value={report?.revenue ?? 0} caption="Income for the period" />
          <Figure
            label="Gross profit"
            value={report?.grossProfit ?? 0}
            caption={`${formatRatio(report?.grossProfit ?? 0, report?.revenue ?? 0)} gross margin`}
          />
          <Figure
            label="Expenses"
            value={report?.expenses ?? 0}
            caption={`${formatRatio(report?.expenses ?? 0, report?.revenue ?? 0)} of revenue`}
          />
          <Figure
            label="Net income"
            value={report?.netIncome ?? 0}
            tone={(report?.netIncome ?? 0) < 0 ? 'danger' : 'default'}
            caption={`${formatRatio(report?.netIncome ?? 0, report?.revenue ?? 0)} net margin`}
          />
        </FigureStrip>

        <Card className="p-lg">
          <ReportTitleBlock
            report="Profit & Loss"
            periodLabel={rangeLabel(range.startDate, range.endDate)}
          />
          <StatementOptions className="mt-md" />
          <StatementTable
            className="mt-sm"
            caption="Profit and loss"
            rows={rows}
            columns={columns}
            changeTone={changeTone}
            expanded={expanded}
            onToggle={(code) =>
              setExpanded((prev) => ({ ...prev, [code]: !prev[code] }))
            }
            renderDetail={(row) => (
              <StatementLineDetail
                accountCode={row.accountCode as string}
                range={range}
                lineAmount={row.amount}
              />
            )}
          />
        </Card>

        <p className="text-caption text-text-tertiary">
          Revenue and expenses are taken from posted journal entries, net of sales
          tax. Net income here is the figure the Balance Sheet carries into equity
          for the same period. Expand any account line to see the transactions
          that produced it.
        </p>
      </div>
    </ReportShell>
  );
}
