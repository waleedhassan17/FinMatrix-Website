import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import { formatQty } from '@/models/inventory';
import {
  STOCK_FILTERS,
  defaultSortDir,
  filterRows,
  formatShare,
  matchesFilter,
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

const COLUMNS: Column[] = [
  { key: 'itemName', label: 'Item', align: 'left' },
  { key: 'category', label: 'Category', align: 'left', className: 'hidden md:table-cell' },
  { key: 'qty', label: 'On hand', align: 'right' },
  { key: 'unitCost', label: 'Unit cost', align: 'right', className: 'hidden lg:table-cell' },
  { key: 'value', label: 'Stock value', align: 'right' },
  { key: 'share', label: '% of stock', align: 'right', className: 'hidden xl:table-cell' },
  { key: 'unitsSold', label: 'Units sold', align: 'right', className: 'hidden sm:table-cell', sales: true },
  { key: 'revenue', label: 'Revenue', align: 'right', className: 'hidden sm:table-cell', sales: true },
  { key: 'grossProfit', label: 'Gross profit', align: 'right', sales: true },
  { key: 'marginPct', label: 'Margin', align: 'right', className: 'hidden md:table-cell', sales: true },
];

const qty = (n: number) => (n < 0 ? `−${formatQty(-n)}` : formatQty(n));

export interface InventoryItemsTableProps {
  rows: readonly ValuationRow[];
  /** Whether the sales columns have anything behind them. */
  showSales: boolean;
  /** All stock value, for each row's share. */
  totalValue: number;
  category: string;
  onCategory: (category: string) => void;
  /** Where an item opens — the explorer, with the period carried along. */
  hrefFor: (itemId: string) => string;
  /** "Jan 1 – Sep 26", naming what the sales columns cover. */
  periodLabel: string;
}

/**
 * Every item: what it holds now, and what it sold in the period.
 *
 * Built for finding things — search, a category, the questions worth asking
 * as one-click filters (what sells below cost, what did not sell at all, what
 * ran out) — and every column sorts. The footer totals the rows SHOWING, so a
 * filtered table still foots to itself; the headline figures above it stay
 * whole-company.
 *
 * The item name is a real link (keyboard, middle-click, copy link); the rest
 * of the row is a larger click target for the same place.
 */
export function InventoryItemsTable({
  rows,
  showSales,
  totalValue,
  category,
  onCategory,
  hrefFor,
  periodLabel,
}: InventoryItemsTableProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'value', dir: 'desc' });

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
  const shown = useMemo(
    () => sortRows(filterRows(rows, { search, category, filter }), sort.key, sort.dir),
    [rows, search, category, filter, sort],
  );
  const totals = rowTotals(shown);
  const columns = COLUMNS.filter((c) => showSales || !c.sales);
  const filtered = search.trim() !== '' || category !== '' || filter !== 'all';
  const filters = STOCK_FILTERS.filter((f) => showSales || (f.key !== 'belowCost' && f.key !== 'unsold'));

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultSortDir(key) }));

  const clear = () => {
    setSearch('');
    setFilter('all');
    onCategory('');
  };

  return (
    <div>
      <div className="flex flex-col gap-sm border-b border-border-light px-lg py-md lg:flex-row lg:items-center">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search item or SKU"
          aria-label="Search items"
          containerClassName="lg:w-64"
        />
        <Select
          compact
          value={category || '__all__'}
          onChange={(v) => onCategory(v === '__all__' ? '' : v)}
          options={[
            { value: '__all__', label: 'All categories' },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
          containerClassName="lg:w-52"
        />
        <Select<StockFilter>
          compact
          value={filter}
          onChange={setFilter}
          options={filters.map((f) => ({ value: f.key, label: `${f.label} (${counts[f.key]})` }))}
          containerClassName="sm:hidden"
        />
        <div
          role="group"
          aria-label="Show"
          className="hidden h-10 max-w-full overflow-x-auto rounded-md border border-border bg-surface sm:flex lg:ml-auto"
        >
          {filters.map((f, i) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'shrink-0 px-sm text-label-md whitespace-nowrap transition-colors',
                i > 0 && 'border-l border-border',
                filter === f.key
                  ? 'bg-primary-tint text-primary'
                  : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
              )}
            >
              {f.label}
              <span className="ml-xxs text-caption text-text-tertiary tabular">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              {columns.map((c, i) => {
                const on = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn(
                      'py-xxs',
                      i === 0 ? 'pl-lg pr-md' : i === columns.length - 1 ? 'pl-md pr-lg' : 'px-md',
                      c.align === 'right' ? 'text-right' : 'text-left',
                      c.className,
                    )}
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
                        (sort.dir === 'asc' ? (
                          <ArrowUp className="size-3" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden="true" />
                        ))}
                    </button>
                  </th>
                );
              })}
              <th className="w-8 print:hidden" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const href = hrefFor(r.itemId);
              const idle = showSales && r.qty > 0 && r.unitsSold <= 0;
              return (
                <tr
                  key={r.itemId}
                  onClick={(e) => {
                    // The link inside handles its own click, modifier keys included.
                    if ((e.target as HTMLElement).closest('a')) return;
                    navigate(href);
                  }}
                  className="group cursor-pointer border-b border-border-light hover:bg-surface-hover"
                >
                  {columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={cn(
                        'py-sm',
                        i === 0 ? 'pl-lg pr-md' : i === columns.length - 1 ? 'pl-md pr-lg' : 'px-md',
                        c.align === 'right' ? 'text-right tabular whitespace-nowrap' : 'text-left',
                        c.className,
                      )}
                    >
                      {c.key === 'itemName' ? (
                        <>
                          <Link
                            to={href}
                            className="block text-body-sm text-text-primary group-hover:text-primary hover:underline"
                          >
                            {r.itemName}
                          </Link>
                          <span className="block text-caption text-text-tertiary">
                            {r.sku}
                            {idle && (
                              <>
                                {r.sku ? ' · ' : ''}
                                {r.lastSoldDate
                                  ? `Last sold ${formatShortDate(r.lastSoldDate)}`
                                  : 'Never sold'}
                              </>
                            )}
                          </span>
                        </>
                      ) : c.key === 'category' ? (
                        <span className="text-body-sm text-text-secondary">{r.category}</span>
                      ) : (
                        <Cell row={r} column={c.key} totalValue={totalValue} />
                      )}
                    </td>
                  ))}
                  <td className="w-8 pr-sm print:hidden">
                    <ChevronRight
                      className="size-4 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr className="border-t border-text-primary border-b-[3px] border-b-border-strong border-double bg-surface-2">
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={cn(
                      'py-sm text-label-lg whitespace-nowrap text-text-primary',
                      i === 0 ? 'pl-lg pr-md' : i === columns.length - 1 ? 'pl-md pr-lg' : 'px-md',
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
                        : c.key === 'share'
                          ? formatShare(totalValue > 0 ? totals.value / totalValue : 0)
                          : c.key === 'unitsSold'
                            ? qty(totals.unitsSold)
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

      {shown.length === 0 && (
        <div className="px-lg py-xl text-center">
          <p className="text-label-lg text-text-primary">No items match</p>
          <p className="mt-xxs text-body-sm text-text-secondary">
            Nothing fits {filtered ? 'these filters' : 'this view'} for {periodLabel}.
          </p>
          {filtered && (
            <Button variant="secondary" size="sm" className="mt-md" onClick={clear}>
              Clear filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Cell({
  row: r,
  column,
  totalValue,
}: {
  row: ValuationRow;
  column: SortKey;
  totalValue: number;
}) {
  const dash = <span className="text-text-tertiary">—</span>;
  switch (column) {
    case 'qty':
      return (
        <span className={cn('text-body-sm', r.qty <= 0 ? 'text-warning' : 'text-text-primary')}>
          {qty(r.qty)}
        </span>
      );
    case 'unitCost':
      return <span className="text-body-sm text-text-primary">{formatAmount(r.unitCost)}</span>;
    case 'value':
      return <span className="text-label-md text-text-primary">{formatAmount(r.value)}</span>;
    case 'share':
      return (
        <span className="text-body-sm text-text-secondary">
          {formatShare(totalValue > 0 ? r.value / totalValue : 0)}
        </span>
      );
    case 'unitsSold':
      return r.unitsSold === 0 ? dash : <span className="text-body-sm text-text-primary">{qty(r.unitsSold)}</span>;
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
        <span className={cn('text-body-sm', r.marginPct < 0 ? 'text-danger' : 'text-text-primary')}>
          {r.marginPct.toFixed(1)}%
        </span>
      );
    default:
      return null;
  }
}

export default InventoryItemsTable;
