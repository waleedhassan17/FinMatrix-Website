import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { FilePlus2, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDocumentCompany } from '@/features/documents/useDocumentContext';
import { DayBook } from '@/features/daySummary/DayBook';
import { DayKpis } from '@/features/daySummary/DayKpis';
import { DayNavigator } from '@/features/daySummary/DayNavigator';
import {
  AttentionCard,
  BestSellersCard,
  DocumentsCard,
  MoneyCard,
  ProfitCard,
  TeamCard,
  TopCustomersCard,
} from '@/features/daySummary/DayRail';
import { DigestSettings } from '@/features/daySummary/DigestSettings';
import { ExportMenu } from '@/features/daySummary/ExportMenu';
import { HourlyActivity } from '@/features/daySummary/HourlyActivity';
import { readEnum, readIso, useReportParams } from '@/features/reports/useReportParams';
import { whatsappUrl } from '@/features/share/shareDocument';
import { useIsOwner } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import {
  COMPARE_KEYS,
  dayCsvRows,
  dayLongLabel,
  dayPdfSections,
  dayShareText,
  type CompareKey,
} from '@/models/daySummary';
import { addDays, isoToday } from '@/models/document';
import { csvHeaderBlock, downloadCsv, toCsv } from '@/models/reportCsv';
import { getDayEntries, getDaySummary } from '@/networks/reports/daySummaryNetwork';
import {
  DAY_DOC_KINDS,
  DAY_ENTRY_FILTERS,
  type DayEntryFilter,
} from '@/serializers/daySummarySerializer';

const FILTERS: readonly DayEntryFilter[] = [...DAY_ENTRY_FILTERS, ...DAY_DOC_KINDS];
// A normal day fits one page; a busy one loads more on request.
const PAGE = 200;

/** The shape of the page while the first figures load, so nothing jumps. */
function DaySkeleton() {
  return (
    <div role="status" aria-label="Loading the day" className="flex flex-col gap-lg">
      <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="flex flex-col gap-sm p-lg">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-12 w-full" />
          </Card>
        ))}
      </div>
      <div className="grid gap-lg xl:grid-cols-3">
        <Card className="flex flex-col gap-sm p-lg xl:col-span-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-40 w-full" />
        </Card>
        <Card className="flex flex-col gap-sm p-lg">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </Card>
      </div>
    </div>
  );
}

/**
 * Day Summary — what the business did on one day, at a glance.
 *
 * Headline figures with their week; when the day happened, hour by hour; the
 * Day Book of every document, filtered by type; and down the side what needs
 * attention, the day's profit, the documents created, money in and out, who
 * bought, what sold and who entered it. Staff get the same page limited to
 * what they prepared themselves ("My day").
 *
 * The view lives in the URL — `?date=&by=&type=&compare=` — so a notification
 * or an email can open a particular day, and Back steps through the days seen.
 */
