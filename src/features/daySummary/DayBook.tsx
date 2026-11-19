import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadMore } from '@/components/ui/LoadMore';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import { KIND_META, entryHref, filterLabel } from '@/models/daySummary';
import type { DaySummary } from '@/serializers/daySummarySerializer';
import { formatShortDate } from '@/models/reportPeriod';
import type { DayEntry, DayEntryFilter } from '@/serializers/daySummarySerializer';
import { formatMoney } from '@/utils/money';

const time = (iso: string) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';

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
 * Every document of the day, newest first — the Day Book. A tile or a "needs
 * a look" line above narrows it; each row opens its document.
 *
 * A row the totals leave out (a draft, a void, a cancelled order) says so in
 * its status instead of quietly disappearing: the reader sees everything that
 * was entered, and which of it counts.
 */
export function DayBook({
  summary,
  filter,
  onFilter,
  rows,
  total,
  loading,
  failed,
  onRetry,
  hasMore,
  loadingMore,
  onMore,
  showBy,
}: {
  summary: DaySummary;
  filter: DayEntryFilter;
  onFilter: (f: DayEntryFilter) => void;
  rows: DayEntry[];
  total: number;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  /** The "By" column — off for staff, where every row is theirs. */
  showBy: boolean;
}) {
  const voids = filter === 'voided';
  return (
    <Card className="overflow-hidden" id="day-book">
      <div className="border-b border-border-light px-lg pt-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-sm">
          <h2 className="text-label-lg text-text-primary">Day Book</h2>
          <p className="text-caption text-text-tertiary">
            {filterLabel(filter)} · {loading ? '…' : `${total.toLocaleString('en-US')} ${total === 1 ? 'entry' : 'entries'}`}
            {' · newest first'}
          </p>
        </div>
        <div role="tablist" aria-label="Day Book filter" className="-mx-xxs mt-xs flex gap-xxs overflow-x-auto pb-sm">
          {tabsFor(summary, filter).map((t) => {
            const on = t.filter === filter;
            return (
              <button
                key={t.filter}
                type="button"
                role="tab"
                aria-selected={on}
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
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-sm p-lg" role="status" aria-label="Loading the Day Book">
          {[0, 1, 2, 3].map((i) => (
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
        <p className="p-lg text-body-sm text-text-secondary">Nothing here for this day.</p>
      ) : (
        <>
        {/* A phone gets one card per document: a seven-column table there
            scrolls sideways and wraps every number onto three lines. */}
        <ul className="divide-y divide-border-light sm:hidden" aria-label="Day Book entries">
          {rows.map((e) => {
            const href = entryHref(e);
            const number = e.number ?? KIND_META[e.kind].one;
            return (
              <li key={`m-${e.kind}-${e.id}-${e.createdAt}`} className={cn('px-lg py-sm', !e.counted && !voids && 'text-text-secondary')}>
                <div className="flex items-baseline justify-between gap-sm">
                  {href ? (
                    <Link to={href} className="min-w-0 truncate text-label-md text-text-link hover:underline">
                      {number}
                    </Link>
                  ) : (
                    <span className="min-w-0 truncate text-label-md text-text-primary">{number}</span>
                  )}
                  <span className={cn('shrink-0 tabular text-label-md', !e.counted && !voids && 'line-through decoration-text-tertiary')}>
                    {formatMoney(e.amount)}
                  </span>
                </div>
                <p className="truncate text-caption text-text-secondary">
                  {KIND_META[e.kind].label} · {e.partyName ?? '—'}
                </p>
                <div className="mt-xxs flex flex-wrap items-center gap-x-xs gap-y-xxs text-caption text-text-tertiary">
                  <span className="tabular">{time(e.createdAt)}</span>
                  {showBy && e.createdBy && <span>· {e.createdBy.name}</span>}
                  {e.backdated && <span className="text-warning">· dated {formatShortDate(e.date)}</span>}
                  {e.status && <StatusBadge status={e.status} className="ml-auto" />}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[36rem] text-body-sm" aria-label="Day Book">
            <thead className="bg-surface-2">
              <tr className="text-left text-overline text-text-tertiary">
                <th className="w-16 py-xs pl-lg pr-sm font-normal">{voids ? 'When' : 'Time'}</th>
                <th className="px-sm py-xs font-normal">Document</th>
                <th className="px-sm py-xs text-right font-normal">Amount</th>
                <th className="px-sm py-xs font-normal">Status</th>
                {showBy && <th className="py-xs pl-sm pr-lg font-normal">{voids ? 'Done by' : 'Entered by'}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {rows.map((e) => {
                const href = entryHref(e);
                const number = e.number ?? KIND_META[e.kind].one;
                return (
                  <tr
                    key={`${e.kind}-${e.id}-${e.createdAt}`}
                    className={cn('transition-colors hover:bg-surface-hover', !e.counted && !voids && 'text-text-secondary')}
                  >
                    <td className="whitespace-nowrap py-sm pl-lg pr-sm align-top tabular text-text-tertiary">{time(e.createdAt)}</td>
                    <td className="px-sm py-sm">
                      <span className="flex items-baseline gap-xs">
                        {href ? (
                          <Link to={href} className="whitespace-nowrap text-label-md text-text-link hover:underline">
                            {number}
                          </Link>
                        ) : (
                          <span className="whitespace-nowrap text-label-md text-text-primary">{number}</span>
                        )}
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
                      {formatMoney(e.amount)}
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
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
      {!loading && !failed && (
        <div className="px-lg pb-md pt-sm">
          <LoadMore shown={rows.length} total={total} hasMore={hasMore} loading={loadingMore} onMore={onMore} />
        </div>
      )}
    </Card>
  );
}

export default DayBook;
