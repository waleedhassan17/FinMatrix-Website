import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Package, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, TablePager } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { StatTile } from '@/components/ui/StatTile';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { KpiTile } from '@/features/reports/KpiTile';
import { useCapability, useFeature } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import {
  STOCK_STATUS_DISPLAY,
  formatQty,
  inventoryTotals,
  itemValue,
  stockStatus,
  type InventoryItem,
  type StockStatus,
} from '@/models/inventory';
import { getItems } from '@/networks/inventory/inventoryNetwork';
import { formatMoney } from '@/utils/money';

const PAGE_SIZE = 25;

type Filter = 'active' | 'low' | 'out' | 'inactive';

type Row = InventoryItem & { value: number; status: StockStatus };

const columnHelper = createColumnHelper<Row>();

/**
 * Stock on hand, what it is worth, and what needs reordering.
 *
 * Managing items is direct for staff (`inventory.manageItems`); only
 * deactivating one and recording opening stock are the owner's, and those live
 * on the detail page.
 */
export default function InventoryListPage() {
  const enabled = useFeature('inventory');
  const navigate = useNavigate();
  const canManage = useCapability('inventory.manageItems').allowed;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [filter, setFilter] = useState<Filter>('active');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['inventory', 'items', 'list'],
    queryFn: getItems,
    enabled,
  });

  const items = useMemo(() => query.data?.rows ?? [], [query.data]);
  const totals = useMemo(() => inventoryTotals(items), [items]);

  const categoryOptions = useMemo(() => {
    const names = [...new Set(items.map((i) => i.category).filter(Boolean))].sort();
    return [
      { value: 'all', label: 'All categories' },
      ...names.map((c) => ({ value: c, label: c })),
    ];
  }, [items]);

  const inactiveCount = useMemo(() => items.filter((i) => !i.isActive).length, [items]);

  const rows = useMemo<Row[]>(() => {
    const q = search.trim().toLowerCase();
    return items
      .map((i) => ({
        ...i,
        value: itemValue(i).toDecimalPlaces(2).toNumber(),
        status: stockStatus(i),
      }))
      .filter((i) =>
        filter === 'inactive'
          ? !i.isActive
          : i.isActive && (filter === 'active' || i.status === filter),
      )
      .filter((i) => category === 'all' || i.category === category)
      .filter(
        (i) => !q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, search, category, filter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const columns = useMemo(
    () => [
      columnHelper.accessor('sku', {
        header: 'SKU',
        cell: (c) => <span className="text-label-md text-text-primary">{c.getValue()}</span>,
      }),
      columnHelper.accessor('name', {
        header: 'Item',
        cell: (c) => (
          <div className="min-w-0">
            <p className="text-body-sm text-text-primary">{c.getValue()}</p>
            {c.row.original.category && (
              <p className="text-caption text-text-tertiary">{c.row.original.category}</p>
            )}
          </div>
        ),
      }),
      columnHelper.accessor('quantityOnHand', {
        header: 'On hand',
        meta: { align: 'right' },
        cell: (c) => (
          <span className="tabular">
            {formatQty(c.getValue())}
            {c.row.original.unitOfMeasure && (
              <span className="ml-xxs text-caption text-text-tertiary">
                {c.row.original.unitOfMeasure}
              </span>
            )}
          </span>
        ),
      }),
      columnHelper.accessor('unitCost', {
        header: 'Avg. cost',
        meta: { align: 'right' },
        cell: (c) => <span className="tabular">{formatMoney(c.getValue())}</span>,
      }),
      columnHelper.accessor('value', {
        header: 'Value',
        meta: { align: 'right' },
        cell: (c) => (
          <span className="tabular text-label-md text-text-primary">
            {formatMoney(c.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (c) =>
          c.row.original.isActive ? (
            <StatusBadge
              status={STOCK_STATUS_DISPLAY[c.getValue()].badge}
              label={STOCK_STATUS_DISPLAY[c.getValue()].label}
            />
          ) : (
            <StatusBadge status="inactive" />
          ),
      }),
    ],
    [],
  ) as never;

  if (!enabled) {
    return (
      <FeatureUnavailable
        icon={Package}
        title="Inventory"
        body="Inventory is not included in your company’s plan."
      />
    );
  }

  const chips: Array<[Filter, string, number]> = [
    ['active', 'All active', totals.count],
    ['low', 'Low stock', totals.low],
    ['out', 'Out of stock', totals.out],
    ['inactive', 'Inactive', inactiveCount],
  ];

  const narrowed = search.trim() !== '' || category !== 'all' || filter !== 'active';

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        title="Inventory"
        description="Stock on hand, valued at weighted-average cost — the same figure the Inventory Valuation report and the balance sheet carry."
        actions={
          canManage && (
            <Button asChild>
              <Link to="/inventory/new">
                <Plus className="size-4" />
                New item
              </Link>
            </Button>
          )
        }
      />

      <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Active items"
          value={formatQty(totals.count)}
          loading={query.isLoading}
        />
        <KpiTile label="Stock value" value={totals.value} loading={query.isLoading} />
        <StatTile
          label="Low stock"
          value={formatQty(totals.low)}
          hint="At or below the reorder point"
          tone={totals.low > 0 ? 'warning' : 'default'}
          loading={query.isLoading}
        />
        <StatTile
          label="Out of stock"
          value={formatQty(totals.out)}
          tone={totals.out > 0 ? 'danger' : 'default'}
          loading={query.isLoading}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-md">
        <div className="flex flex-wrap gap-xs">
          {chips.map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setFilter(value);
                setPage(1);
              }}
              className={cn(
                'rounded-full px-md py-xs text-label-md transition-colors',
                filter === value
                  ? 'bg-primary text-text-inverse'
                  : 'bg-surface-2 text-text-secondary hover:text-text-primary',
              )}
            >
              {label}
              <span className="ml-xxs tabular opacity-70">{count}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-sm">
          {categoryOptions.length > 1 && (
            <Select
              label="Category"
              value={category}
              onChange={(v) => {
                setCategory(v);
                setPage(1);
              }}
              options={categoryOptions}
              containerClassName="w-52"
              compact
            />
          )}
          <SearchInput
            value={search}
            onValueChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by name or SKU…"
            aria-label="Search items"
            containerClassName="w-72 max-w-full"
          />
        </div>
      </div>

      {query.error && (
        <Card className="p-lg">
          <p className="text-body-sm text-danger">{query.error.message}</p>
        </Card>
      )}

      <div>
        <DataTable
          columns={columns}
          data={pageRows}
          isLoading={query.isLoading}
          onRowClick={(row) => navigate(`/inventory/${row.id}`)}
          empty={
            <div className="py-xl text-center">
              <Package className="mx-auto size-8 text-text-tertiary" />
              <p className="mt-sm text-label-lg text-text-primary">
                {narrowed ? 'No items match' : 'No items yet'}
              </p>
              <p className="mt-xxs text-body-sm text-text-secondary">
                {narrowed
                  ? 'Try a different search, category or filter.'
                  : 'Add the products you stock, then bring in their quantities with opening stock or a purchase-order receipt.'}
              </p>
              {!narrowed && canManage && (
                <Button asChild className="mt-lg">
                  <Link to="/inventory/new">
                    <Plus className="size-4" />
                    New item
                  </Link>
                </Button>
              )}
            </div>
          }
        />
        <TablePager page={current} totalPages={totalPages} total={rows.length} onPage={setPage} />
        {query.data?.truncated && (
          <p className="mt-sm text-caption text-text-tertiary">
            Showing the first {items.length} items.
          </p>
        )}
      </div>
    </div>
  );
}
