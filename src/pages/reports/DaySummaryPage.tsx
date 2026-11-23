import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, FilePlus2, RefreshCw, Users } from 'lucide-react';
import { useCallback, useEffect } from 'react';
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
  PurchasingCard,
  ReorderCard,
  TeamCard,
  TopCustomersCard,
} from '@/features/daySummary/DayRail';
import { DigestSettings } from '@/features/daySummary/DigestSettings';
import { ExportMenu } from '@/features/daySummary/ExportMenu';
import { HourlyActivity } from '@/features/daySummary/HourlyActivity';
import { ItemSales, type SheetPeriodMode } from '@/features/daySummary/ItemSales';
import { readEnum, readIso, useReportParams } from '@/features/reports/useReportParams';
import { whatsappUrl } from '@/features/share/shareDocument';
import { useIsOwner } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import {
  ITEM_GROUPINGS,
  ITEM_SORTS,
  itemShareLines,
  itemSheetCsvRows,
  itemSheetPdfSection,
  sheetPeriodLabel,
  type ItemGrouping,
  type ItemSort,
} from '@/models/dayItemSheet';
import {
  COMPARE_KEYS,
  compareLabel,
  DAY_BOOK_PAGE_SIZES,
  dayCsvRows,
  dayLongLabel,
  dayPdfSections,
  dayShareText,
  filterLabel,
  sortLabel,
  zoneLabel,
  type CompareKey,
} from '@/models/daySummary';
import { addDays, isoToday } from '@/models/document';
import { csvHeaderBlock, downloadCsv, toCsv } from '@/models/reportCsv';
import { ApiError } from '@/networks/network/apiHelpers';
import { getAllDayEntries, getDayEntries, getDayItems, getDaySummary } from '@/networks/reports/daySummaryNetwork';
import {
  DAY_DOC_KINDS,
  DAY_ENTRY_FILTERS,
  DAY_ENTRY_SORTS,
  type DayEntryFilter,
  type DayEntrySort,
} from '@/serializers/daySummarySerializer';

