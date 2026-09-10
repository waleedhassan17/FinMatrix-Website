import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Card, SectionHeader } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Field';
import { KpiTile } from '@/features/reports/KpiTile';
import { PeriodPicker } from '@/features/reports/PeriodPicker';
import { ReportShell } from '@/features/reports/ReportShell';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { StatementTable } from '@/features/reports/StatementTable';
import { csvAmount, csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import {
  comparisonRange,
  defaultReportRange,
  rangeLabel,
} from '@/models/reportPeriod';
import type { StatementRowData } from '@/models/reportStatement';
import { getCashFlow } from '@/networks/reports/cashFlowNetwork';
import type { CashFlowReport, CashFlowSection } from '@/serializers/reportSerializers';
import { colors } from '@/theme/tokens';

const ACTIVITIES: {
  key: 'operating' | 'investing' | 'financing';
  label: string;
}[] = [
  { key: 'operating', label: 'Operating' },
  { key: 'investing', label: 'Investing' },
  { key: 'financing', label: 'Financing' },
];

const sectionRows = (
  section: CashFlowSection,
  activity: string,
  prior?: CashFlowSection,
): StatementRowData[] => {
  if (section.lines.length === 0) {
    return [
      {
        key: `${activity}-empty`,
        label: 'No activity in this period',
        depth: 1,
      },
      {
        key: `${activity}-total`,
        label: `Net cash from ${activity.toLowerCase()} activities`,
        amount: section.total,
        isTotal: true,
        bold: true,
        prior: prior?.total,
      },
    ];
  }

  return [
    ...section.lines.map((line, index) => {
      // Cash-flow lines carry a server-supplied label and no account code, so the
      // comparison has to match on that label.
      const priorLine = prior?.lines.find((p) => p.label === line.label);
      return {
        key: `${activity}-${line.label}-${index}`,
        label: line.label,
        amount: line.amount,
        depth: 1,
        prior: prior ? (priorLine?.amount ?? 0) : undefined,
      };
    }),
    {
      key: `${activity}-total`,
      label: `Net cash from ${activity.toLowerCase()} activities`,
      amount: section.total,
      isTotal: true,
      bold: true,
      prior: prior?.total,
    },
  ];
};

const allRows = (
  report: CashFlowReport,
  prior?: CashFlowReport,
): StatementRowData[] => {
  const out: StatementRowData[] = [];

  for (const { key, label } of ACTIVITIES) {
    out.push({ key: `h-${key}`, label: `Cash Flows from ${label} Activities`, bold: true });
    out.push(...sectionRows(report[key], label, prior?.[key]));
  }

  out.push({
    label: 'Net change in cash',
    amount: report.netChange,
    isTotal: true,
    bold: true,
    prior: prior?.netChange,
  });
  out.push({
    label: 'Cash at beginning of period',
    amount: report.beginningCash,
    prior: prior?.beginningCash,
  });
  out.push({
    label: 'Cash at end of period',
    amount: report.endingCash,
    isGrand: true,
    prior: prior?.endingCash,
  });

  return out;
};

export default function CashFlowPage() {
  const [range, setRange] = useState(defaultReportRange);
  const [comparing, setComparing] = useState(false);

  const prior = useMemo(() => comparisonRange(range), [range]);

  const current = useQuery({
    queryKey: ['reports', 'cash-flow', range],
    queryFn: () => getCashFlow(range),
    placeholderData: keepPreviousData,
  });

  const comparison = useQuery({
    queryKey: ['reports', 'cash-flow', prior],
    queryFn: () => getCashFlow(prior),
    enabled: comparing,
    placeholderData: keepPreviousData,
  });

  const report = current.data;
  const priorReport = comparing ? comparison.data : undefined;

  const rows = useMemo(
    () => (report ? allRows(report, priorReport) : []),
    [report, priorReport],
  );

  const exportCsv = () => {
    if (!report) return;
    const out: CsvRow[] = [
      ['Cash Flow'],
      [rangeLabel(range.startDate, range.endDate)],
      ['Accrual basis — direct method'],
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
    downloadCsv(csvFilename('cash-flow', range), toCsv(out));
  };

  return (
    <ReportShell
      title="Cash Flow"
      subtitle="Where the money actually came from and went."
      controls={<PeriodPicker value={range} onChange={setRange} />}
      actions={
        <Switch
          checked={comparing}
          onCheckedChange={setComparing}
          label="Compare with prior period"
        />
      }
      onExportCsv={exportCsv}
      isLoading={current.isLoading}
      isRefetching={current.isFetching || (comparing && comparison.isFetching)}
      error={current.error as Error | null}
      onRetry={() => current.refetch()}
      hasData={Boolean(report)}
    >
      <div className="flex flex-col gap-lg">
        <div className="grid gap-md sm:grid-cols-3 print:hidden">
          <KpiTile
            label="Cash at start"
            value={report?.beginningCash ?? 0}
            accent={colors.info}
          />
          <KpiTile
            label="Net change"
            value={report?.netChange ?? 0}
            accent={(report?.netChange ?? 0) < 0 ? colors.danger : colors.success}
          />
          <KpiTile
            label="Cash at end"
            value={report?.endingCash ?? 0}
            accent={colors.primary}
          />
        </div>

        <Card className="p-lg">
          <ReportTitleBlock
            report="Statement of Cash Flows"
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

        {/* The indirect reconciliation, when the server sends it. Worth showing
            because it explains the gap between profit and cash, which is the
            question this statement exists to answer. */}
        {report?.operatingIndirect && (
          <Card className="p-lg print:hidden">
            <SectionHeader title="How profit became cash" />
            <StatementTable
              className="mt-md"
              rows={[
                { label: 'Net income', amount: report.operatingIndirect.netIncome },
                ...report.operatingIndirect.adjustments.map((a, i) => ({
                  key: `adj-${a.label}-${i}`,
                  label: a.label,
                  amount: a.amount,
                  depth: 1,
                })),
                {
                  label: 'Net cash from operating activities',
                  amount: report.operatingIndirect.total,
                  isTotal: true,
                  bold: true,
                },
              ]}
            />
            <p className="mt-md text-caption text-text-tertiary">
              Profit is earned when an invoice is raised; cash arrives when it is
              paid. These adjustments are the difference.
            </p>
          </Card>
        )}

        <p className="text-caption text-text-tertiary">
          Built from real movements on the cash and bank accounts, dated when the
          money moved. Cash at end of period matches the Balance Sheet’s cash for
          the same date.
        </p>
      </div>
    </ReportShell>
  );
}
