import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, MousePointerClick } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import { formatQty } from '@/models/inventory';
import {
  STOCK_FILTERS,
  clampPage,
  defaultSortDir,
  filterRows,
  matchesFilter,
  pageCount,
  pageRangeLabel,
  pageRows,
  rowTotals,
  sortRows,
  traded,
  type SortDir,
  type SortKey,
  type StockFilter,
  type ValuationRow,
} from '@/models/inventoryValuation';
import { formatShortDate } from '@/models/reportPeriod';
import { formatAmount } from '@/utils/money';

interface Column {
  key: SortKey;
  label: string;
  align: 'left' | 'right';
  /** Hides a secondary column on a narrow screen — header and cells together. */
  className?: string;
  sales?: boolean;
}

/**
 * Six columns, not ten. Category sits under the item's name; unit cost,
 * share of stock and units sold live in the explorer and the CSV. What is
 * left is what a reader scans a valuation for: what is held, what it is
 * worth, and what it earned.
 */
const COLUMNS: Column[] = [
  { key: 'itemName', label: 'Item', align: 'left' },
  { key: 'qty', label: 'On hand', align: 'right', className: 'hidden sm:table-cell' },
  { key: 'value', label: 'Stock value', align: 'right' },
  { key: 'revenue', label: 'Revenue', align: 'right', className: 'hidden md:table-cell', sales: true },
  { key: 'grossProfit', label: 'Gross profit', align: 'right', className: 'hidden sm:table-cell', sales: true },
  { key: 'marginPct', label: 'Margin', align: 'right', className: 'hidden lg:table-cell', sales: true },
];

const qty = (n: number) => (n < 0 ? `−${formatQty(-n)}` : formatQty(n));

export interface ItemsQuery {
  search: string;
  category: string;
  filter: StockFilter;
  sort: SortKey;
  dir: SortDir;
  page: number;
}

export interface InventoryItemsTableProps {
  rows: readonly ValuationRow[];
  /** Whether the sales columns have anything behind them. */
  showSales: boolean;
  query: ItemsQuery;
  /** A change to the view. Any change but the page returns to page 1. */
  onQuery: (patch: Partial<ItemsQuery>) => void;
  /** Where an item opens — the explorer, with the period carried along. */
  hrefFor: (itemId: string) => string;
}

/**
 * Every item, a page at a time — and the way into each one.
 *
 * Built so that someone who has never seen the report knows what to do: a
 * line above the table says it, every row ends in "Explore", and the whole row
 * is a target. The item name is a real link (keyboard, middle-click, copy
 * link).
 *
 * The view — search, category, filter, sort and page — belongs to the page's
 * URL, so coming Back from an item returns to exactly this list.
 */