const FILTERS: readonly DayEntryFilter[] = [...DAY_ENTRY_FILTERS, ...DAY_DOC_KINDS];
/** A PDF lists at most this many Day Book rows; the CSV carries them all. */
const PDF_ROW_CAP = 500;

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
  // The Day Book's view: search, order, page size and page, all in the URL.
  const q = (params.get('q') ?? '').trim().slice(0, 100);
  const sort = readEnum<DayEntrySort>(params.get('sort'), DAY_ENTRY_SORTS, 'newest');
  const sizeParam = Number(params.get('size'));
  const pageSize = (DAY_BOOK_PAGE_SIZES as readonly number[]).includes(sizeParam) ? sizeParam : DAY_BOOK_PAGE_SIZES[0];
  const pageNo = Math.max(1, Math.floor(Number(params.get('page')) || 1));

  const summary = useQuery({
    queryKey: ['reports', 'day-summary', date, createdBy],
    queryFn: () => getDaySummary({ date, createdBy }),
    placeholderData: keepPreviousData,
  });
  const s = summary.data;
  // The server's day, in the company's zone; the browser's only until it answers.
  const today = s?.today || isoToday();
  const day = date ?? s?.date ?? today;

  // One page of the Day Book. The previous page stays on screen, dimmed,
  // while the next one loads, so paging never flashes an empty table.
  const entries = useQuery({
    queryKey: ['reports', 'day-summary', 'entries', day, createdBy, filter, q, sort, pageNo, pageSize],
    queryFn: () => getDayEntries({ date: day, type: filter, createdBy, q, sort, page: pageNo, limit: pageSize }),
    enabled: Boolean(s),
    placeholderData: keepPreviousData,
  });
  const bookPages = entries.data?.pages ?? 0;

  // ── Item-wise sales: the chosen day, or a range of its own ──────────────
  const sheetMode: SheetPeriodMode = params.get('ip') === 'range' ? 'range' : 'day';
  const groupBy = readEnum<ItemGrouping>(params.get('ig'), ITEM_GROUPINGS, 'category');
  const itemSort = readEnum<ItemSort>(params.get('is'), ITEM_SORTS, 'code');
  const itemQ = (params.get('iq') ?? '').trim().slice(0, 100);
  const rangeFrom = readIso(params.get('ifrom')) ?? addDays(day, -6);
  const rangeTo = readIso(params.get('ito')) ?? day;
  const [sheetFrom, sheetTo] =
    sheetMode === 'range' ? (rangeFrom <= rangeTo ? [rangeFrom, rangeTo] : [rangeTo, rangeFrom]) : [day, day];
  const items = useQuery({
    queryKey: ['reports', 'day-summary', 'items', sheetFrom, sheetTo, createdBy, compare],
    queryFn: () =>
      getDayItems({ from: sheetFrom, to: sheetTo, createdBy, compare: compare === 'yesterday' ? 'previous' : 'lastWeek' }),
    enabled: Boolean(s),
    placeholderData: keepPreviousData,
    // A 404 is a server from before the item sheet: an answer, not a hiccup.
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
  });
  // That server simply has no item sheet: the card stays hidden rather than erring.
  const itemsUnavailable = items.error instanceof ApiError && items.error.status === 404;
  const sheet = items.data;
  const sheetView = { groupBy, sort: itemSort, q: itemQ };
  // The sheet joins the day's exports only when it covers that day.
  const sheetForDay = sheet && sheet.from === day && sheet.to === day ? sheet : undefined;

  // A page past the end (rows were voided, a link from yesterday): the last.
  useEffect(() => {
    if (!entries.isPlaceholderData && bookPages > 0 && pageNo > bookPages) {
      update({ page: bookPages > 1 ? String(bookPages) : null });
    }
  }, [bookPages, pageNo, entries.isPlaceholderData, update]);

  const setDate = useCallback(
    (next: string) => update({ date: next === today ? null : next, type: null, page: null, q: null }, { push: true }),
    [today, update],
  );
  const toDayBook = () =>
    // Bring the Day Book's top into view (not every environment can scroll).
    requestAnimationFrame(() => {
      const el = document.getElementById('day-book');
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  const setPage = (next: number) => {
    update({ page: next > 1 ? String(next) : null });
    toDayBook();
  };
  const setPageSize = (next: number) => update({ size: next === DAY_BOOK_PAGE_SIZES[0] ? null : String(next), page: null });
  const setSearch = useCallback((next: string) => update({ q: next || null, page: null }), [update]);
  const setItemSearch = useCallback((next: string) => update({ iq: next || null }), [update]);
  const setSort = (next: DayEntrySort) => update({ sort: next === 'newest' ? null : next, page: null });
  const setFilter = (next: DayEntryFilter) => {
    update({ type: next === 'all' ? null : next, page: null });
    if (next !== 'all') toDayBook();
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

  // What the Day Book view is, in words, for an export's header.
  const viewLabel = [
    filterLabel(filter),
    q ? `matching “${q}”` : null,
    sortLabel(sort),
  ]
    .filter(Boolean)
    .join(', ');
  const bookView = { date: day, type: filter, createdBy, q, sort };

  const exportCsv = async () => {
    if (!s) return undefined;
    // Every row of the view on screen — all its pages, not just this one.
    const all = await getAllDayEntries(bookView);
    const out = [
      ...csvHeaderBlock({
        company: company.name,
        report: who ? `Day Summary — ${who.name}` : title,
        period: dayLongLabel(day),
        basis: `Day Book: ${viewLabel}`,
      }),
      ...dayCsvRows(s, all.items, compare),
      ...(sheetForDay ? [[], ['Item-wise sales'], ...itemSheetCsvRows(sheetForDay, sheetView)] : []),
      ...(all.truncated ? [[], [`Day Book: first ${all.items.length} of ${all.total} entries.`]] : []),
    ];
    return downloadCsv(`day-summary-${day}`, toCsv(out));
  };

  const pdfSections = async () => {
    if (!s) return [];
    const all = await getAllDayEntries(bookView, PDF_ROW_CAP);
    const sections = dayPdfSections(s, all.items, compare);
    if (sheetForDay && sheetForDay.rows.length > 0) {
      // After the money, before the Day Book's long list.
      const at = sections.findIndex((x) => x.title === 'Day Book');
      sections.splice(at === -1 ? sections.length : at, 0, itemSheetPdfSection(sheetForDay, sheetView));
    }
    if (all.truncated) {
      sections.push({
        columns: [{ header: '' }],
        rows: [{ cells: [`The Day Book above lists the first ${PDF_ROW_CAP} of ${all.total} entries; the CSV has them all.`] }],
      });
    }
    return sections;
  };

  const shareOnWhatsApp = () => {
    if (!s) return;
    const extra = sheetForDay ? itemShareLines(sheetForDay, groupBy) : [];
    const text = [dayShareText(s, company.name), ...(extra.length ? ['', ...extra] : [])].join('\n');
    window.open(whatsappUrl(null, text), '_blank', 'noopener,noreferrer');
  };

  const kinds = new Set(s?.kinds ?? []);
  const refetching = summary.isFetching && !summary.isLoading;
  // A day that failed to load must not leave the previous day's figures up;
  // a failed background refresh of the same day keeps them, and says so.
  const loadFailed = Boolean(summary.error) && (!s || summary.isPlaceholderData);
  const refreshFailed = Boolean(summary.error) && Boolean(s) && !summary.isPlaceholderData;
  const reorderPeriod = sheet
    ? sheet.from === sheet.to
      ? `on ${dayLongLabel(sheet.from)}`
      : `in ${sheetPeriodLabel(sheet.from, sheet.to)}`
    : '';
  const pickPerson = (id: string | null) => update({ by: id, type: null });

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        className="print:hidden"
        title={title}
        description={subtitle}
        meta={[dayLongLabel(day), s ? zoneLabel(s.timezone) : null, scopeLabel ?? null].filter(Boolean)}
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
              sections={pdfSections}
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

      {/* On paper the page header is hidden with the controls; this says what it is. */}
      <div className="hidden print:block">
        <p className="text-h4 text-text-primary">
          {company.name ? `${company.name} — ` : ''}
          {who && !ownOnly ? `Day Summary — ${who.name}` : title}
        </p>
        <p className="text-body-sm text-text-secondary">
          {dayLongLabel(day)}
          {s ? ` · ${zoneLabel(s.timezone)}` : ''} · {compareLabel(compare)}
        </p>
      </div>

      {summary.isLoading && <DaySkeleton />}

      {!summary.isLoading && loadFailed && (
        <Card className="flex flex-col items-start gap-xs p-xl" role="alert">
          <p className="text-label-lg text-text-primary">{dayLongLabel(day)} could not be loaded</p>
          <p className="text-body-sm text-text-secondary">
            {summary.error instanceof ApiError && summary.error.status === 403
              ? 'You do not have access to this day’s figures.'
              : 'Check the connection and try again. Nothing on this page is shown until the day loads, so no figures from another day are mixed in.'}
          </p>
          <Button variant="secondary" className="mt-sm" onClick={() => void summary.refetch()}>
            <RefreshCw className="size-4" />
            Try again
          </Button>
        </Card>
      )}

      {refreshFailed && (
        <div
          role="status"
          className="flex items-center justify-between gap-sm rounded-md border border-warning-light bg-warning-lighter px-md py-xs text-body-sm text-text-primary print:hidden"
        >
          <span>Couldn’t refresh — the figures below are from {new Date(summary.dataUpdatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.</span>
          <Button variant="text" size="sm" onClick={() => void summary.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {s && !loadFailed && (
        <div
          className={cn(
            'flex flex-col gap-lg transition-opacity duration-200 motion-reduce:transition-none',
            refetching ? 'pointer-events-none opacity-60 delay-150' : 'opacity-100',
          )}
          aria-busy={refetching}
        >
          {s.isEmpty && (
            <Card className="flex flex-col items-center gap-sm border border-dashed border-border px-lg py-xl text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-text-tertiary">
                <CalendarDays className="size-6" aria-hidden="true" />
              </span>
              <div>
                <p className="text-label-lg text-text-primary">Nothing recorded on {dayLongLabel(day)}</p>
                <p className="mx-auto mt-xxs max-w-[32rem] text-body-sm text-text-secondary">
                  No invoices, orders, receipts{kinds.has('purchase_order') ? ', purchase orders' : ''} or bills are
                  dated this day{ownOnly ? ' under your name' : ''}, and nothing was entered for an earlier day.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-xs print:hidden">
                <Button variant="secondary" size="sm" onClick={() => setDate(addDays(day, -1))}>
                  <ChevronLeft className="size-4" />
                  Previous day
                </Button>
                {day !== today && (
                  <Button variant="secondary" size="sm" onClick={() => setDate(today)}>
                    Go to today
                  </Button>
                )}
                {day === today && (
                  <Button asChild size="sm">
                    <Link to="/invoices/new">
                      <FilePlus2 className="size-4" />
                      New invoice
                    </Link>
                  </Button>
                )}
              </div>
            </Card>
          )}

          <DayKpis summary={s} compare={compare} />

          {/* An empty day is one message, not a wall of empty cards — the item
              sheet stays only when it is looking at a range of its own. */}
          {(!s.isEmpty || sheetMode === 'range') && (
          <div className="grid items-start gap-lg xl:grid-cols-3">
            {/* The side column first on a narrow screen: what needs attention
                comes before a long list. Between 1024 and 1279px its cards
                flow in two columns rather than one long stack. */}
            {!s.isEmpty && (
            <aside
              className={cn(
                'order-first flex min-w-0 flex-col gap-lg xl:order-none xl:col-start-3 xl:row-start-1',
                'lg:block lg:columns-2 lg:gap-lg lg:[&>*]:mb-lg lg:[&>*]:break-inside-avoid',
                'xl:flex xl:columns-auto xl:[&>*]:mb-0',
                'print:block print:columns-2 print:gap-lg print:[&>*]:mb-lg print:[&>*]:break-inside-avoid',
              )}
            >
              <AttentionCard summary={s} active={filter} onSelect={setFilter} />
              {sheet?.reorder && <ReorderCard reorder={sheet.reorder} period={reorderPeriod} />}
              <ProfitCard summary={s} />
              <DocumentsCard summary={s} active={filter} onSelect={setFilter} />
              <MoneyCard summary={s} />
              <PurchasingCard summary={s} />
              <TopCustomersCard summary={s} />
              <BestSellersCard summary={s} />
              {s.team && <TeamCard team={s.team} onSelect={(id: string) => pickPerson(id)} />}
            </aside>
            )}

            <div className="flex min-w-0 flex-col gap-lg xl:col-span-2 xl:col-start-1 xl:row-start-1">
              {!s.isEmpty && <HourlyActivity hourly={s.hourly} />}
              {!itemsUnavailable && (
              <ItemSales
                sheet={sheet}
                loading={items.isLoading}
                fetching={items.isFetching && items.isPlaceholderData}
                error={items.error && !items.data ? (items.error as Error) : null}
                onRetry={() => void items.refetch()}
                mode={sheetMode}
                onMode={(m) => update({ ip: m === 'range' ? 'range' : null })}
                range={{ startDate: sheetFrom, endDate: sheetTo }}
                onRange={(r) => update({ ip: 'range', ifrom: r.startDate || null, ito: r.endDate || null })}
                groupBy={groupBy}
                onGroupBy={(g) => update({ ig: g === 'category' ? null : g })}
                sort={itemSort}
                onSort={(x) => update({ is: x === 'code' ? null : x })}
                q={itemQ}
                onSearch={setItemSearch}
                company={company}
                scopeLabel={scopeLabel}
                canDrill={!ownOnly && !createdBy}
                compareLabel={
                  sheetMode === 'range'
                    ? compare === 'yesterday'
                      ? 'vs the period before'
                      : 'vs a week earlier'
                    : compareLabel(compare)
                }
              />
              )}
              {!s.isEmpty && (
              <DayBook
                summary={s}
                filter={filter}
                onFilter={setFilter}
                data={entries.data}
                loading={entries.isLoading}
                fetching={entries.isFetching && entries.isPlaceholderData}
                failed={entries.isError && !entries.data}
                onRetry={() => void entries.refetch()}
                page={pageNo}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={setPageSize}
                q={q}
                onSearch={setSearch}
                sort={sort}
                onSort={setSort}
                showBy={!ownOnly}
              />
              )}
            </div>
          </div>
          )}

          <p className="text-caption text-text-tertiary">
            Documents count on the day they are dated, so these figures agree with the P&amp;L and the other
            reports. Drafts, voids, cancelled sales orders and withdrawn purchase orders are listed but not counted.
            Back-dated entries were made on this day for an earlier one.
            <span className="hidden [@media(hover:hover)_and_(pointer:fine)]:inline print:hidden">
              {' '}
              Use ← and → to step through days.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