export default function DaySummaryPage() {
  const company = useDocumentCompany();
  const isOwner = useIsOwner();
  const { params, update } = useReportParams();

  const date = readIso(params.get('date'));
  const createdBy = isOwner ? params.get('by') : null;
  const filter = readEnum<DayEntryFilter>(params.get('type'), FILTERS, 'all');
  const compare = readEnum<CompareKey>(params.get('compare'), COMPARE_KEYS, 'yesterday');

  const summary = useQuery({
    queryKey: ['reports', 'day-summary', date, createdBy],
    queryFn: () => getDaySummary({ date, createdBy }),
    placeholderData: keepPreviousData,
  });
  const s = summary.data;
  // The server's day, in the company's zone; the browser's only until it answers.
  const today = s?.today || isoToday();
  const day = date ?? s?.date ?? today;

  const entries = useInfiniteQuery({
    queryKey: ['reports', 'day-summary', 'entries', day, createdBy, filter],
    queryFn: ({ pageParam }) => getDayEntries({ date: day, type: filter, createdBy, page: pageParam, limit: PAGE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    enabled: Boolean(s),
  });
  const rows = useMemo(() => entries.data?.pages.flatMap((p) => p.items) ?? [], [entries.data]);
  const total = entries.data?.pages[0]?.total ?? 0;

  const setDate = useCallback(
    (next: string) => update({ date: next === today ? null : next, type: null }, { push: true }),
    [today, update],
  );
  const setFilter = (next: DayEntryFilter) => {
    update({ type: next === 'all' ? null : next });
    if (next !== 'all') {
      // Bring the narrowed Day Book into view (not every environment can scroll).
      requestAnimationFrame(() => {
        const el = document.getElementById('day-book');
        if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  // ← / → step a day, outside form fields, menus and the calendar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t?.closest(
          'input, textarea, select, [contenteditable="true"], [role="listbox"], [role="menu"], [role="dialog"], [role="grid"], [role="tablist"]',
        ) ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      if (e.key === 'ArrowLeft') setDate(addDays(day, -1));
      else if (e.key === 'ArrowRight' && day < today) setDate(addDays(day, 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [day, today, setDate]);

  const ownOnly = s?.scope.ownOnly ?? !isOwner;
  const who = s?.scope.createdBy;
  const title = ownOnly ? 'My day' : 'Day Summary';
  const subtitle = ownOnly
    ? 'What you entered on the day.'
    : who
      ? `What ${who.name} entered on the day.`
      : 'What the business did on the day, at a glance.';
  const scopeLabel = who && !ownOnly ? `Entered by ${who.name}` : ownOnly ? 'My entries' : undefined;

  const exportCsv = () => {
    if (!s) return undefined;
    // The Day Book rows on screen, under the filter on screen; when more are
    // still to load, the file says so rather than passing as complete.
    const out = [
      ...csvHeaderBlock({
        company: company.name,
        report: who ? `Day Summary — ${who.name}` : title,
        period: dayLongLabel(day),
        basis: filter === 'all' ? undefined : `Day Book: ${filter}`,
      }),
      ...dayCsvRows(s, rows),
      ...(entries.hasNextPage
        ? [[], [`Day Book: first ${rows.length} of ${total} entries — load the rest on screen to export them all.`]]
        : []),
    ];
    return downloadCsv(`day-summary-${day}`, toCsv(out));
  };

  const shareOnWhatsApp = () => {
    if (!s) return;
    window.open(whatsappUrl(null, dayShareText(s, company.name)), '_blank', 'noopener,noreferrer');
  };

  const kinds = new Set(s?.kinds ?? []);
  const refetching = summary.isFetching && !summary.isLoading;
  const pickPerson = (id: string | null) => update({ by: id, type: null });

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        className="print:hidden"
        title={title}
        description={subtitle}
        meta={[dayLongLabel(day), s ? `${s.timezone} time` : null, scopeLabel ?? null].filter(Boolean)}
        actions={
          <>
            {isOwner && <DigestSettings />}
            <ExportMenu
              title={title}
              periodLabel={dayLongLabel(day)}
              basis={scopeLabel}
              company={company}
              disabled={!s || refetching}
              onCsv={exportCsv}
              sections={() => (s ? dayPdfSections(s, rows) : [])}
              filename={`day-summary-${day}`}
              onWhatsApp={shareOnWhatsApp}
            />
          </>
        }
      />

      {/* ── The day, and how it is read ───────────────────────────── */}
      <Card className="flex flex-col gap-sm p-sm print:hidden lg:flex-row lg:items-center lg:justify-between">
        <DayNavigator date={day} today={today} onDate={setDate} />
        <div className="flex flex-wrap items-center gap-sm">
          <SegmentedControl<CompareKey>
            label="Compare with"
            size="sm"
            value={compare}
            onChange={(key) => update({ compare: key === 'yesterday' ? null : key })}
            options={[
              { value: 'yesterday', label: 'vs day before' },
              { value: 'lastWeek', label: 'vs last week', ariaLabel: 'Compared with the same day last week' },
            ]}
          />
          {isOwner && s?.members && s.members.length > 1 && (
            <div className="flex items-center gap-xs">
              <Users className="size-4 text-text-tertiary" aria-hidden="true" />
              <Select
                compact
                containerClassName="min-w-[12rem]"
                value={createdBy ?? 'all'}
                onChange={(v: string) => pickPerson(v === 'all' ? null : v)}
                options={[
                  { value: 'all', label: 'Everyone' },
                  ...s.members.map((m) => ({
                    value: m.id,
                    label: m.role === 'admin' ? `${m.name} (owner)` : m.name,
                  })),
                ]}
              />
            </div>
          )}
        </div>
      </Card>

      {summary.isLoading && <DaySkeleton />}

      {!summary.isLoading && summary.error && (
        <Card className="p-xl">
          <p className="text-label-lg text-text-primary">The day could not be loaded</p>
          <p className="mt-xxs text-body-sm text-text-secondary">{(summary.error as Error).message}</p>
          <Button variant="secondary" className="mt-lg" onClick={() => void summary.refetch()}>
            Try again
          </Button>
        </Card>
      )}

      {s && !summary.error && (
        <div
          className={cn(
            'flex flex-col gap-lg transition-opacity duration-200 motion-reduce:transition-none',
            refetching ? 'pointer-events-none opacity-60 delay-150' : 'opacity-100',
          )}
          aria-busy={refetching}
        >
          {s.isEmpty && (
            <Card className="flex flex-col items-start gap-sm border border-dashed border-border p-lg sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-label-lg text-text-primary">Nothing recorded on {dayLongLabel(day)}</p>
                <p className="text-body-sm text-text-secondary">
                  No invoices, orders, receipts or bills are dated this day{ownOnly ? ' under your name' : ''}.
                </p>
              </div>
              {day === today && (
                <div className="flex gap-xs">
                  <Button asChild size="sm">
                    <Link to="/invoices/new">
                      <FilePlus2 className="size-4" />
                      New invoice
                    </Link>
                  </Button>
                  {kinds.has('sales_order') && (
                    <Button asChild variant="secondary" size="sm">
                      <Link to="/sales-orders/new">New sales order</Link>
                    </Button>
                  )}
                </div>
              )}
            </Card>
          )}

          <DayKpis summary={s} compare={compare} />

          <div className="grid items-start gap-lg xl:grid-cols-3">
            {/* The side column first on a narrow screen: what needs attention
                comes before a long list. */}
            <aside className="order-first flex min-w-0 flex-col gap-lg xl:order-none xl:col-start-3 xl:row-start-1">
              <AttentionCard summary={s} active={filter} onSelect={setFilter} />
              <ProfitCard summary={s} />
              <DocumentsCard summary={s} active={filter} onSelect={setFilter} />
              <MoneyCard summary={s} />
              <TopCustomersCard summary={s} />
              <BestSellersCard summary={s} />
              {s.team && <TeamCard team={s.team} onSelect={(id: string) => pickPerson(id)} />}
            </aside>

            <div className="flex min-w-0 flex-col gap-lg xl:col-span-2 xl:col-start-1 xl:row-start-1">
              <HourlyActivity hourly={s.hourly} />
              <DayBook
                summary={s}
                filter={filter}
                onFilter={setFilter}
                rows={rows}
                total={total}
                loading={entries.isLoading}
                failed={entries.isError}
                onRetry={() => void entries.refetch()}
                hasMore={Boolean(entries.hasNextPage)}
                loadingMore={entries.isFetchingNextPage}
                onMore={() => void entries.fetchNextPage()}
                showBy={!ownOnly}
              />
            </div>
          </div>

          <p className="text-caption text-text-tertiary">
            Documents count on the day they are dated, so these figures agree with the P&amp;L and the other
            reports. Drafts, voids and cancelled orders are listed but not counted. Back-dated entries were made on
            this day for an earlier one. Use ← and → to step through days.
          </p>
        </div>
      )}
    </div>
  );
}