export function InventoryItemsTable({
  rows,
  showSales,
  query,
  onQuery,
  hrefFor,
}: InventoryItemsTableProps) {
  const navigate = useNavigate();

  const categories = useMemo(
    () => [...new Set(rows.map((r) => r.category))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        STOCK_FILTERS.map((f) => [f.key, rows.filter((r) => matchesFilter(r, f.key)).length]),
      ) as Record<StockFilter, number>,
    [rows],
  );
  const filters = STOCK_FILTERS.filter((f) => showSales || (f.key !== 'belowCost' && f.key !== 'unsold'));
  const shown = useMemo(
    () =>
      sortRows(
        filterRows(rows, { search: query.search, category: query.category, filter: query.filter }),
        query.sort,
        query.dir,
      ),
    [rows, query.search, query.category, query.filter, query.sort, query.dir],
  );
  const page = clampPage(query.page, shown.length);
  const pages = pageCount(shown.length);
  const visible = pageRows(shown, page);
  const totals = rowTotals(shown);
  const columns = COLUMNS.filter((c) => showSales || !c.sales);
  const filtered = query.search.trim() !== '' || query.category !== '' || query.filter !== 'all';

  const toggleSort = (key: SortKey) =>
    onQuery(
      query.sort === key
        ? { sort: key, dir: query.dir === 'asc' ? 'desc' : 'asc' }
        : { sort: key, dir: defaultSortDir(key) },
    );

  const pad = (i: number) => (i === 0 ? 'pl-lg pr-md' : 'px-md');

  return (
    <div>
      {/* Toolbar: find, narrow, and — for anyone new here — what to do next. */}
      <div className="flex flex-col gap-sm px-lg py-md lg:flex-row lg:items-center">
        <SearchInput
          value={query.search}
          onValueChange={(search) => onQuery({ search })}
          placeholder="Search item or SKU"
          aria-label="Search items"
          containerClassName="lg:w-64"
        />
        <div className="flex flex-col gap-sm sm:flex-row">
          <Select
            compact
            value={query.category || '__all__'}
            onChange={(v) => onQuery({ category: v === '__all__' ? '' : v })}
            options={[
              { value: '__all__', label: 'All categories' },
              ...categories.map((c) => ({ value: c, label: c })),
            ]}
            containerClassName="min-w-0 flex-1 lg:w-48 lg:flex-none"
          />
          <Select<StockFilter>
            compact
            value={query.filter}
            onChange={(filter) => onQuery({ filter })}
            options={filters.map((f) => ({
              value: f.key,
              label: f.key === 'all' ? `All items (${counts.all})` : `${f.label} (${counts[f.key]})`,
            }))}
            containerClassName="min-w-0 flex-1 lg:w-56 lg:flex-none"
          />
        </div>
        <p className="flex items-center gap-xs text-caption text-text-tertiary lg:ml-auto">
          <MousePointerClick className="size-4 shrink-0 text-primary" aria-hidden="true" />
          Select any item to explore its monthly sales, profit and stock.
        </p>
      </div>

      <div className="overflow-x-auto border-t border-border-light">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              {columns.map((c, i) => {
                const on = query.sort === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={on ? (query.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn('py-xxs', pad(i), c.align === 'right' ? 'text-right' : 'text-left', c.className)}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        'inline-flex items-center gap-xxs rounded-sm py-xs text-overline whitespace-nowrap transition-colors',
                        c.align === 'right' && 'flex-row-reverse',
                        on ? 'text-primary' : 'text-text-secondary hover:text-text-primary',
                      )}
                    >
                      {c.label}
                      {on &&
                        (query.dir === 'asc' ? (
                          <ArrowUp className="size-3" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden="true" />
                        ))}
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="pr-sm sm:pr-lg print:hidden">
                <span className="sr-only">Explore</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const href = hrefFor(r.itemId);
              const idle = showSales && r.qty > 0 && r.unitsSold <= 0;
              return (
                <tr
                  key={r.itemId}
                  onClick={(e) => {
                    // The links inside handle their own click, modifier keys included.
                    if ((e.target as HTMLElement).closest('a')) return;
                    navigate(href);
                  }}
                  className="group cursor-pointer border-b border-border-light transition-colors hover:bg-primary-tint/40"
                >
                  {columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={cn(
                        'py-sm',
                        pad(i),
                        c.align === 'right' ? 'text-right tabular whitespace-nowrap' : 'text-left',
                        c.className,
                      )}
                    >
                      {c.key === 'itemName' ? (
                        <>
                          <Link
                            to={href}
                            className="block max-w-[11rem] truncate text-label-md text-text-primary group-hover:text-primary sm:max-w-[16rem] lg:max-w-[22rem]"
                          >
                            {r.itemName}
                          </Link>
                          <span className="block max-w-[11rem] truncate text-caption text-text-tertiary sm:max-w-[16rem] lg:max-w-[22rem]">
                            {[r.sku, r.category].filter(Boolean).join(' · ')}
                            {idle && (
                              <span className="text-text-secondary">
                                {' · '}
                                {r.lastSoldDate ? `last sold ${formatShortDate(r.lastSoldDate)}` : 'never sold'}
                              </span>
                            )}
                          </span>
                        </>
                      ) : (
                        <Cell row={r} column={c.key} />
                      )}
                    </td>
                  ))}
                  <td className="w-px pr-sm pl-xs text-right whitespace-nowrap sm:pr-lg sm:pl-sm print:hidden">
                    <Link
                      to={href}
                      tabIndex={-1}
                      aria-hidden="true"
                      className="inline-flex items-center gap-[2px] text-label-md text-text-tertiary transition-colors group-hover:text-primary"
                    >
                      <span className="hidden md:inline">Explore</span>
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr className="border-t border-text-primary bg-surface-2">
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={cn(
                      'py-sm text-label-lg whitespace-nowrap text-text-primary',
                      pad(i),
                      c.align === 'right' && 'text-right tabular',
                      c.className,
                    )}
                  >
                    {c.key === 'itemName'
                      ? filtered
                        ? `Total · ${shown.length} of ${rows.length} items`
                        : `Total · ${rows.length} items`
                      : c.key === 'value'
                        ? formatAmount(totals.value)
                        : c.key === 'revenue'
                          ? formatAmount(totals.revenue)
                          : c.key === 'grossProfit'
                            ? <span className={totals.grossProfit < 0 ? 'text-danger' : undefined}>{formatAmount(totals.grossProfit)}</span>
                            : c.key === 'marginPct'
                              ? totals.marginPct === null
                                ? '—'
                                : `${totals.marginPct.toFixed(1)}%`
                              : ''}
                  </td>
                ))}
                <td className="print:hidden" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {shown.length === 0 ? (
        <div className="px-lg py-xl text-center">
          <p className="text-label-lg text-text-primary">No items match</p>
          <p className="mt-xxs text-body-sm text-text-secondary">Try another search or filter.</p>
          {filtered && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-md"
              onClick={() => onQuery({ search: '', category: '', filter: 'all' })}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-md px-lg py-sm print:hidden">
          <p className="text-caption text-text-tertiary tabular">{pageRangeLabel(page, shown.length)}</p>
          {pages > 1 && (
            <div className="flex items-center gap-xs">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => onQuery({ page: page - 1 })}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Previous
              </Button>
              <span className="px-xs text-caption text-text-tertiary tabular">
                {page} / {pages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= pages}
                onClick={() => onQuery({ page: page + 1 })}
                aria-label="Next page"
              >
                Next
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Cell({ row: r, column }: { row: ValuationRow; column: SortKey }) {
  const dash = <span className="text-text-tertiary">—</span>;
  switch (column) {
    case 'qty':
      return (
        <span className={cn('text-body-sm', r.qty <= 0 ? 'text-warning' : 'text-text-primary')}>{qty(r.qty)}</span>
      );
    case 'value':
      return <span className="text-label-md text-text-primary">{formatAmount(r.value)}</span>;
    case 'revenue':
      return r.revenue === 0 ? dash : <span className="text-body-sm text-text-primary">{formatAmount(r.revenue)}</span>;
    case 'grossProfit':
      // Selling below cost is the one thing on this report worth
      // interrupting someone for.
      return !traded(r) ? (
        dash
      ) : (
        <span className={cn('text-body-sm', r.grossProfit < 0 ? 'text-danger' : 'text-text-primary')}>
          {formatAmount(r.grossProfit)}
        </span>
      );
    case 'marginPct':
      return r.marginPct === null ? (
        dash
      ) : (
        <span className={cn('text-body-sm', r.marginPct < 0 ? 'text-danger' : 'text-text-secondary')}>
          {r.marginPct.toFixed(1)}%
        </span>
      );
    default:
      return null;
  }
}

export default InventoryItemsTable;
