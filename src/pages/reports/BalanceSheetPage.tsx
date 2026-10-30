import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { Card } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Field';
import { useDocumentCompany } from '@/features/documents/useDocumentContext';
import { BalanceWarning } from '@/features/reports/BalanceWarning';
import { balanceSheetRows } from '@/features/reports/balanceSheetRows';
import { ComparisonPicker } from '@/features/reports/ComparisonPicker';
import { FinancialHealthStrip } from '@/features/reports/FinancialHealthStrip';
import { Figure, FigureStrip } from '@/features/reports/FigureStrip';
import { InvestigatePanel, type InvestigateSubject } from '@/features/reports/InvestigatePanel';
import { AsOfPicker } from '@/features/reports/PeriodPicker';
import { ReportShell } from '@/features/reports/ReportShell';
import { statementSection } from '@/features/reports/reportPdfTable';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { statementColumns, statementCsvRows } from '@/features/reports/statementColumns';
import { StatementOptions } from '@/features/reports/StatementOptions';
import { StatementTable } from '@/features/reports/StatementTable';
import { TieOutBadge } from '@/features/reports/TieOutBadge';
import { useInspectParam } from '@/features/reports/useInspectParam';
import { readEnum, readIso, useReportParams } from '@/features/reports/useReportParams';
import { addDays, isoToday } from '@/models/document';
import { csvFilename, csvHeaderBlock, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import {
  AS_OF_COMPARE_KEYS,
  asOfComparisonLabel,
  resolveAsOfComparison,
  type AsOfCompareKey,
} from '@/models/reportComparison';
import { asOfLabel, formatReportDate, formatShortDate } from '@/models/reportPeriod';
import { formatRatio, isZeroRow, type StatementRowData } from '@/models/reportStatement';
import { getBalanceSheet } from '@/networks/reports/balanceSheetNetwork';
import { getFinancialHealth } from '@/networks/reports/financialHealthNetwork';

const BASIS = 'Accrual basis';

export default function BalanceSheetPage() {
  const navigate = useNavigate();
  const company = useDocumentCompany();
  const { params, update } = useReportParams();
  const inspect = useInspectParam();

  // ── View state, all of it in the URL ───────────────────────────────────
  const asOfDate = readIso(params.get('asOf')) ?? isoToday();
  const compareKey = readEnum<AsOfCompareKey>(params.get('compare'), AS_OF_COMPARE_KEYS, 'none');
  const customCompare = readIso(params.get('compareTo'));
  const commonSize = params.get('size') === 'common';
  const showZero = params.get('zero') === '1';

  // The fiscal year start comes back with the statement; until the first
  // response "Prior fiscal year-end" cannot resolve, and the statement loads
  // without a comparison rather than waiting for it.
  const fyQuery = useQuery({
    queryKey: ['reports', 'balance-sheet', asOfDate, null, false],
    queryFn: () => getBalanceSheet(asOfDate),
    enabled: compareKey === 'priorFiscalYearEnd',
    placeholderData: keepPreviousData,
  });
  const compareTo = resolveAsOfComparison(compareKey, asOfDate, {
    fiscalYearStart: fyQuery.data?.fiscalYearStart,
    custom: customCompare,
  });
  const comparing = compareTo !== null;

  const query = useQuery({
    queryKey: ['reports', 'balance-sheet', asOfDate, compareTo, showZero],
    queryFn: () => getBalanceSheet(asOfDate, { compareTo: compareTo ?? undefined, includeZero: showZero }),
    placeholderData: keepPreviousData,
  });
  const report = query.data;
  const fiscalYearStart = report?.fiscalYearStart || fyQuery.data?.fiscalYearStart || '';

  const health = useQuery({
    queryKey: ['reports', 'financial-health', asOfDate],
    queryFn: () => getFinancialHealth(asOfDate),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const priorHealth = useQuery({
    queryKey: ['reports', 'financial-health', compareTo],
    queryFn: () => getFinancialHealth(compareTo as string),
    enabled: comparing,
    retry: false,
  });

  const layout = useMemo(() => (report ? balanceSheetRows(report, comparing) : null), [report, comparing]);
  const columns = useMemo(
    () =>
      statementColumns({
        comparing,
        commonSize,
        currentLabel: comparing ? formatShortDate(asOfDate) : 'Amount',
        priorLabel: compareTo ? formatShortDate(compareTo) : undefined,
        pctLabel: '% of assets',
      }),
    [comparing, commonSize, asOfDate, compareTo],
  );

  // What is exported is what is on screen: the zero filter applies to both.
  const visible = (rows: StatementRowData[]) => (showZero ? rows : rows.filter((r) => !isZeroRow(r)));
  const assetRows = layout ? visible(layout.assets) : [];
  const rightRows = layout ? visible(layout.liabilitiesAndEquity) : [];

  const comparisonLabel = asOfComparisonLabel(compareTo);
  const totals = report?.totals;
  // The server's own gap when it sends one (reports v2); an older server's
  // two totals otherwise — read only to name the size of a gap it reported.
  const gap =
    report?.gap ??
    (totals?.totalAssets && totals.totalLiabilitiesAndEquity
      ? totals.totalAssets.amount - totals.totalLiabilitiesAndEquity.amount
      : 0);

  // ── The investigate panel ──────────────────────────────────────────────
  // Balances are cumulative; the register shows how the balance got from the
  // comparison date (or the start of the fiscal year) to the statement date.
  const subject = useMemo((): InvestigateSubject | null => {
    if (!inspect.value || !layout) return null;
    const registerRange = {
      startDate: compareTo ? addDays(compareTo, 1) : fiscalYearStart || `${asOfDate.slice(0, 4)}-01-01`,
      endDate: asOfDate,
    };
    const hit = layout.lines.get(inspect.value);
    if (!hit) return null;
    const { line, section } = hit;
    const context = `Balance Sheet · ${asOfLabel(asOfDate)}`;
    if (inspect.value === 'retained-earnings') {
      return {
        kind: 'retainedEarnings',
        asOfDate,
        lineAmount: line.amount,
        context,
        posted:
          line.composite && line.accountCode
            ? {
                accountCode: line.accountCode,
                accountName: line.accountName,
                amount: line.composite.postedBalance,
                range: registerRange,
              }
            : null,
      };
    }
    if (line.synthetic) return null;
    return {
      kind: 'account',
      accountCode: line.accountCode,
      accountName: line.accountName,
      lineAmount: line.amount,
      basis: 'closing',
      range: registerRange,
      statementGroup: section.label,
      context,
      movement: compareTo
        ? {
            range: registerRange,
            compare: null,
            caption: `Change between ${formatShortDate(compareTo)} and ${formatShortDate(asOfDate)}`,
          }
        : null,
    };
  }, [inspect.value, layout, asOfDate, compareTo, fiscalYearStart]);

  const activate = (row: StatementRowData) => {
    if (!row.key) return;
    if (row.key === 'synthetic-currentYearEarnings') {
      // The current year's earnings ARE the P&L for the fiscal year to date.
      navigate(`/reports/profit-loss?from=${fiscalYearStart || `${asOfDate.slice(0, 4)}-01-01`}&to=${asOfDate}`);
      return;
    }
    inspect.open(row.key);
  };

  const exportCsv = () => {
    if (!report) return;
    const out: CsvRow[] = [
      ...csvHeaderBlock({
        company: company.name,
        report: 'Balance Sheet',
        period: asOfLabel(asOfDate),
        basis: BASIS,
        comparison: comparisonLabel,
      }),
      ['ASSETS'],
      ...statementCsvRows(assetRows, columns),
      [],
      ['LIABILITIES AND EQUITY'],
      ...statementCsvRows(rightRows, columns),
    ];
    return downloadCsv(csvFilename('balance-sheet', { asOfDate }), toCsv(out));
  };

  return (
    <ReportShell
      title="Balance Sheet"
      subtitle="What the business owns and owes on a given day."
      meta={[
        asOfLabel(asOfDate),
        BASIS,
        ...(comparisonLabel ? [comparisonLabel] : []),
        ...(report
          ? [
              <TieOutBadge
                key="tie"
                ok={report.isBalanced}
                gap={gap}
                title="Assets = Liabilities + Equity"
              />,
            ]
          : []),
      ]}
      controls={
        <div className="flex flex-wrap items-start gap-md">
          <AsOfPicker value={asOfDate} onChange={(d) => update({ asOf: readIso(d) && d !== isoToday() ? d : null })} />
          <ComparisonPicker
            kind="asOf"
            value={compareKey}
            asOf={asOfDate}
            fiscalYearStart={fiscalYearStart || undefined}
            customDate={customCompare}
            onChange={(key, date) =>
              update({ compare: key === 'none' ? null : key, compareTo: key === 'custom' ? date : null })
            }
          />
        </div>
      }
      onExportCsv={exportCsv}
      pdf={{
        periodLabel: asOfLabel(asOfDate),
        basis: BASIS,
        comparisonLabel,
        cacheKey: [asOfDate, compareTo, commonSize, showZero, query.dataUpdatedAt].join('|'),
        build: () => [
          statementSection(assetRows, { title: 'Assets', columns }),
          statementSection(rightRows, { title: 'Liabilities and Equity', columns }),
        ],
      }}
      isLoading={query.isLoading}
      isRefetching={query.isFetching}
      error={query.error as Error | null}
      onRetry={() => query.refetch()}
      hasData={Boolean(report)}
    >
      <div className="flex flex-col gap-lg">
        {report && !report.isBalanced && totals?.totalAssets && totals.totalLiabilitiesAndEquity && (
          <BalanceWarning
            balanced={false}
            left={{ label: 'Total assets', value: totals.totalAssets.amount }}
            right={{ label: 'Liabilities and equity', value: totals.totalLiabilitiesAndEquity.amount }}
          />
        )}

        {health.data && Object.keys(health.data.kpis).length > 0 ? (
          <FinancialHealthStrip
            className="print:hidden"
            health={health.data}
            prior={comparing ? priorHealth.data : undefined}
            priorLabel={compareTo ? `vs ${formatShortDate(compareTo)}` : undefined}
          />
        ) : (
          // The health endpoint is reports v2; against an older server the
          // page keeps its headline totals.
          <FigureStrip columns={3} className="print:hidden">
            <Figure label="Total assets" value={report?.totalAssets ?? 0} caption="What the business owns" />
            <Figure
              label="Total liabilities"
              value={report?.totalLiabilities ?? 0}
              caption={`${formatRatio(report?.totalLiabilities ?? 0, report?.totalAssets ?? 0)} of assets`}
            />
            <Figure
              label="Total equity"
              value={report?.totalEquity ?? 0}
              tone={(report?.totalEquity ?? 0) < 0 ? 'danger' : 'default'}
              caption={`${formatRatio(report?.totalEquity ?? 0, report?.totalAssets ?? 0)} of assets`}
            />
          </FigureStrip>
        )}

        <Card className="p-lg">
          <ReportTitleBlock report="Balance Sheet" periodLabel={asOfLabel(asOfDate)} />

          <StatementOptions
            className="mt-md"
            // The server lists every active account with no balance when asked
            // (`includeZero`), so the whole chart is one switch away.
            showZero={{ value: showZero, onChange: (v) => update({ zero: v ? '1' : null }) }}
          >
            <Switch
              checked={commonSize}
              onCheckedChange={(v) => update({ size: v ? 'common' : null })}
              label={<span className="text-body-sm">% of total assets</span>}
            />
          </StatementOptions>

          <h3 className="mt-lg text-overline text-text-secondary">Assets</h3>
          <StatementTable
            className="mt-xs"
            caption="Assets"
            rows={assetRows}
            columns={columns}
            onRowActivate={activate}
            activeKey={inspect.value}
          />

          <h3 className="mt-xl text-overline text-text-secondary">Liabilities and Equity</h3>
          <StatementTable
            className="mt-xs"
            caption="Liabilities and equity"
            rows={rightRows}
            columns={columns}
            onRowActivate={activate}
            activeKey={inspect.value}
          />
        </Card>

        <p className="text-caption text-text-tertiary print:hidden">
          Balances are cumulative through {formatReportDate(asOfDate)}. Open any line to see the postings
          behind it; Net Income (current fiscal year) opens the Profit &amp; Loss for the same dates.
        </p>
      </div>

      <InvestigatePanel subject={subject} onClose={inspect.close} focusKey={inspect.value} />
    </ReportShell>
  );
}
