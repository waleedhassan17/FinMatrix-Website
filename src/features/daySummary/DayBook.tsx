import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import { KIND_META, dayMoney, entryHref, entryTime, filterLabel, sortLabel } from '@/models/daySummary';
import { formatShortDate } from '@/models/reportPeriod';
import type {
  DayEntriesPage,
  DayEntry,
  DayEntryFilter,
  DayEntrySort,
  DaySummary,
} from '@/serializers/daySummarySerializer';

/** How long typing pauses before the search runs. */
const SEARCH_DELAY_MS = 300;

interface Tab {
  filter: DayEntryFilter;
  label: string;
  count: number | null;
  warn?: boolean;
}

/**
 * The Day Book's filters: every document type that has something in it, then
 * the groups that need a look. A type with nothing in it is left out — a row
 * of zeros is noise — unless it is the one chosen.
 */
const tabsFor = (s: DaySummary, active: DayEntryFilter): Tab[] => {
  const a = s.attention;
  return [
    { filter: 'all', label: 'All', count: null },
    ...s.documents
      .filter((d) => d.count > 0 || d.kind === active)
      .map((d) => ({ filter: d.kind as DayEntryFilter, label: KIND_META[d.kind].label, count: d.count })),
    ...(a.backdated || active === 'backdated' ? [{ filter: 'backdated' as const, label: 'Back-dated', count: a.backdated, warn: true }] : []),
    ...(a.drafts || active === 'drafts' ? [{ filter: 'drafts' as const, label: 'Drafts', count: a.drafts, warn: true }] : []),
    ...(a.voided && (a.voided.count || active === 'voided')
      ? [{ filter: 'voided' as const, label: 'Voided / deleted', count: a.voided.count, warn: true }]
      : []),
    ...(a.cancelledOrders || active === 'cancelled'
      ? [{ filter: 'cancelled' as const, label: 'Cancelled', count: a.cancelledOrders, warn: true }]
      : []),
  ];
};

/**
 * A column heading that sorts: the first click takes the column's natural
 * order (newest first, largest first), the next reverses it. `aria-sort`
 * tells a screen reader which way the list now runs.
 */
