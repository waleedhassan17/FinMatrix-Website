import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import {
  isFullyReceived,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from '@/models/purchaseOrder';
import { getPurchaseOrders } from '@/networks/purchases/purchaseOrderNetwork';
import { formatMoney } from '@/utils/money';

const PAGE_LIMIT = 50;

type Tab = 'all' | PurchaseOrderStatus;

const TABS: [Tab, string][] = [
  ['all', 'All'],
  ['draft', 'Draft'],
  ['sent', 'Sent'],
  ['partial', 'Partial'],
  ['received', 'Received'],
  ['closed', 'Closed'],
];

const columnHelper = createColumnHelper<PurchaseOrder>();

export default function POListPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ['purchase-orders', 'list', { search }],
    queryFn: () =>
      getPurchaseOrders({ search: search || undefined, limit: PAGE_LIMIT }),
    placeholderData: keepPreviousData,
  });

  const counts = useMemo(() => {
    const c = { all: data.length } as Record<Tab, number>;
    for (const [t] of TABS) if (t !== 'all') c[t] = 0;
    for (const po of data) if (po.status in c) c[po.status] += 1;
    return c;
  }, [data]);

  const rows = useMemo(
    () => (tab === 'all' ? data : data.filter((po) => po.status === tab)),
    [data, tab],
  );

  // What has been ordered but not yet received — the figure that says how much
  // is in the pipeline.
  const onOrder = useMemo(
    () =>
      data
        .filter(
          (po) => po.status !== 'closed' && po.status !== 'draft' && !isFullyReceived(po),
        )
        .reduce((sum, po) => sum + po.total, 0),
    [data],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('poNumber', {
        header: 'Order',
        cell: (ctx) => (
          <div className="min-w-0">
            <div className="truncate text-label-lg text-text-primary">
              {ctx.getValue() || '—'}
            </div>
            <div className="truncate text-caption text-text-secondary">
              {ctx.row.original.vendorName || 'Unknown vendor'}
            </div>
          </div>
        ),
      }),
      columnHelper.accessor('orderDate', {
        header: 'Ordered',
        cell: (ctx) => ctx.getValue().slice(0, 10) || '—',
      }),
      columnHelper.accessor('expectedDate', {
        header: 'Expected',
        cell: (ctx) => ctx.getValue().slice(0, 10) || '—',
      }),
      columnHelper.display({
        id: 'received',
        header: 'Received',
        cell: (ctx) => {
          const po = ctx.row.original;
          const done = po.lines.filter(
            (l) => l.receivedQuantity >= l.quantity,
          ).length;
          return (
            <span className="text-caption text-text-secondary tabular">
              {done} / {po.lines.length} lines
            </span>
          );
        },
      }),
      columnHelper.accessor('total', {
        header: 'Total',
        meta: { align: 'right' },
        cell: (ctx) => <span className="tabular">{formatMoney(ctx.getValue())}</span>,
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (ctx) => <StatusBadge status={ctx.getValue()} />,
      }),
    ],
    [],
  ) as never;

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <h1 className="text-h2 text-text-primary">Purchase orders</h1>
          <p className="text-body-sm text-text-secondary">What you have on order.</p>
        </div>
        <Button asChild>
          <Link to="/purchase-orders/new">
            <Plus className="size-4" />
            New order
          </Link>
        </Button>
      </div>

      <Card className="p-lg">
        <p className="text-caption text-text-secondary">Value still on order</p>
        <p className="mt-xxs text-h3 text-text-primary tabular">
          {formatMoney(onOrder)}
        </p>
      </Card>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        onRowClick={(po) => navigate(`/purchase-orders/${po.id}`)}
        empty={
          isError ? (
            <span className="text-body-sm text-danger">
              {error instanceof Error
                ? error.message
                : 'Could not load purchase orders.'}
            </span>
          ) : search ? (
            <span className="text-body-sm text-text-tertiary">
              No results for &ldquo;{search}&rdquo;.
            </span>
          ) : tab !== 'all' ? (
            <span className="text-body-sm text-text-tertiary">No {tab} orders.</span>
          ) : (
            <span className="text-body-sm text-text-tertiary">
              No purchase orders yet. Raise one to order stock from a supplier.
            </span>
          )
        }
        toolbar={
          <div className="flex flex-col gap-sm border-b border-border-light p-md">
            <SearchInput
              value={searchInput}
              onValueChange={setSearchInput}
              placeholder="Search by order number, vendor or notes…"
              aria-label="Search purchase orders"
              tone="background"
            />

            <div className="flex flex-wrap gap-xxs">
              {TABS.map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'rounded-full px-sm py-xxs text-label-md transition-colors',
                    t === tab
                      ? 'bg-primary text-text-inverse'
                      : 'bg-neutral-100 text-text-secondary hover:bg-neutral-200',
                  )}
                >
                  {label}
                  <span className="ml-xxs tabular opacity-70">{counts[t] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
        }
      />

      {data.length >= PAGE_LIMIT && (
        <p className="text-caption text-text-tertiary">
          Showing the {PAGE_LIMIT} most recent orders. Narrow the search to find
          older ones.
        </p>
      )}
    </div>
  );
}
