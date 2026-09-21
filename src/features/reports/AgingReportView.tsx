import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { Info } from 'lucide-react';

import {
  saveAgingPreference,
  type AgingParams,
} from '@/networks/reports/agingNetwork';

import { Card, SectionHeader } from '@/components/ui/Card';
import { AgingChart } from '@/features/reports/AgingChart';
import { AgingTable } from '@/features/reports/AgingTable';
import { BucketPresetPicker } from '@/features/reports/BucketPresetPicker';
import { KpiTile } from '@/features/reports/KpiTile';
import { ReportShell } from '@/features/reports/ReportShell';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { csvAmount, csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import { asOfLabel } from '@/models/reportPeriod';
import {
  LEGACY_AGING_BUCKETS,
  notYetDueTotal,
  overdueTotal,
  type AgingPresetKey,
  type AgingReport,
  type AgingTotals,
} from '@/serializers/reportSerializers';
import { colors } from '@/theme/tokens';

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
}: AgingReportViewProps) {
  const report = query.data;
  const totals = report?.totals;
  // Columns come from the payload; the classic five stand in only while the
  // first response is still in flight.
  const buckets = report?.buckets ?? LEGACY_AGING_BUCKETS;
  const overdue = report ? overdueTotal(report) : 0;
  const notDue = report ? notYetDueTotal(report) : 0;

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
      onExportCsv={exportCsv}
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
        <div className="flex items-start gap-sm rounded-md bg-surface-2 p-md print:hidden">
          <Info className="mt-[2px] size-4 shrink-0 text-text-secondary" />
          <p className="text-body-sm text-text-secondary">
            Aged as of today, with buckets measured against each document’s own due
            date — which is why there is no date to choose. Draft {documentNoun}s
            are excluded, so this total can be lower than the dashboard’s figure:
            nothing is owed until a {documentNoun} is issued.
          </p>
        </div>

        <div className="grid gap-md sm:grid-cols-3 print:hidden">
          <KpiTile
            label="Total outstanding"
            value={totals?.total ?? 0}
            accent={colors.primary}
          />
          <KpiTile
            label="Not yet due"
            value={notDue}
            accent={colors.success}
          />
          <KpiTile
            label="Overdue"
            value={overdue}
            accent={overdue > 0 ? colors.danger : colors.success}
            hint="Past the due date"
          />
        </div>

        <Card className="p-lg print:hidden">
          <SectionHeader
            title="How much, by how late"
            right={
              <BucketPresetPicker
                preset={preset}
                customBuckets={customBuckets}
                onPickPreset={onPickPreset}
                onApplyCustom={onApplyCustom}
              />
            }
          />
          <AgingChart buckets={buckets} totals={totals ?? ZERO_TOTALS} />
        </Card>

        <Card className="p-lg">
          <ReportTitleBlock
            report={`${title} Summary`}
            periodLabel={asOfLabel(report?.asOfDate ?? '')}
          />
          <AgingTable
            className="mt-md"
            buckets={buckets}
            rows={report?.rows ?? []}
            totals={totals ?? ZERO_TOTALS}
            counterpartyHeader={counterpartyHeader}
          />
        </Card>

        <p className="text-caption text-text-tertiary">
          “Overdue” counts everything past its due date, split into the columns
          above. Change how it is split with the control beside the chart — the
          total never moves, only how it is divided.
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
  });

  return {
    query,
    // Falls through to the server's answer on the first load, when we asked for
    // nothing and it applied the company default.
    preset: preset ?? query.data?.preset ?? null,
    customBuckets,
    onPickPreset: (next: AgingPresetKey) => {
      setPreset(next);
      void saveAgingPreference({ preset: next, buckets: customBuckets });
    },
    onApplyCustom: (buckets: string) => {
      setCustomBuckets(buckets);
      setPreset('custom');
      void saveAgingPreference({ preset: 'custom', buckets });
    },
  };
};

export default AgingReportView;
