import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { Card } from '@/components/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Field';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useDocumentCompany } from '@/features/documents/useDocumentContext';
import { CashAccountsTable } from '@/features/reports/CashAccountsTable';
import { CashFlowMonthly } from '@/features/reports/CashFlowMonthly';
import { ComparisonPicker } from '@/features/reports/ComparisonPicker';
import { Figure, FigureStrip } from '@/features/reports/FigureStrip';
import { InvestigatePanel, type InvestigateSubject } from '@/features/reports/InvestigatePanel';
import { KpiCard } from '@/features/reports/KpiCard';
import { PeriodPicker } from '@/features/reports/PeriodPicker';
import { ReportShell } from '@/features/reports/ReportShell';
import { statementSection } from '@/features/reports/reportPdfTable';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { SeriesChart, type ChartSeries } from '@/features/reports/SeriesChart';
import { statementColumns, statementCsvRows } from '@/features/reports/statementColumns';
import { StatementOptions } from '@/features/reports/StatementOptions';
import { StatementTable } from '@/features/reports/StatementTable';
import { TieOutBadge } from '@/features/reports/TieOutBadge';
import { useInspectParam } from '@/features/reports/useInspectParam';
import { readEnum, useRangeParam, useReportParams } from '@/features/reports/useReportParams';
import { csvFilename, csvHeaderBlock, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import {
  RANGE_COMPARE_KEYS,
  rangeComparisonLabel,
  resolveRangeComparison,
  type RangeCompareKey,
} from '@/models/reportComparison';
import { defaultReportRange, formatShortDate, rangeLabel, type ReportRange } from '@/models/reportPeriod';
import type { StatementRowData } from '@/models/reportStatement';
import { getBalanceSheet } from '@/networks/reports/balanceSheetNetwork';
import { getCashFlow } from '@/networks/reports/cashFlowNetwork';
import { getFinancialHealth } from '@/networks/reports/financialHealthNetwork';
import type { CashFlowLine, CashFlowReport, CashFlowSection } from '@/serializers/reportSerializers';
import { CATEGORY_PALETTE } from '@/theme/tokens';
import { parenNegative } from '@/utils/money';

type Method = 'direct' | 'indirect';
type View = 'statement' | 'accounts' | 'monthly';

const ACTIVITIES: { key: 'operating' | 'investing' | 'financing'; label: string }[] = [
  { key: 'operating', label: 'Operating' },
  { key: 'investing', label: 'Investing' },
  { key: 'financing', label: 'Financing' },
];

/** A line's identity across two periods: its key, or its label from an older server. */
const lineId = (line: CashFlowLine) => line.lineKey ?? line.label;

const lineRows = (lines: CashFlowLine[], activity: string, prior?: CashFlowLine[]): StatementRowData[] =>
  lines.map((line, index) => {
    const priorLine = prior?.find((p) => lineId(p) === lineId(line));
    return {
      key: line.lineKey ? `cf:${line.lineKey}` : `${activity}-${line.label}-${index}`,
      label: line.label,
      amount: line.amount,
      depth: 1,
      prior: prior ? (priorLine?.amount ?? 0) : undefined,
      // Only a keyed line can be opened: the key is how its cash rows are found.
      drill: !!line.lineKey,
      kind: 'account',
    };
  });

const sectionRows = (
  section: CashFlowSection,
  activity: string,
  prior: CashFlowSection | undefined,
  operatingIndirect: CashFlowReport['operatingIndirect'] | undefined,
  priorIndirect: CashFlowReport['operatingIndirect'] | undefined,
): StatementRowData[] => {
  const total: StatementRowData = {
    key: `${activity}-total`,
    label: `Net cash from ${activity.toLowerCase()} activities`,
    amount: section.total,
    isTotal: true,
    bold: true,
    prior: prior?.total,
  };
  if (operatingIndirect) {
    // The indirect method: start at net income, then what moved without cash.
    return [
      {
        key: 'cf-net-income',
        label: 'Net income',
        amount: operatingIndirect.netIncome,
        depth: 1,
        prior: priorIndirect?.netIncome,
        kind: 'account',
        drill: true,
      },
      ...lineRows(operatingIndirect.adjustments, `${activity}-adj`, priorIndirect?.adjustments),
      total,
    ];
  }
  if (section.lines.length === 0) {
    return [{ key: `${activity}-empty`, label: 'No activity in this period', depth: 1 }, total];
  }
  return [...lineRows(section.lines, activity, prior?.lines), total];
};

const statementRows = (report: CashFlowReport, method: Method, prior?: CashFlowReport): StatementRowData[] => {
  const out: StatementRowData[] = [];
  for (const { key, label } of ACTIVITIES) {
    out.push({ key: `h-${key}`, label: `Cash Flows from ${label} Activities`, bold: true, section: key });
    const indirect = method === 'indirect' && key === 'operating' ? report.operatingIndirect : undefined;
    out.push(
      ...sectionRows(report[key], label, prior?.[key], indirect, indirect ? prior?.operatingIndirect : undefined).map(
        (r) => ({ ...r, section: key }),
      ),
    );
  }
  out.push(
    { key: 'net-change', label: 'Net change in cash', amount: report.netChange, isTotal: true, bold: true, prior: prior?.netChange },
    { key: 'beginning', label: 'Cash at beginning of period', amount: report.beginningCash, prior: prior?.beginningCash },
    { key: 'ending', label: 'Cash at end of period', amount: report.endingCash, isGrand: true, prior: prior?.endingCash },
  );
  return out;
};

// For a server that sends only the net by month (before `monthly[]`).
const NET_SERIES: ChartSeries[] = [{ key: 'value', label: 'Net cash movement', kind: 'bar', color: CATEGORY_PALETTE[0] }];

export default function CashFlowPage() {
  const navigate = useNavigate();
  const company = useDocumentCompany();
  const { params, update } = useReportParams();
  const inspect = useInspectParam();

  const range = useRangeParam(params, defaultReportRange);
  const method = readEnum<Method>(params.get('method'), ['direct', 'indirect'], 'direct');
  const view = readEnum<View>(params.get('view'), ['statement', 'accounts', 'monthly'], 'statement');
  const compareKey = readEnum<RangeCompareKey>(params.get('compare'), RANGE_COMPARE_KEYS, 'none');
  const comparing = compareKey !== 'none';
  const prior = useMemo(
    () => resolveRangeComparison(compareKey === 'none' ? 'previous' : compareKey, range) as ReportRange,
    [compareKey, range],
  );

  const current = useQuery({
    queryKey: ['reports', 'cash-flow', range],
    queryFn: () => getCashFlow(range),
    placeholderData: keepPreviousData,
  });
  // A second call: the cash-flow endpoint takes no comparison parameter.
  const comparison = useQuery({
    queryKey: ['reports', 'cash-flow', prior],
    queryFn: () => getCashFlow(prior),
    enabled: comparing,
    placeholderData: keepPreviousData,
  });
  const health = useQuery({
    queryKey: ['reports', 'financial-health', range.endDate],
    queryFn: () => getFinancialHealth(range.endDate),
    placeholderData: keepPreviousData,
    retry: false,
  });
  // The balance sheet at the end date — the other side of "ending cash ties" —
  // fetched only when the cash-flow response does not state the tie itself.
  const needsBalanceSheet = !!current.data && !current.data.cashTie;
  const balanceSheet = useQuery({
    queryKey: ['reports', 'balance-sheet', range.endDate, null, false],
    queryFn: () => getBalanceSheet(range.endDate),
    enabled: needsBalanceSheet,
    retry: false,
  });

  const report = current.data;
  const priorReport = comparing ? comparison.data : undefined;
  const indirectAvailable = !!report?.operatingIndirect;
  const shownMethod: Method = method === 'indirect' && indirectAvailable ? 'indirect' : 'direct';

  const rows = useMemo(
    () => (report ? statementRows(report, shownMethod, priorReport) : []),
    [report, shownMethod, priorReport],
  );
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
  const basis = shownMethod === 'direct' ? 'Direct method' : 'Indirect method';

  // Ending cash against the balance sheet's Cash and Bank for the same day:
  // the server's own verdict (reports v2), else the two figures side by side.
  const bsCash = report?.cashTie
    ? report.cashTie.balanceSheetCash
    : balanceSheet.data?.grouped
      ? balanceSheet.data.sections.find((s) => s.key === 'cashAndBank')?.subtotal
      : undefined;
  const cashGap = report && bsCash !== undefined ? report.endingCash - bsCash : null;
  const cashTies = report?.cashTie ? report.cashTie.ties : cashGap !== null && Math.abs(cashGap) < 0.005;

  // ── The investigate panel ──────────────────────────────────────────────
  const subject = useMemo((): InvestigateSubject | null => {
    if (!inspect.value || !report) return null;
    const context = `Cash Flow · ${rangeLabel(range.startDate, range.endDate)}`;
    if (inspect.value.startsWith('cf:')) {
      const lineKey = inspect.value.slice(3);
      const all = [
        ...report.operating.lines,
        ...report.investing.lines,
        ...report.financing.lines,
        ...(report.operatingIndirect?.adjustments ?? []),
      ];
      const line = all.find((l) => l.lineKey === lineKey);
      return line
        ? { kind: 'cashFlowLine', lineKey, label: line.label, lineAmount: line.amount, range, context }
        : null;
    }
    if (inspect.value.startsWith('acct:')) {
      const code = inspect.value.slice(5);
      const account = report.accounts.find((a) => a.accountCode === code);
      return account
        ? {
            kind: 'account',
            accountCode: account.accountCode,
            accountName: account.accountName,
            lineAmount: account.ending,
            basis: 'closing',
            range,
            statementGroup: 'Cash and Bank',
            context,
          }
        : null;
    }
    return null;
  }, [inspect.value, report, range]);

  const activate = (row: StatementRowData) => {
    if (row.key === 'cf-net-income') {
      navigate(`/reports/profit-loss?from=${range.startDate}&to=${range.endDate}`);
      return;
    }
    if (row.key) inspect.open(row.key);
  };

  const exportCsv = () => {
    if (!report) return;
    const out: CsvRow[] = [
      ...csvHeaderBlock({
        company: company.name,
        report: 'Statement of Cash Flows',
        period: rangeLabel(range.startDate, range.endDate),
        basis,
        comparison: comparisonLabel,
      }),
      ...statementCsvRows(rows, columns),
    ];
    return downloadCsv(csvFilename(`cash-flow-${shownMethod}`, range), toCsv(out));
  };

  const runway = health.data?.kpis.runwayMonths;

  return (
    <ReportShell
      title="Cash Flow"
      subtitle="Where the money actually came from and went."
      meta={[
        rangeLabel(range.startDate, range.endDate),
        basis,
        ...(comparisonLabel ? [comparisonLabel] : []),
        ...(cashGap !== null
          ? [
              <TieOutBadge
                key="tie"
                ok={cashTies}
                okLabel="Ties"
                gap={cashGap}
                title="Ending cash = Balance Sheet cash"
              />,
            ]
          : []),
      ]}
      controls={
        <div className="flex flex-wrap items-start gap-md">
          <PeriodPicker
            value={range}
            onChange={(next) => {
              const fallback = defaultReportRange();
              const isDefault = next.startDate === fallback.startDate && next.endDate === fallback.endDate;
              update({ from: isDefault ? null : next.startDate, to: isDefault ? null : next.endDate });
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
        basis: `Accrual basis — ${basis.toLowerCase()}`,
        comparisonLabel,
        cacheKey: [range.startDate, range.endDate, compareKey, shownMethod, current.dataUpdatedAt, comparison.dataUpdatedAt].join('|'),
        build: () => [statementSection(rows, { columns })],
      }}
      isLoading={current.isLoading}
      isRefetching={current.isFetching || (comparing && comparison.isFetching)}
      error={current.error as Error | null}
      onRetry={() => current.refetch()}
      hasData={Boolean(report)}
    >
      <div className="flex flex-col gap-lg">
        <FigureStrip className="print:hidden">
          <Figure label="Cash at start" value={report?.beginningCash ?? 0} caption="In cash and bank accounts" />
          <Figure
            label="Net change"
            value={report?.netChange ?? 0}
            tone={(report?.netChange ?? 0) < 0 ? 'danger' : 'default'}
            caption={(report?.netChange ?? 0) < 0 ? 'More went out than came in' : 'More came in than went out'}
          />
          <Figure label="Cash at end" value={report?.endingCash ?? 0} caption="Cash and bank on the last day" />
          {runway ? (
            <KpiCard kpi={runway} caption={`As of ${formatShortDate(range.endDate)}`} />
          ) : (
            <Figure label="Runway" value="—" caption="Needs the reports v2 API" />
          )}
        </FigureStrip>

        <Tabs value={view} onValueChange={(v) => update({ view: v === 'statement' ? null : v })}>
          <TabsList className="print:hidden">
            <TabsTrigger value="statement">Statement</TabsTrigger>
            <TabsTrigger value="accounts">Bank accounts</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>

          <TabsContent value="statement">
            <Card className="p-lg">
              <ReportTitleBlock report="Statement of Cash Flows" periodLabel={rangeLabel(range.startDate, range.endDate)} />
              <StatementOptions className="mt-md">
                <SegmentedControl<Method>
                  label="Cash flow method"
                  size="sm"
                  value={shownMethod}
                  onChange={(m) => update({ method: m === 'direct' ? null : m })}
                  options={[
                    { value: 'direct', label: 'Direct' },
                    { value: 'indirect', label: 'Indirect', disabled: !indirectAvailable },
                  ]}
                />
              </StatementOptions>
              <StatementTable
                className="mt-sm"
                caption="Statement of cash flows"
                rows={rows}
                columns={columns}
                onRowActivate={activate}
                activeKey={inspect.value}
              />
              {shownMethod === 'indirect' && (report?.operatingIndirect?.excludedNonCash.length ?? 0) > 0 && (
                <div className="mt-md rounded-md bg-surface-2 p-md text-body-sm text-text-secondary">
                  <p className="text-label-md text-text-primary">Kept out as non-cash</p>
                  <p className="mt-[2px] text-caption">
                    Moved the balance sheet without moving cash, so not counted as working capital.
                  </p>
                  <ul className="mt-xs flex flex-col gap-[2px]">
                    {report?.operatingIndirect?.excludedNonCash.map((x, i) => (
                      <li key={`${x.label}-${i}`} className="flex justify-between gap-md tabular">
                        <span>{x.label}</span>
                        <span>{parenNegative(x.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-md text-caption text-text-tertiary print:hidden">
                {shownMethod === 'direct'
                  ? 'Built from real movements on the cash and bank accounts, dated when the money moved. Open a line to see the payments behind it.'
                  : 'Starts from net income and adjusts for what moved without cash — profit is earned when an invoice is raised; cash arrives when it is paid.'}
              </p>
            </Card>
          </TabsContent>

          <TabsContent value="accounts">
            <Card className="p-lg">
              {report && (
                <CashAccountsTable
                  report={report}
                  activeKey={inspect.value?.startsWith('acct:') ? inspect.value.slice(5) : null}
                  onActivate={(a) => inspect.open(`acct:${a.accountCode}`)}
                />
              )}
            </Card>
          </TabsContent>

          <TabsContent value="monthly">
            <Card className="p-lg">
              {/* The balance and the flows as two charts on one time axis;
                  only the net, from a server that predates `monthly[]`. */}
              {report?.monthly.length ? (
                <CashFlowMonthly months={report.monthly} />
              ) : (
                <SeriesChart title="Net cash movement by month" data={report?.monthlyTrend ?? []} series={NET_SERIES} />
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <InvestigatePanel subject={subject} onClose={inspect.close} focusKey={inspect.value} />
    </ReportShell>
  );
}
