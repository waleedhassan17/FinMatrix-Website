import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Info, X } from 'lucide-react';
import { useMemo } from 'react';

import { Card } from '@/components/ui/Card';
import { SearchInput } from '@/components/ui/SearchInput';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useDocumentCompany } from '@/features/documents/useDocumentContext';
import { BalanceWarning } from '@/features/reports/BalanceWarning';
import { Figure, FigureStrip } from '@/features/reports/FigureStrip';
import { InvestigatePanel, type InvestigateSubject } from '@/features/reports/InvestigatePanel';
import { AsOfPicker, PeriodPicker } from '@/features/reports/PeriodPicker';
import { ReportShell } from '@/features/reports/ReportShell';
import type { ReportRow } from '@/features/reports/reportPdfTable';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { StatementOptions } from '@/features/reports/StatementOptions';
import { TieOutBadge } from '@/features/reports/TieOutBadge';
import { TrialBalanceTable } from '@/features/reports/TrialBalanceTable';
import {
  isBalanceAccount,
  signedBalance,
  tbCell,
  tbColumns,
  tbTotal,
  trialBalanceView,
} from '@/features/reports/trialBalanceRows';
import { useInspectParam } from '@/features/reports/useInspectParam';
import { readEnum, readIso, useRangeParam, useReportParams } from '@/features/reports/useReportParams';
import { cn } from '@/lib/cn';
import { isoToday } from '@/models/document';
import { csvAmount, csvFilename, csvHeaderBlock, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import { asOfLabel, defaultReportRange, rangeLabel, type ReportRange } from '@/models/reportPeriod';
import { getTrialBalance } from '@/networks/reports/trialBalanceNetwork';
import type { TrialBalanceMode } from '@/serializers/reportSerializers';

const MODES: readonly TrialBalanceMode[] = ['closing', 'working', 'movement'];

const MODE_BASIS: Record<TrialBalanceMode, string> = {
  closing: 'Closing balances',
  working: 'Opening, movement and closing',
  movement: 'Movements in the period',
};

export default function TrialBalancePage() {
  const company = useDocumentCompany();
  const { params, update } = useReportParams();
  const inspect = useInspectParam();

  // Closing is what an accountant means by "trial balance", so it is the
  // default here even though the server's default stays `movement` for the
  // shipped apps — the mode is always sent.
  const mode = readEnum<TrialBalanceMode>(params.get('mode'), MODES, 'closing');
  const asOf = readIso(params.get('asOf')) ?? isoToday();
  const periodRange = useRangeParam(params, defaultReportRange);
  const range: ReportRange = useMemo(
    () => (mode === 'closing' ? { startDate: asOf, endDate: asOf } : periodRange),
    [mode, asOf, periodRange],
  );
  const search = params.get('q') ?? '';
  const flaggedOnly = params.get('flagged') === '1';
  const showZero = params.get('zero') === '1';

  const query = useQuery({
    queryKey: ['reports', 'trial-balance', mode, range.startDate, range.endDate, showZero],
    queryFn: () => getTrialBalance(range, { mode, includeZero: showZero }),
    placeholderData: keepPreviousData,
  });
  const report = query.data;
  // An older server ignores `mode` and answers in movements; say what is shown.
  const shownMode: TrialBalanceMode = report?.mode ?? mode;
  const columns = useMemo(() => tbColumns(shownMode), [shownMode]);
  const view = useMemo(
    () => (report ? trialBalanceView(report, { search, flaggedOnly, showZero }) : null),
    [report, search, flaggedOnly, showZero],
  );

  const periodLabel = mode === 'closing' ? asOfLabel(asOf) : rangeLabel(range.startDate, range.endDate);
  const fiscalYearStart = report?.fiscalYearStart || `${range.endDate.slice(0, 4)}-01-01`;

  // Each pair the mode shows must balance; the server decides each on raw figures.
  const pairs = report
    ? shownMode === 'working'
      ? [report.columnTotals.opening, report.columnTotals.period, report.columnTotals.closing].filter((p) => p !== null)
      : [{ debit: report.totalDebits, credit: report.totalCredits, isBalanced: report.isBalanced }]
    : [];
  const unbalanced = pairs.find((p) => !p.isBalanced);
  const balanced = !unbalanced;

  // ── The investigate panel ──────────────────────────────────────────────
  const subject = useMemo((): InvestigateSubject | null => {
    if (!inspect.value || !report) return null;
    const r = report.rows.find((row) => row.accountCode === inspect.value && !row.synthetic);
    if (!r) return null;
    const context = `Trial Balance · ${periodLabel}`;
    const balance = isBalanceAccount(r.accountType);
    if (shownMode === 'closing') {
      // Balance-sheet accounts are cumulative and tie on their closing
      // balance; revenue and expenses are this fiscal year's activity.
      return {
        kind: 'account',
        accountCode: r.accountCode,
        accountName: r.accountName,
        lineAmount: signedBalance(r.accountType, r),
        basis: balance ? 'closing' : 'movement',
        range: { startDate: fiscalYearStart, endDate: range.endDate },
        flags: r.flags,
        statementGroup: r.group || undefined,
        context,
      };
    }
    if (shownMode === 'working') {
      const pair = balance ? r.closing : r.period;
      return {
        kind: 'account',
        accountCode: r.accountCode,
        accountName: r.accountName,
        lineAmount: pair ? signedBalance(r.accountType, pair) : null,
        basis: balance ? 'closing' : 'movement',
        range,
        flags: r.flags,
        statementGroup: r.group || undefined,
        context,
      };
    }
    return {
      kind: 'account',
      accountCode: r.accountCode,
      accountName: r.accountName,
      lineAmount: r.accountType ? signedBalance(r.accountType, r) : null,
      basis: 'movement',
      range,
      flags: r.flags,
      statementGroup: r.group || undefined,
      context,
    };
  }, [inspect.value, report, shownMode, periodLabel, fiscalYearStart, range]);

  // ── Export: exactly the rows and columns on screen ─────────────────────
  const exportCsv = () => {
    if (!report || !view) return;
    const out: CsvRow[] = [
      ...csvHeaderBlock({
        company: company.name,
        report: 'Trial Balance',
        period: periodLabel,
        basis: MODE_BASIS[shownMode],
      }),
      ['Account', 'Name', 'Flags', ...columns.map((c) => (c.group ? `${c.group} ${c.header}` : c.header))],
    ];
    for (const vr of view.rows) {
      if (vr.type === 'group' || vr.type === 'subgroup') out.push([vr.label]);
      else if (vr.type === 'subtotal') out.push([vr.label, '', '', ...columns.map((c) => csvAmount(tbCell(vr.group, c)))]);
      else
        out.push([
          vr.row.accountCode,
          vr.row.accountName,
          vr.row.flags.join(' '),
          ...columns.map((c) => csvAmount(tbCell(vr.row, c))),
        ]);
    }
    out.push([view.filtered ? 'Total (all accounts)' : 'Total', '', '', ...columns.map((c) => csvAmount(tbTotal(report, c)))]);
    return downloadCsv(
      csvFilename(`trial-balance-${shownMode}`, mode === 'closing' ? { asOfDate: asOf } : range),
      toCsv(out),
    );
  };

  const pdfRows = (): ReportRow[] => {
    if (!report || !view) return [];
    const rows: ReportRow[] = view.rows.map((vr) => {
      if (vr.type === 'group') return { cells: [vr.label, ...columns.map(() => null)], heading: true, bold: true };
      if (vr.type === 'subgroup') return { cells: [vr.label, ...columns.map(() => null)], bold: true, depth: 1 };
      if (vr.type === 'subtotal') return { cells: [vr.label, ...columns.map((c) => tbCell(vr.group, c) || null)], total: true };
      const r = vr.row;
      return {
        cells: [`${r.accountCode} · ${r.accountName}`.replace(/^ · /, ''), ...columns.map((c) => tbCell(r, c) || null)],
        sub: r.flags.length ? r.flags.join(', ').replace(/_/g, ' ') : undefined,
        depth: view.grouped ? 1 : 0,
      };
    });
    rows.push({
      cells: [view.filtered ? 'Total (all accounts)' : 'Total', ...columns.map((c) => tbTotal(report, c))],
      grand: true,
    });
    return rows;
  };

  return (
    <ReportShell
      title="Trial Balance"
      subtitle="Every account, debits against credits."
      meta={[
        periodLabel,
        MODE_BASIS[shownMode],
        ...(report
          ? [
              <TieOutBadge
                key="tie"
                ok={balanced}
                gap={unbalanced ? unbalanced.debit - unbalanced.credit : 0}
                title="Debits = Credits"
              />,
            ]
          : []),
      ]}
      controls={
        <div className="flex flex-col gap-md">
          <SegmentedControl<TrialBalanceMode>
            className="self-start"
            label="Trial balance view"
            value={mode}
            onChange={(next) => update({ mode: next === 'closing' ? null : next, inspect: null })}
            options={[
              { value: 'closing', label: 'Closing' },
              { value: 'working', label: 'Working' },
              { value: 'movement', label: 'Movement' },
            ]}
          />
          {mode === 'closing' ? (
            <AsOfPicker value={asOf} onChange={(d) => update({ asOf: readIso(d) && d !== isoToday() ? d : null })} />
          ) : (
            <PeriodPicker
              value={range}
              onChange={(next) => {
                const fallback = defaultReportRange();
                const isDefault = next.startDate === fallback.startDate && next.endDate === fallback.endDate;
                update({ from: isDefault ? null : next.startDate, to: isDefault ? null : next.endDate });
              }}
            />
          )}
        </div>
      }
      onExportCsv={exportCsv}
      pdf={{
        periodLabel,
        basis: MODE_BASIS[shownMode],
        cacheKey: [mode, range.startDate, range.endDate, search, flaggedOnly, showZero, query.dataUpdatedAt].join('|'),
        build: () => [
          {
            columns: [
              { header: 'Account', flex: shownMode === 'working' ? 4 : 5 },
              ...columns.map((c) => ({
                header: c.group ? `${c.group} ${c.header}` : c.header,
                align: 'right' as const,
                flex: shownMode === 'working' ? 1.6 : 2,
              })),
            ],
            rows: pdfRows(),
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
          <p className="text-label-lg text-text-primary">Nothing to show</p>
          <p className="mt-xxs text-body-sm text-text-secondary">
            {mode === 'movement'
              ? 'Nothing was posted in this period — try a wider range.'
              : 'No account has a balance for these dates yet.'}
          </p>
        </>
      }
    >
      <div className="flex flex-col gap-lg">
        {report && unbalanced && (
          <BalanceWarning
            balanced={false}
            left={{ label: 'Total debits', value: unbalanced.debit }}
            right={{ label: 'Total credits', value: unbalanced.credit }}
          />
        )}

        {report?.warning && (
          <p role="status" className="flex items-start gap-sm text-body-sm text-text-secondary print:hidden">
            <AlertTriangle className="mt-[2px] size-4 shrink-0 text-warning" aria-hidden="true" />
            {report.warning}
          </p>
        )}

        {/* The distinction this report is most often misread on — only where
            it applies. A movement trial balance sums the ledger INSIDE the
            range, so January shows what moved in January, not where the
            accounts stood on the 31st. */}
        {shownMode === 'movement' && (
          <div className="flex items-start gap-sm rounded-md bg-surface-2 p-md print:hidden">
            <Info className="mt-[2px] size-4 shrink-0 text-text-secondary" aria-hidden="true" />
            <p className="text-body-sm text-text-secondary">
              These are <strong className="text-text-primary">movements in the period</strong>, not
              closing balances. For where each account stands, use the Closing view.
            </p>
          </div>
        )}

        <FigureStrip columns={3} className="print:hidden">
          <Figure label="Total debits" value={report?.totalDebits ?? 0} caption={MODE_BASIS[shownMode]} />
          <Figure label="Total credits" value={report?.totalCredits ?? 0} caption={MODE_BASIS[shownMode]} />
          <Figure
            label="Flagged accounts"
            value={String(view?.flaggedCount ?? 0)}
            tone={(view?.flaggedCount ?? 0) > 0 ? 'warning' : 'default'}
            caption={(view?.flaggedCount ?? 0) > 0 ? 'Balances worth a second look' : 'Nothing unusual'}
          />
        </FigureStrip>

        <Card className="p-lg">
          <ReportTitleBlock report="Trial Balance" periodLabel={periodLabel} />

          <div className="mt-md flex flex-wrap items-center gap-sm print:hidden">
            <SearchInput
              value={search}
              onValueChange={(q) => update({ q: q || null })}
              placeholder="Search by code or name"
              aria-label="Search accounts by code or name"
              containerClassName="w-full sm:w-72"
            />
            {view && view.flaggedCount > 0 && (
              <button
                type="button"
                aria-pressed={flaggedOnly}
                onClick={() => update({ flagged: flaggedOnly ? null : '1' })}
                className={cn(
                  'inline-flex items-center gap-xxs rounded-full border px-md py-xxs text-label-md transition-colors',
                  flaggedOnly
                    ? 'border-primary bg-primary-tint text-primary'
                    : 'border-border text-text-secondary hover:border-primary hover:text-primary',
                )}
              >
                Flagged only ({view.flaggedCount})
                {flaggedOnly && <X className="size-3.5" aria-hidden="true" />}
              </button>
            )}
            <StatementOptions
              className="ml-auto"
              // The server lists every active account of the chart when asked
              // (`includeZero`), even one with nothing in any column.
              showZero={view ? { value: showZero, onChange: (v) => update({ zero: v ? '1' : null }) } : undefined}
            />
          </div>

          <div className="mt-md">
            {report && view && (
              <TrialBalanceTable
                report={report}
                view={view}
                columns={columns}
                activeKey={inspect.value}
                onActivate={(r) => inspect.open(r.accountCode)}
              />
            )}
          </div>
        </Card>
      </div>

      <InvestigatePanel subject={subject} onClose={inspect.close} focusKey={inspect.value} />
    </ReportShell>
  );
}
