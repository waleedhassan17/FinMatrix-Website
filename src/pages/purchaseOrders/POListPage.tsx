import { createColumnHelper } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { LoadMore } from '@/components/ui/LoadMore';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePagedList } from '@/hooks/usePagedList';
import { cn } from '@/lib/cn';
import { extraNumber, LIST_PAGE_SIZE, statusCountsOf } from '@/models/documentList';
import {
  isFullyReceived,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from '@/models/purchaseOrder';
import { getPurchaseOrderPage } from '@/networks/purchases/purchaseOrderNetwork';
import { formatMoney } from '@/utils/money';

type Tab = 'all' | PurchaseOrderStatus;

const TABS: [Tab, string][] = [
  ['all', 'All'],
  ['draft', 'Requisitions'],
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

  // Searched, filtered by tab and paged BY THE SERVER; "Load more" fetches the
  // next page. The counts and the on-order figure are the server's, over every
  // order the search matches — this page used to see only the latest 50.
  const list = usePagedList(['purchase-orders', 'list', { search, tab }], (page) =>
    getPurchaseOrderPage({
      search: search || undefined,
      status: tab === 'all' ? undefined : tab,
      page,
      limit: LIST_PAGE_SIZE,
    }),
  );
  const { isLoading, isError, error } = list;
  const data = list.rows;
  const counts = useMemo(() => statusCountsOf(list.summary, data), [list.summary, data]);

  const rows = useMemo(
    () => (tab === 'all' ? data : data.filter((po) => po.status === tab)),
    [data, tab],
  );

  // What has been ordered but not yet received — the figure that says how much
  // is in the pipeline. The server's, over every matching order; from the rows
  // loaded only with a server too old to send it.
  const onOrder = useMemo(
    () =>
      'onOrder' in list.extras
        ? extraNumber(list.extras, 'onOrder')
        : data
            .filter(
              (po) => po.status !== 'closed' && po.status !== 'draft' && !isFullyReceived(po),
            )
            .reduce((sum, po) => sum + po.total, 0),
    [list.extras, data],
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
      <PageHeader
        title="Purchase orders"
        description="What you have on order."
        actions={
          <Button asChild>
            <Link to="/purchase-orders/new">
              <Plus className="size-4" />
              New order
            </Link>
          </Button>
        }
      />

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

      <LoadMore
        shown={data.length}
        total={list.total}
        hasMore={list.hasNextPage}
        loading={list.isFetchingNextPage}
        onMore={list.fetchNextPage}
      />
    </div>
  );
}
