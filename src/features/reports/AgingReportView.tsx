import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Info } from 'lucide-react';

import { Card, SectionHeader } from '@/components/ui/Card';
import { AgingChart } from '@/features/reports/AgingChart';
import { AGING_BUCKETS, AgingTable } from '@/features/reports/AgingTable';
import { KpiTile } from '@/features/reports/KpiTile';
import { ReportShell } from '@/features/reports/ReportShell';
import { ReportTitleBlock } from '@/features/reports/ReportTitleBlock';
import { csvAmount, csvFilename, downloadCsv, toCsv, type CsvRow } from '@/models/reportCsv';
import { asOfLabel } from '@/models/reportPeriod';
import {
  overdueTotal,
  type AgingBuckets,
  type AgingReport,
} from '@/serializers/reportSerializers';
import { colors } from '@/theme/tokens';

/** Placeholder buckets, so the table and chart render their frame while loading. */
const ZERO_BUCKETS: AgingBuckets = {
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
 * **No date control.** Neither endpoint accepts one: the service ages against
 * `new Date()`, and the unified `/reports/aging` route takes an `asOfDate` and
 * then discards it. A picker here would be a control that changes nothing, so the
 * page states the as-of date instead.
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
}: AgingReportViewProps) {
  const report = query.data;
  const totals = report?.totals;
  const overdue = totals ? overdueTotal(totals) : 0;

  const exportCsv = () => {
    if (!report) return;
    const out: CsvRow[] = [
      [title],
      [asOfLabel(report.asOfDate)],
      [],
      [counterpartyHeader, ...AGING_BUCKETS.map((b) => b.label), 'Total'],
    ];
    for (const row of report.rows) {
      out.push([
        row.customerName,
        ...AGING_BUCKETS.map((b) => csvAmount(row[b.key])),
        csvAmount(row.total),
      ]);
    }
    out.push([
      'Total',
      ...AGING_BUCKETS.map((b) => csvAmount(report.totals[b.key])),
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
              ...AGING_BUCKETS.map((b) => ({ header: b.label, align: 'right' as const, flex: 1.5 })),
              { header: 'Total', align: 'right', flex: 1.7 },
            ],
            rows: [
              ...(report?.rows ?? []).map((r) => ({
                cells: [r.customerName, ...AGING_BUCKETS.map((b) => r[b.key]), r.total],
              })),
              {
                cells: ['Total', ...AGING_BUCKETS.map((b) => report?.totals[b.key] ?? 0), report?.totals.total ?? 0],
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
            value={totals?.current ?? 0}
            accent={colors.success}
          />
          <KpiTile
            label="Overdue"
            value={overdue}
            accent={overdue > 0 ? colors.danger : colors.success}
            hint="31 days and over"
          />
        </div>

        <Card className="p-lg print:hidden">
          <SectionHeader title="How much, by how late" />
          <AgingChart totals={totals ?? ZERO_BUCKETS} />
        </Card>

        <Card className="p-lg">
          <ReportTitleBlock
            report={`${title} Summary`}
            periodLabel={asOfLabel(report?.asOfDate ?? '')}
          />
          <AgingTable
            className="mt-md"
            rows={report?.rows ?? []}
            totals={totals ?? ZERO_BUCKETS}
            counterpartyHeader={counterpartyHeader}
          />
        </Card>

        <p className="text-caption text-text-tertiary">
          “Overdue” counts 31 days and over. Anything inside a month of its due date
          is still being chased rather than written off, so it is reported
          separately.
        </p>
      </div>
    </ReportShell>
  );
}

/** Shared between both aging pages — a query's placeholder before data arrives. */
export const useAgingQuery = (
  key: string,
  fetcher: () => Promise<AgingReport>,
): UseQueryResult<AgingReport, Error> =>
  useQuery({ queryKey: ['reports', key], queryFn: fetcher });

export default AgingReportView;