function SortHeader({
  label,
  asc,
  desc,
  sort,
  onSort,
  align = 'left',
  className,
}: {
  label: string;
  asc: DayEntrySort;
  desc: DayEntrySort;
  sort: DayEntrySort;
  onSort: (s: DayEntrySort) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = sort === asc || sort === desc;
  const Icon = !active ? ArrowUpDown : sort === desc ? ArrowDown : ArrowUp;
  return (
    <th
      aria-sort={!active ? 'none' : sort === desc ? 'descending' : 'ascending'}
      className={cn('py-xs font-normal', align === 'right' ? 'text-right' : 'text-left', className)}
    >
      <button
        type="button"
        onClick={() => onSort(sort === desc ? asc : desc)}
        className={cn(
          'inline-flex items-center gap-[3px] uppercase transition-colors hover:text-text-primary',
          active ? 'text-text-primary' : 'text-text-tertiary',
        )}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        <Icon className="size-3" aria-hidden="true" />
      </button>
    </th>
  );
}

/**
 * Every document of the day — the Day Book — a page at a time.
 *
 * A busy day can bring a hundred invoices, so the list is paged by the
 * server (25, 50 or 100 a page), searched by number or party, and sorted by
 * time or amount; the footer says where the reader is ("26–50 of 143") and
 * what the whole view — not just this page — comes to. A row the totals
 * leave out (a draft, a void, a cancelled order) is listed with its status
 * and its amount struck through, rather than quietly missing.
 */
export function DayBook({
  summary,
  filter,
  onFilter,
  data,
  loading,
  fetching,
  failed,
  onRetry,
  page,
  pageSize,
  onPage,
  onPageSize,
  q,
  onSearch,
  sort,
  onSort,
  showBy,
}: {
  summary: DaySummary;
  filter: DayEntryFilter;
  onFilter: (f: DayEntryFilter) => void;
  /** The page on screen (the previous one while the next loads). */
  data: DayEntriesPage | undefined;
  /** First load, nothing to show yet. */
  loading: boolean;
  /** A new page, search or sort is on its way. */
  fetching: boolean;
  failed: boolean;
  onRetry: () => void;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  /** The search in force. */
  q: string;
  onSearch: (q: string) => void;
  sort: DayEntrySort;
  onSort: (sort: DayEntrySort) => void;
  /** The "Entered by" column — off for staff, where every row is theirs. */
  showBy: boolean;
}) {
  // Typing is local; the search runs once the typing pauses.
  const [draft, setDraft] = useState(q);
  // A search changed elsewhere (Back, a new day) replaces what is typed.
  // Adjusted while rendering rather than in an effect, so the field never
  // shows a stale search for a frame.
  const [seenQ, setSeenQ] = useState(q);
  if (q !== seenQ) {
    setSeenQ(q);
    if (q !== draft.trim()) setDraft(q);
  }
  useEffect(() => {
    const next = draft.trim();
    if (next === q) return undefined;
    const t = setTimeout(() => onSearch(next), SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [draft, q, onSearch]);

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const voids = filter === 'voided';
  const summaryLine =
    data && total > 0 ? (
      <span className="tabular">
        {voids ? (
          <>{dayMoney(data.excludedTotal)} voided or deleted</>
        ) : (
          <>
            <span className="text-text-primary">{dayMoney(data.countedTotal)}</span> counted
            {data.excludedTotal > 0 && <> · {dayMoney(data.excludedTotal)} not counted</>}
          </>
        )}
      </span>
    ) : null;

  return (
    <Card className="overflow-hidden" id="day-book">
      <div className="border-b border-border-light px-lg pt-sm">
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <div className="min-w-0">
            <h2 className="text-label-lg text-text-primary">Day Book</h2>
            <p className="text-caption text-text-tertiary">
              {filterLabel(filter)}
              {q ? ` matching “${q}”` : ''} ·{' '}
              {loading ? '…' : `${total.toLocaleString('en-US')} ${total === 1 ? 'entry' : 'entries'}`} · {sortLabel(sort)}
            </p>
          </div>
          <SearchInput
            size="sm"
            value={draft}
            onValueChange={setDraft}
            placeholder="Search number or party"
            aria-label="Search the Day Book by document number or party"
            containerClassName="w-full sm:w-64"
          />
        </div>
        <div role="group" aria-label="Day Book filter" className="-mx-xxs mt-xs flex gap-xxs overflow-x-auto pb-sm">
          {tabsFor(summary, filter).map((t) => {
            const on = t.filter === filter;
            return (
              <button
                key={t.filter}
                type="button"
                aria-pressed={on}
                onClick={() => onFilter(t.filter)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-xxs whitespace-nowrap rounded-full border px-sm py-[5px] text-label-sm transition-colors',
                  on
                    ? t.warn
                      ? 'border-warning bg-warning text-text-inverse'
                      : 'border-primary bg-primary text-text-inverse'
                    : t.warn
                      ? 'border-warning-light bg-warning-lighter text-text-primary hover:border-warning'
                      : 'border-border-light bg-surface text-text-secondary hover:border-border hover:text-text-primary',
                )}
              >
                {t.label}
                {t.count !== null && (
                  <span
                    className={cn(
                      'rounded-full px-[6px] tabular',
                      on ? 'bg-surface/25 text-text-inverse' : 'bg-surface-2 text-text-secondary',
                    )}
                  >
                    {t.count.toLocaleString('en-US')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-sm p-lg" role="status" aria-label="Loading the Day Book">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between gap-lg">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      ) : failed ? (
        <div className="p-lg">
          <p className="text-body-sm text-text-secondary">The Day Book could not be loaded.</p>
          <Button variant="secondary" size="sm" className="mt-sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-sm px-lg py-xl text-center">
          <p className="text-body-sm text-text-secondary">
            {q ? `No entries match “${q}” in ${filterLabel(filter).toLowerCase()}.` : 'Nothing here for this day.'}
          </p>
          {q && (
            <Button variant="secondary" size="sm" onClick={() => setDraft('')}>
              Clear search
            </Button>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'transition-opacity duration-150 motion-reduce:transition-none',
            fetching ? 'pointer-events-none opacity-60' : 'opacity-100',
          )}
          aria-busy={fetching}
        >
          {/* A phone gets one card per document: a five-column table there
              scrolls sideways and wraps every number onto three lines. */}
          <ul className="divide-y divide-border-light sm:hidden" aria-label="Day Book entries">
            {rows.map((e) => (
              <PhoneRow key={`m-${e.kind}-${e.id}-${e.createdAt}`} e={e} voids={voids} showBy={showBy} tz={summary.timezone} />
            ))}
          </ul>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[36rem] text-body-sm" aria-label="Day Book">
              <thead className="bg-surface-2">
                <tr className="text-left text-overline text-text-tertiary">
                  <SortHeader
                    label={voids ? 'When' : 'Time'}
                    asc="oldest"
                    desc="newest"
                    sort={sort}
                    onSort={onSort}
                    className="w-20 pl-lg pr-sm"
                  />
                  <th className="px-sm py-xs font-normal">Document</th>
                  <SortHeader
                    label="Amount"
                    asc="amount_asc"
                    desc="amount_desc"
                    sort={sort}
                    onSort={onSort}
                    align="right"
                    className="px-sm"
                  />
                  <th className="px-sm py-xs font-normal">Status</th>
                  {showBy && <th className="py-xs pl-sm pr-lg font-normal">{voids ? 'Done by' : 'Entered by'}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {rows.map((e) => (
                  <TableRow key={`${e.kind}-${e.id}-${e.createdAt}`} e={e} voids={voids} showBy={showBy} tz={summary.timezone} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !failed && total > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPage={onPage}
          onPageSize={onPageSize}
          noun={total === 1 ? 'entry' : 'entries'}
          summary={summaryLine}
        />
      )}
    </Card>
  );
}

function DocumentLabel({ e }: { e: DayEntry }) {
  const href = entryHref(e);
  const number = e.number ?? KIND_META[e.kind].one;
  return href ? (
    <Link to={href} className="whitespace-nowrap text-label-md text-text-link hover:underline">
      {number}
    </Link>
  ) : (
    <span className="whitespace-nowrap text-label-md text-text-primary">{number}</span>
  );
}

function TableRow({ e, voids, showBy, tz }: { e: DayEntry; voids: boolean; showBy: boolean; tz: string }) {
  return (
    <tr className={cn('transition-colors hover:bg-surface-hover', !e.counted && !voids && 'text-text-secondary')}>
      <td className="whitespace-nowrap py-sm pl-lg pr-sm align-top tabular text-text-tertiary">{entryTime(e.createdAt, tz)}</td>
      <td className="px-sm py-sm">
        <span className="flex items-baseline gap-xs">
          <DocumentLabel e={e} />
          <span className="whitespace-nowrap text-caption text-text-tertiary">{KIND_META[e.kind].one}</span>
          {e.backdated && (
            <span
              className="whitespace-nowrap rounded-full bg-warning-lighter px-[6px] text-caption text-warning"
              title="Entered later than it is dated"
            >
              dated {formatShortDate(e.date)}
            </span>
          )}
        </span>
        <span className="block max-w-[24rem] truncate text-caption text-text-secondary" title={e.partyName ?? undefined}>
          {e.partyName ?? '—'}
        </span>
      </td>
      <td
        className={cn(
          'whitespace-nowrap px-sm py-sm text-right align-top text-label-md tabular',
          !e.counted && !voids ? 'text-text-tertiary line-through' : 'text-text-primary',
        )}
      >
        {dayMoney(e.amount)}
      </td>
      <td className="px-sm py-sm align-top">
        {e.status ? <StatusBadge status={e.status} /> : <span className="text-text-tertiary">—</span>}
      </td>
      {showBy && (
        <td className="max-w-[9rem] truncate py-sm pl-sm pr-lg align-top text-caption text-text-secondary" title={e.createdBy?.name}>
          {e.createdBy?.name ?? '—'}
        </td>
      )}
    </tr>
  );
}

function PhoneRow({ e, voids, showBy, tz }: { e: DayEntry; voids: boolean; showBy: boolean; tz: string }) {
  const struck = !e.counted && !voids;
  return (
    <li className={cn('px-lg py-sm', struck && 'text-text-secondary')}>
      <div className="flex items-baseline justify-between gap-sm">
        <span className="min-w-0 truncate">
          <DocumentLabel e={e} />
        </span>
        <span className={cn('shrink-0 tabular text-label-md', struck && 'line-through')}>{dayMoney(e.amount)}</span>
      </div>
      <p className="truncate text-caption text-text-secondary">
        {KIND_META[e.kind].label} · {e.partyName ?? '—'}
      </p>
      <div className="mt-xxs flex flex-wrap items-center gap-x-xs gap-y-xxs text-caption text-text-tertiary">
        <span className="tabular">{entryTime(e.createdAt, tz)}</span>
        {showBy && e.createdBy && <span>· {e.createdBy.name}</span>}
        {e.backdated && <span className="text-warning">· dated {formatShortDate(e.date)}</span>}
        {e.status && <StatusBadge status={e.status} className="ml-auto" />}
      </div>
    </li>
  );
}

export default DayBook;
