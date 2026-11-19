import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { pageSlots } from '@/models/pagination';

export interface PaginationProps {
  page: number;
  pageSize: number;
  /** Rows across every page. */
  total: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
  pageSizes?: readonly number[];
  /** What the rows are, for the range line: "entries", "invoices". */
  noun?: string;
  /** Extra facts beside the range — a total amount. */
  summary?: ReactNode;
  className?: string;
}

/**
 * Server-side pagination for a long list: where you are ("26–50 of 143"),
 * how many rows a page holds, and the pages — numbered on a wide screen,
 * previous / next with "Page 2 of 6" on a phone.
 *
 * Paging rather than an ever-growing "Load more" keeps a page the same
 * height whatever the day brought, and keeps a row's place findable again
 * ("it was on page 3").
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  pageSizes = [25, 50, 100],
  noun = 'rows',
  summary,
  className,
}: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const btn =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-xs text-label-md tabular transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:pointer-events-none disabled:opacity-40';

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-col gap-sm border-t border-border-light px-lg py-sm sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-md gap-y-xxs text-caption text-text-secondary">
        <span className="tabular" aria-live="polite">
          {total === 0 ? `No ${noun}` : `Showing ${first.toLocaleString('en-US')}–${last.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} ${noun}`}
        </span>
        {summary}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-md gap-y-xs sm:justify-end">
        {onPageSize && (
          <label className="flex items-center gap-xs whitespace-nowrap text-caption text-text-secondary">
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="h-8 rounded-md border border-border bg-surface px-xs text-label-md text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              {pageSizes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}

        {pages > 1 && (
          <div className="flex items-center gap-xxs">
            <button
              type="button"
              className={cn(btn, 'text-text-secondary hover:bg-surface-hover')}
              onClick={() => onPage(page - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="px-xs text-caption tabular text-text-secondary sm:hidden">
              Page {page} of {pages}
            </span>
            <div className="hidden items-center gap-xxs sm:flex">
              {pageSlots(page, pages).map((p, i) =>
                p === null ? (
                  <span key={`gap-${i}`} className="px-xxs text-caption text-text-tertiary" aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onPage(p)}
                    aria-label={`Page ${p}`}
                    aria-current={p === page ? 'page' : undefined}
                    className={cn(
                      btn,
                      p === page
                        ? 'bg-primary text-text-inverse'
                        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                    )}
                  >
                    {p}
                  </button>
                ),
              )}
            </div>
            <button
              type="button"
              className={cn(btn, 'text-text-secondary hover:bg-surface-hover')}
              onClick={() => onPage(page + 1)}
              disabled={page >= pages}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

export default Pagination;
