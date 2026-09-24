import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

import {
  saveAgingPreference,
  type AgingDetailParams,
  type AgingParams,
} from '@/networks/reports/agingNetwork';

import { Button } from '@/components/ui/Button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { AgingChart } from '@/features/reports/AgingChart';
import { AgingPartyDocuments } from '@/features/reports/AgingPartyDocuments';
import { AgingSummary } from '@/features/reports/AgingSummary';
import { AgingTable } from '@/features/reports/AgingTable';
import { AgingTopParties } from '@/features/reports/AgingTopParties';
import { BucketPresetPicker } from '@/features/reports/BucketPresetPicker';
import { ReportShell } from '@/features/reports/ReportShell';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import {
  AGING_SORT_OPTIONS,
  defaultAgingSort,
  resolveSelectedBucket,
  visibleAgingRows,
  type AgingSort,
  type TopAgingParty,
} from '@/models/reportAging';
import { csvAmount, csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import { asOfLabel, formatReportDate } from '@/models/reportPeriod';
import {
  LEGACY_AGING_BUCKETS,
  notYetDueTotal,
  overdueTotal,
  type AgingPresetKey,
  type AgingReport,
  type AgingTotals,
} from '@/serializers/reportSerializers';

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
}

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
}: AgingReportViewProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const report = query.data;
  const totals = report?.totals;
  // Columns come from the payload; the classic five stand in only while the
  // first response is still in flight.
  const buckets = report?.buckets ?? LEGACY_AGING_BUCKETS;
  const overdue = report ? overdueTotal(report) : 0;
  const notDue = report ? notYetDueTotal(report) : 0;

  const allRows = report?.rows ?? [];
  const visibleRows = useMemo(
    () => visibleAgingRows({ rows: allRows, buckets, selectedBucket, sort, search }),
    [allRows, buckets, selectedBucket, sort, search],
  );
  const selectedLabel = buckets.find((b) => b.key === selectedBucket)?.label;
  const partyNoun = counterpartyHeader.toLowerCase();
  const narrowed = Boolean(selectedBucket) || search.trim().length > 0;
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

  const exportCsv = () => {
    if (!report) return;
    const out: CsvRow[] = [
      [title],
      [asOfLabel(report.asOfDate)],
      [],
      [counterpartyHeader, ...buckets.map((b) => b.label), 'Total'],
    ];
    for (const row of report.rows) {
      out.push([
        row.customerName,
        ...buckets.map((b) => csvAmount(row.amounts[b.key] ?? 0)),
        csvAmount(row.total),
      ]);
    }
    out.push([
      'Total',
      ...buckets.map((b) => csvAmount(report.totals.amounts[b.key] ?? 0)),
      csvAmount(report.totals.total),
    ]);
    downloadCsv(
      csvFilename(csvName, { asOfDate: report.asOfDate }),
      toCsv(out),
    );
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
        cacheKey: String(query.dataUpdatedAt),
        build: () => [
          {
            columns: [
              { header: counterpartyHeader, flex: 3 },
              ...buckets.map((b) => ({ header: b.label, align: 'right' as const, flex: 1.5 })),
              { header: 'Total', align: 'right', flex: 1.7 },
            ],
            rows: [
              ...(report?.rows ?? []).map((r) => ({
                cells: [r.customerName, ...buckets.map((b) => r.amounts[b.key] ?? 0), r.total],
              })),
              {
                cells: ['Total', ...buckets.map((b) => report?.totals.amounts[b.key] ?? 0), report?.totals.total ?? 0],
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
          <AgingSummary
            buckets={buckets}
            totals={totals ?? ZERO_TOTALS}
            rows={allRows}
            notDue={notDue}
            overdue={overdue}
            partyNoun={partyNoun}
          />
        </div>

        {/* The two pictures. Screen-only, like the summary: the printed report
            is the table, and a chart resized for paper by a script mid-print
            is not something to hand an auditor. */}
        <div className="grid gap-lg xl:grid-cols-5 print:hidden">
          <Card className="flex flex-col xl:col-span-3">
            <CardHeader className="items-center">
              <div className="min-w-0">
                <CardTitle className="text-h5">
                  Outstanding by period
                  {selectedLabel && <span className="text-text-tertiary"> · {selectedLabel}</span>}
                </CardTitle>
                <CardDescription className="mt-[2px] text-caption text-text-tertiary">
                  {selectedLabel
                    ? 'The table shows this period only'
                    : 'Select a bar to filter the table'}
                </CardDescription>
              </div>
              {selectedBucket && (
                <Button variant="text" size="sm" onClick={() => onSelectBucket(null)}>
                  Show all periods
                </Button>
              )}
            </CardHeader>
            <div className="min-h-[18rem] flex-1 px-md pb-sm pt-md">
              <AgingChart
                labelled
                className="h-full min-h-[16rem]"
                buckets={buckets}
                totals={totals ?? ZERO_TOTALS}
                rows={allRows}
                selectedBucket={selectedBucket}
                onSelectBucket={onSelectBucket}
              />
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
                <span className="text-caption text-text-tertiary">
                  {narrowed
                    ? `${visibleRows.length} of ${plural(allRows.length)}`
                    : plural(allRows.length)}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-sm">
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
              className="rounded-b-lg"
              buckets={buckets}
              rows={visibleRows}
              totals={totals ?? ZERO_TOTALS}
              counterpartyHeader={counterpartyHeader}
              selectedBucket={selectedBucket}
              onSelectBucket={onSelectBucket}
              filtered={narrowed}
              expanded={expanded}
              onToggleParty={onToggleParty}
              renderDetail={(row) => (
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
              )}
            />

            {visibleRows.length === 0 && (
              <p className="border-t border-border-light px-lg py-lg text-center text-body-sm text-text-tertiary print:hidden">
                {search.trim()
                  ? `No ${partyNoun} matches “${search.trim()}”${selectedLabel ? ` in ${selectedLabel}` : ''}.`
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

/**
 * Everything both aging pages need: the query, the bucket choice, and
 * remembering it.
 *
 * The preset starts as `null`, meaning "whatever this company's default is".
 * The server resolves the saved preference when the request names no preset and
 * echoes back the one it used, so the page opens on the company default without
 * a separate settings round trip — and the chips can show it without a
 * setState-in-effect, by falling through to what the response reported.
 */
export const useAgingReport = (
  key: string,
  fetcher: (params: AgingParams) => Promise<AgingReport>,
) => {
  const [preset, setPreset] = useState<AgingPresetKey | null>(null);
  const [customBuckets, setCustomBuckets] = useState('3,6,9,12');
  const [selectedBucketRaw, setSelectedBucket] = useState<string | null>(null);
  // `null` means "follow whatever the default is for the current selection",
  // which is what lets the order switch to oldest-first when a bucket is picked
  // without a setState inside an effect.
  const [sortRaw, setSort] = useState<AgingSort | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');

  // A custom preset with no boundaries is not sent: the server rejects it, and
  // the user is mid-edit rather than mistaken.
  const params: AgingParams =
    preset === 'custom'
      ? customBuckets.trim()
        ? { preset: 'custom', buckets: customBuckets.trim() }
        : {}
      : preset
        ? { preset }
        : {};

  const query = useQuery({
    queryKey: ['reports', key, params],
    queryFn: () => fetcher(params),
    // Picking another bucket set keeps the current report on screen, dimmed,
    // until the new one lands. Without this the new key starts with no data
    // and the whole page drops to "Loading…" for the length of the request.
    placeholderData: keepPreviousData,
  });

  // A bucket key only means something within the bucket set that produced it:
  // `d31to60` exists under `monthly` and does not exist under `days3`. Validating
  // against the live payload is what stops a stale selection from filtering the
  // table to nothing beneath a chip naming a column that is not on screen.
  const selectedBucket = resolveSelectedBucket(
    selectedBucketRaw,
    query.data?.buckets ?? LEGACY_AGING_BUCKETS,
  );

  // Changing the bucket set invalidates any selection made under the old one,
  // and the order that selection implied.
  const resetInvestigation = () => {
    setSelectedBucket(null);
    setSort(null);
    // Open panels go too. Their documents were bucketed by the spec that is
    // being replaced, so leaving them open would show rows labelled with
    // columns that are no longer on screen — right figures, wrong headings.
    setExpanded({});
  };

  return {
    query,
    // Falls through to the server's answer on the first load, when we asked for
    // nothing and it applied the company default.
    preset: preset ?? query.data?.preset ?? null,
    customBuckets,
    onPickPreset: (next: AgingPresetKey) => {
      setPreset(next);
      resetInvestigation();
      void saveAgingPreference({ preset: next, buckets: customBuckets });
    },
    onApplyCustom: (buckets: string) => {
      setCustomBuckets(buckets);
      setPreset('custom');
      resetInvestigation();
      void saveAgingPreference({ preset: 'custom', buckets });
    },
    selectedBucket,
    onSelectBucket: (next: string | null) => {
      setSelectedBucket(next);
      // The open panels were fetched for a different bucket filter, so their
      // contents no longer match the row they sit under.
      setExpanded({});
    },
    sort: sortRaw ?? defaultAgingSort(selectedBucket),
    onChangeSort: setSort,
    search,
    onChangeSearch: setSearch,
    expanded,
    onToggleParty: (partyId: string) =>
      setExpanded((prev) => ({ ...prev, [partyId]: !prev[partyId] })),
    onOpenParty: (partyId: string) => setExpanded({ [partyId]: true }),
    // What the drill-down must be told, so its buckets are the report's
    // buckets. `selectedBucket` is validated against the live payload above.
    detailParams: { ...params, ...(selectedBucket ? { bucket: selectedBucket } : {}) },
  };
};

export default AgingReportView;
