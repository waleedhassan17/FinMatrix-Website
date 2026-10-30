import type { UseQueryResult } from '@tanstack/react-query';
import { BarChart3, PieChart, X } from 'lucide-react';
import { useMemo, useRef } from 'react';

import type { AgingDetailParams } from '@/networks/reports/agingNetwork';

import { Button } from '@/components/ui/Button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { TablePager } from '@/components/ui/DataTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Field';
import { SearchInput } from '@/components/ui/SearchInput';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { useDocumentCompany } from '@/features/documents/useDocumentContext';
import { AgingAgeBar } from '@/features/reports/AgingAgeBar';
import { AgingChart } from '@/features/reports/AgingChart';
import { AgingPartyActions } from '@/features/reports/AgingPartyActions';
import { AgingPartyDocuments } from '@/features/reports/AgingPartyDocuments';
import { AgingScheduleChart } from '@/features/reports/AgingScheduleChart';
import { AgingSummary } from '@/features/reports/AgingSummary';
import { AgingTable } from '@/features/reports/AgingTable';
import { AgingTopParties } from '@/features/reports/AgingTopParties';
import { BucketPresetPicker } from '@/features/reports/BucketPresetPicker';
import { DonutChart } from '@/features/reports/DonutChart';
import { FigureStrip } from '@/features/reports/FigureStrip';
import { KpiCard } from '@/features/reports/KpiCard';
import { ReportShell } from '@/features/reports/ReportShell';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { cn } from '@/lib/cn';
import { plainKpi } from '@/models/kpi';
import {
  AGING_QUICK_FILTERS,
  AGING_SORT_OPTIONS,
  agingPage,
  agingStatus,
  quickFilterAgingRows,
  visibleAgingRows,
  type AgingQuickFilter,
  type AgingSort,
  type TopAgingParty,
} from '@/models/reportAging';
import { csvAmount, csvFilename, csvHeaderBlock, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import { asOfLabel, formatReportDate, formatShortDate } from '@/models/reportPeriod';
import {
  LEGACY_AGING_BUCKETS,
  notYetDueTotal,
  overdueTotal,
  type AgingPresetKey,
  type AgingReport,
  type AgingTotals,
} from '@/serializers/reportSerializers';
import { AGING_RAMP, rampSteps } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';

/** Placeholder totals, so the table and chart render their frame while loading. */
const ZERO_TOTALS: AgingTotals = {
  amounts: {},
  current: 0,
  bucket1to30: 0,
  bucket31to60: 0,
  bucket61to90: 0,
  bucket90Plus: 0,
  total: 0,
};

export interface AgingReportViewProps {
  /** "AR Aging" or "AP Aging". */
  title: string;
  subtitle: string;
  /** "Customer" or "Vendor" — the A/P payload reuses the A/R field names. */
  counterpartyHeader: string;
  /** Filename stem, e.g. `ar-aging`. */
  csvName: string;
  emptyTitle: string;
  emptyHint: string;
  /** What an unsent document is called here — "invoice" or "bill". */
  documentNoun: string;
  query: UseQueryResult<AgingReport, Error>;
  preset: AgingPresetKey | null;
  customBuckets: string;
  onPickPreset: (key: AgingPresetKey) => void;
  onApplyCustom: (buckets: string) => void;
  /** The bucket being investigated, already validated against the payload. */
  selectedBucket: string | null;
  onSelectBucket: (key: string | null) => void;
  sort: AgingSort;
  onChangeSort: (sort: AgingSort) => void;
  /** Narrows the table by party name. */
  search: string;
  onChangeSearch: (search: string) => void;
  /** Which party rows are open, keyed by party id. */
  expanded: Record<string, boolean>;
  onToggleParty: (partyId: string) => void;
  /** Open one party's documents, closing any others. */
  onOpenParty: (partyId: string) => void;
  /** 'customer' on receivables, 'vendor' on payables. */
  partyType: 'customer' | 'vendor';
  /** The bucket spec to pass through to the drill-down. */
  detailParams: AgingDetailParams;
  /** Overdue only / Over limit / 90+ days — or none. */
  quickFilter: AgingQuickFilter | null;
  onQuickFilter: (filter: AgingQuickFilter | null) => void;
  /** Bucket columns, or the account view (terms, limit, last payment, oldest due). */
  columnsView: 'buckets' | 'account';
  onColumnsView: (view: 'buckets' | 'account') => void;
  /** Which picture: the aging by period, or the schedule of what falls due. */
  chartView: 'age' | 'schedule';
  onChartView: (view: 'age' | 'schedule') => void;
  /** The age picture as a ring (the share each age holds) or as columns. */
  ageChart: 'donut' | 'bars';
  onAgeChart: (chart: 'donut' | 'bars') => void;
  /** The table's page, 25 parties a page. */
  page: number;
  onPage: (page: number) => void;
}

const QUICK_LABELS: Record<AgingQuickFilter, string> = {
  overdue: 'Overdue only',
  'over-limit': 'Over limit',
  '90plus': '90+ days',
};

/**
 * Both aging reports, which are the same report twice.
 *
 * The server builds them with one helper, so the shapes are identical down to the
 * field names — A/P rows carry a vendor in `customerName`. Rather than duplicating
 * a screen and letting the copies drift (the app's A/P screen still says "Aging
 * receivables…" while it loads, and its thunk is named `fetchARAgingReport`), the
 * two pages differ only in the labels they pass here.
 *
 * **No date control, still.** Aging closes as of now and the server decides what
 * "now" is, in the business time zone. `asOfDate` used to be accepted by the
 * unified route and silently discarded; it has been removed rather than
 * implemented, because a true as-of report needs each document's balance rebuilt
 * from payment history and `invoices.balance` only holds the current one. The
 * page states the as-of date instead.
 *
 * **There IS a bucket control.** That is the one thing about the shape of this
 * report the user genuinely gets to choose.
 */
export function AgingReportView({
  title,
  subtitle,
  counterpartyHeader,
  csvName,
  emptyTitle,
  emptyHint,
  documentNoun,
  query,
  preset,
  customBuckets,
  onPickPreset,
  onApplyCustom,
  selectedBucket,
  onSelectBucket,
  sort,
  onChangeSort,
  search,
  onChangeSearch,
  expanded,
  onToggleParty,
  onOpenParty,
  partyType,
  detailParams,
  quickFilter,
  onQuickFilter,
  columnsView,
  onColumnsView,
  chartView,
  onChartView,
  ageChart,
  onAgeChart,
  page,
  onPage,
}: AgingReportViewProps) {
  const company = useDocumentCompany();
  const tableRef = useRef<HTMLDivElement>(null);
  const report = query.data;
  const insights = report?.insights ?? null;
  const totals = report?.totals;
  // Columns come from the payload; the classic five stand in only while the
  // first response is still in flight.
  const buckets = report?.buckets ?? LEGACY_AGING_BUCKETS;
  const overdue = report ? overdueTotal(report) : 0;
  const notDue = report ? notYetDueTotal(report) : 0;

  const allRows = useMemo(() => report?.rows ?? [], [report]);
  const visibleRows = useMemo(
    () =>
      visibleAgingRows({
        rows: quickFilterAgingRows(allRows, buckets, quickFilter, report?.asOfDate ?? ''),
        buckets,
        selectedBucket,
        sort,
        search,
      }),
    [allRows, buckets, quickFilter, report?.asOfDate, selectedBucket, sort, search],
  );
  const paged = agingPage(visibleRows, page);
  const asOfDate = report?.asOfDate ?? '';
  const statusOf = (row: (typeof visibleRows)[number]) => agingStatus(row, buckets, asOfDate);
  const selectedLabel = buckets.find((b) => b.key === selectedBucket)?.label;
  const partyNoun = counterpartyHeader.toLowerCase();
  const narrowed = Boolean(selectedBucket) || search.trim().length > 0 || quickFilter !== null;
  // The account view and the limit filter need the v2 party facts.
  const hasPartyFacts = !!insights;
  const hasLimits = partyType === 'customer' && allRows.some((r) => r.creditLimit !== null);
  const accountView = hasPartyFacts && columnsView === 'account';
  const scheduleTitle = partyType === 'customer' ? 'Expected collections' : 'Cash required';
  const plural = (n: number) => `${n} ${partyNoun}${n === 1 ? '' : 's'}`;
  const asOf = asOfLabel(report?.asOfDate ?? '');

  // From the top-parties chart: narrow the table to that party, open its
  // documents, and bring the table into view — the answer to "who is this".
  const findParty = (party: TopAgingParty) => {
    onChangeSearch(party.name);
    if (party.id) onOpenParty(party.id);
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() =>
      tableRef.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' }),
    );
  };

  // What the table shows is what is exported: the same parties, the same
  // columns, the same footer label.
  const filterNote = [
    selectedLabel ? `${selectedLabel} only` : null,
    quickFilter ? QUICK_LABELS[quickFilter] : null,
    search.trim() ? `Matching “${search.trim()}”` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const termsText = (raw: string) => raw || '';
  const exportHeader = accountView
    ? [counterpartyHeader, 'Terms', ...(hasLimits ? ['Credit limit', 'Over limit'] : []), 'Last payment date', 'Last payment amount', 'Oldest due', 'Total']
    : [counterpartyHeader, ...buckets.map((b) => b.label), 'Total'];
  const exportCells = (row: (typeof visibleRows)[number]) =>
    accountView
      ? [
          row.customerName,
          termsText(row.paymentTerms),
          ...(hasLimits ? [csvAmount(row.creditLimit), row.overLimit ? 'Yes' : ''] : []),
          row.lastPaymentDate ?? '',
          csvAmount(row.lastPaymentAmount),
          row.oldestDueDate ?? '',
          csvAmount(row.total),
        ]
      : [row.customerName, ...buckets.map((b) => csvAmount(row.amounts[b.key] ?? 0)), csvAmount(row.total)];
  const totalLabel = narrowed ? 'Total (all parties)' : 'Total';

  const exportCsv = () => {
    if (!report) return;
    const out: CsvRow[] = [
      ...csvHeaderBlock({
        company: company.name,
        report: title,
        period: asOfLabel(report.asOfDate),
        basis: filterNote || 'Accrual basis',
      }),
      exportHeader,
      ...visibleRows.map(exportCells),
      accountView
        ? [totalLabel, ...exportHeader.slice(1, -1).map(() => ''), csvAmount(report.totals.total)]
        : [totalLabel, ...buckets.map((b) => csvAmount(report.totals.amounts[b.key] ?? 0)), csvAmount(report.totals.total)],
    ];
    return downloadCsv(csvFilename(csvName, { asOfDate: report.asOfDate }), toCsv(out));
  };

  return (
    <ReportShell
      title={title}
      subtitle={subtitle}
      // The report's terms, stated as facts in the header. They used to be a
      // paragraph-long banner above the figures and a footnote below them.
      meta={report ? [asOf, 'Accrual basis', `Draft ${documentNoun}s excluded`] : undefined}
      onExportCsv={exportCsv}
      // While the next bucket set loads, what is on screen is the previous
      // one — not something to export under the new heading.
      canExport={!query.isPlaceholderData}
      // The report's one parameter, above the figures like every other
      // report's period picker — and outside the area that dims while the
      // next set loads, so the tab just picked stays crisp.
      controls={
        <BucketPresetPicker
          preset={preset}
          customBuckets={customBuckets}
          onPickPreset={onPickPreset}
          onApplyCustom={onApplyCustom}
        />
      }
      pdf={{
        periodLabel: asOfLabel(report?.asOfDate ?? ''),
        basis: filterNote || undefined,
        cacheKey: [query.dataUpdatedAt, selectedBucket, quickFilter, search, columnsView, sort].join('|'),
        build: () => [
          {
            columns: [
              { header: counterpartyHeader, flex: 3 },
              ...exportHeader.slice(1, -1).map((h) => ({ header: h, align: 'right' as const, flex: 1.5 })),
              { header: 'Total', align: 'right', flex: 1.7 },
            ],
            rows: [
              ...visibleRows.map((r) => ({
                cells: accountView
                  ? exportCells(r).map((c, i) => (i === exportCells(r).length - 1 ? r.total : c))
                  : [r.customerName, ...buckets.map((b) => r.amounts[b.key] ?? 0), r.total],
              })),
              {
                cells: accountView
                  ? [totalLabel, ...exportHeader.slice(1, -1).map(() => null), report?.totals.total ?? 0]
                  : [totalLabel, ...buckets.map((b) => report?.totals.amounts[b.key] ?? 0), report?.totals.total ?? 0],
                grand: true,
              },
            ],
          },
        ],
      }}
      isLoading={query.isLoading}
      isRefetching={query.isFetching}
      error={query.error}
      onRetry={() => query.refetch()}
      hasData={(report?.rows.length ?? 0) > 0}
      empty={
        <>
          <p className="text-label-lg text-text-primary">{emptyTitle}</p>
          <p className="mt-xxs text-body-sm text-text-secondary">{emptyHint}</p>
        </>
      }
    >
      <div className="flex flex-col gap-lg">
        <div className="print:hidden">
          {insights ? (
            // Reports v2: the server's figures, each judged against its rule
            // of thumb on the server, and each with its working behind the ⓘ.
            <FigureStrip>
              <KpiCard
                kpi={plainKpi('totalOpen', 'Total outstanding', insights.totalOpen, 'money', insights.assessments.overduePct)}
                context={`${formatMoney(insights.overdue)} overdue${
                  insights.overduePct !== null ? ` (${insights.overduePct.toFixed(1)}%)` : ''
                } · ${plural(allRows.length)}`}
                footer={totals ? <AgingAgeBar buckets={buckets} totals={totals} /> : undefined}
              />
              {insights.days ? (
                <KpiCard kpi={insights.days} />
              ) : (
                <KpiCard kpi={plainKpi(partyType === 'customer' ? 'dso' : 'dpo', partyType === 'customer' ? 'Days sales outstanding' : 'Days payables outstanding', null, 'days')} />
              )}
              <KpiCard
                kpi={plainKpi(
                  'weightedAvgDaysOverdue',
                  'Average days overdue',
                  insights.weightedAvgDaysOverdue,
                  'days',
                  insights.assessments.weightedAvgDaysOverdue,
                )}
                context={insights.weightedAvgDaysOverdue === null ? 'Nothing is overdue' : 'Weighted by the balance overdue'}
              />
              <KpiCard
                kpi={plainKpi(
                  'top5SharePct',
                  `Top 5 ${partyNoun}s`,
                  insights.top5SharePct,
                  'percent',
                  insights.assessments.top5SharePct,
                )}
                context={partyType === 'customer' ? 'Share of what customers owe' : 'Share of what you owe'}
              />
            </FigureStrip>
          ) : (
            <AgingSummary
              buckets={buckets}
              totals={totals ?? ZERO_TOTALS}
              rows={allRows}
              notDue={notDue}
              overdue={overdue}
              partyNoun={partyNoun}
            />
          )}
        </div>

        {/* The two pictures. Screen-only, like the summary: the printed report
            is the table, and a chart resized for paper by a script mid-print
            is not something to hand an auditor. */}
        <Tabs
          value={insights ? chartView : 'age'}
          onValueChange={(v) => onChartView(v === 'schedule' ? 'schedule' : 'age')}
          className="print:hidden"
        >
          {insights && (
            <TabsList>
              <TabsTrigger value="age">By age</TabsTrigger>
              <TabsTrigger value="schedule">{scheduleTitle}</TabsTrigger>
            </TabsList>
          )}
          {insights && (
            <TabsContent value="schedule">
              <Card className="p-lg">
                <CardTitle className="text-h5">{scheduleTitle}</CardTitle>
                <CardDescription className="mt-[2px] text-caption text-text-tertiary">
                  {partyType === 'customer'
                    ? 'What customers owe, by when it falls due — overdue first'
                    : 'What you owe suppliers, by when it falls due — overdue first'}
                </CardDescription>
                <div className="mt-md">
                  <AgingScheduleChart schedule={insights.schedule} documentNoun={documentNoun} />
                </div>
              </Card>
            </TabsContent>
          )}
          <TabsContent value="age" className={insights ? undefined : 'pt-0'}>
        <div className="grid gap-lg xl:grid-cols-5 print:hidden">
          <Card className="flex flex-col xl:col-span-3">
            <CardHeader className="items-center">
              <div className="min-w-0">
                <CardTitle className="text-h5">
                  Outstanding by age
                  {selectedLabel && <span className="text-text-tertiary"> · {selectedLabel}</span>}
                </CardTitle>
                <CardDescription className="mt-[2px] text-caption text-text-tertiary">
                  {selectedLabel
                    ? 'The table shows this period only'
                    : `Choose a ${ageChart === 'donut' ? 'period' : 'bar'} to filter the table`}
                </CardDescription>
              </div>
              <div className="flex shrink-0 items-center gap-xs">
                {selectedBucket && (
                  <Button variant="text" size="sm" onClick={() => onSelectBucket(null)}>
                    Show all
                  </Button>
                )}
                <SegmentedControl<'donut' | 'bars'>
                  label="Chart type"
                  size="sm"
                  value={ageChart}
                  onChange={onAgeChart}
                  options={[
                    { value: 'donut', label: <PieChart className="size-4" aria-hidden="true" />, ariaLabel: 'Ring chart' },
                    { value: 'bars', label: <BarChart3 className="size-4" aria-hidden="true" />, ariaLabel: 'Bar chart' },
                  ]}
                />
              </div>
            </CardHeader>
            <div className="min-h-[18rem] flex-1 px-lg pb-md pt-md">
              {ageChart === 'donut' ? (
                <DonutChart
                  title={`What ${partyType === 'customer' ? 'customers owe' : 'you owe'}, by age`}
                  slices={buckets.map((b) => ({
                    key: b.key,
                    label: b.label,
                    value: totals?.amounts[b.key] ?? 0,
                    count: allRows.filter((r) => (r.amounts[b.key] ?? 0) > 0).length,
                  }))}
                  palette={rampSteps(buckets.length, AGING_RAMP)}
                  total={totals?.total}
                  centerLabel="Outstanding"
                  labelHeader="Age"
                  countLabel={plural}
                  selectedKey={selectedBucket}
                  onSelect={(key) => onSelectBucket(key === selectedBucket ? null : key)}
                  selectVerb="Show only"
                />
              ) : (
                <AgingChart
                  labelled
                  className="h-full min-h-[16rem]"
                  buckets={buckets}
                  totals={totals ?? ZERO_TOTALS}
                  rows={allRows}
                  selectedBucket={selectedBucket}
                  onSelectBucket={onSelectBucket}
                />
              )}
            </div>
          </Card>

          <AgingTopParties
            className="xl:col-span-2"
            buckets={buckets}
            rows={allRows}
            selectedBucket={selectedBucket}
            partyNoun={partyNoun}
            onFindParty={findParty}
          />
        </div>
          </TabsContent>
        </Tabs>

        {/* The scroll target for the top-parties chart. */}
        <div ref={tableRef} className="scroll-mt-lg">
          <Card>
            {/* On paper only. On screen the page header already names the
                company, the report and its date; a centred letterhead inside the
                card repeated all three. */}
            <div className="hidden px-lg pt-lg print:block">
              <ReportTitleBlock report={`${title} Summary`} periodLabel={asOf} />
            </div>

            {/* The toolbar. Screen-only: a printed report carries no filter, so a
                chip naming one over an apparently-unfiltered table would misread. */}
            <div className="flex flex-col gap-sm border-b border-border-light p-md sm:flex-row sm:items-center sm:justify-between print:hidden">
              <div className="flex min-w-0 flex-wrap items-center gap-sm">
                <SearchInput
                  value={search}
                  onValueChange={onChangeSearch}
                  placeholder={`Find a ${partyNoun}`}
                  aria-label={`Find a ${partyNoun}`}
                  containerClassName="w-full sm:w-[16rem]"
                />
                {selectedBucket && selectedLabel && (
                  <button
                    type="button"
                    onClick={() => onSelectBucket(null)}
                    aria-label={`Clear the ${selectedLabel} filter`}
                    className="flex h-8 items-center gap-xxs rounded-md border border-primary bg-primary-tint px-sm text-label-md text-primary hover:bg-primary-100"
                  >
                    {selectedLabel} only
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                )}
                {AGING_QUICK_FILTERS.filter(
                  (f) => (f !== 'over-limit' || hasLimits) && (f === 'overdue' || hasPartyFacts || f === '90plus'),
                ).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={quickFilter === f}
                    onClick={() => onQuickFilter(quickFilter === f ? null : f)}
                    className={cn(
                      'flex h-8 items-center gap-xxs rounded-full border px-sm text-label-md transition-colors',
                      quickFilter === f
                        ? 'border-primary bg-primary-tint text-primary'
                        : 'border-border text-text-secondary hover:border-primary hover:text-primary',
                    )}
                  >
                    {QUICK_LABELS[f]}
                    {quickFilter === f && <X className="size-3.5" aria-hidden="true" />}
                  </button>
                ))}
                <span className="text-caption text-text-tertiary">
                  {narrowed
                    ? `${visibleRows.length} of ${plural(allRows.length)}`
                    : plural(allRows.length)}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-sm">
                {hasPartyFacts && (
                  <SegmentedControl<'buckets' | 'account'>
                    label="Table columns"
                    size="sm"
                    value={columnsView}
                    onChange={onColumnsView}
                    options={[
                      { value: 'buckets', label: 'Buckets' },
                      { value: 'account', label: 'Account' },
                    ]}
                  />
                )}
                <Select
                  compact
                  value={sort}
                  onChange={onChangeSort}
                  options={AGING_SORT_OPTIONS}
                  containerClassName="w-[10.5rem]"
                />
              </div>
            </div>

            <AgingTable
              className={paged.pages > 1 ? undefined : 'rounded-b-lg'}
              buckets={buckets}
              rows={paged.rows}
              statusOf={hasPartyFacts ? statusOf : undefined}
              totals={totals ?? ZERO_TOTALS}
              counterpartyHeader={counterpartyHeader}
              selectedBucket={selectedBucket}
              onSelectBucket={onSelectBucket}
              // The footer is every party's total; say so when some are on
              // another page or filtered out.
              filtered={narrowed || paged.pages > 1}
              columnsView={accountView ? 'account' : 'buckets'}
              showCreditLimit={hasLimits}
              expanded={expanded}
              onToggleParty={onToggleParty}
              renderDetail={(row) => (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-sm px-lg pt-sm print:hidden">
                    <AgingPartyActions partyId={row.customerId} partyType={partyType} />
                    {row.lastPaymentDate && (
                      <span className="text-caption text-text-tertiary">
                        Last paid {formatShortDate(row.lastPaymentDate)}
                      </span>
                    )}
                  </div>
                <AgingPartyDocuments
                  partyId={row.customerId}
                  partyType={partyType}
                  params={detailParams}
                  // The figure this panel has to reconcile against: the bucket
                  // amount when one is selected, the row total otherwise.
                  rowAmount={
                    selectedBucket ? (row.amounts[selectedBucket] ?? 0) : row.total
                  }
                  bucketLabel={selectedLabel}
                />
                </div>
              )}
            />

            <div className="print:hidden">
              <TablePager page={paged.page} totalPages={paged.pages} total={visibleRows.length} onPage={onPage} />
            </div>

            {visibleRows.length === 0 && (
              <p className="border-t border-border-light px-lg py-lg text-center text-body-sm text-text-tertiary print:hidden">
                {search.trim()
                  ? `No ${partyNoun} matches “${search.trim()}”${selectedLabel ? ` in ${selectedLabel}` : ''}.`
                  : quickFilter
                    ? `No ${partyNoun} is ${QUICK_LABELS[quickFilter].toLowerCase().replace(' only', '')}.`
                    : `No ${partyNoun} has anything in ${selectedLabel ?? 'this period'}.`}
              </p>
            )}
          </Card>
        </div>

        <p className="text-caption text-text-tertiary print:hidden">
          Each period counts days past the {documentNoun}’s own due date, as of{' '}
          {report?.asOfDate ? formatReportDate(report.asOfDate) : 'today'}. Changing the periods re-divides the same
          total; it never changes it. Draft {documentNoun}s are excluded, so this
          total can be lower than the dashboard’s.
        </p>
      </div>
    </ReportShell>
  );
}

export default AgingReportView;
