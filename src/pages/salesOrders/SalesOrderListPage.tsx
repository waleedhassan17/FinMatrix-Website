import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { DateField } from '@/components/ui/Field';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import { fulfilledLineCount, type SalesOrder } from '@/models/salesOrder';
import { getSalesOrders } from '@/networks/sales/salesOrderNetwork';
import { formatMoney } from '@/utils/money';

const PAGE_SIZE = 50;

type Tab = 'all' | 'open' | 'partial' | 'fulfilled' | 'invoiced' | 'cancelled';

const TABS: [Tab, string][] = [
  ['all', 'All'],
  ['open', 'Open'],
  ['partial', 'Partial'],
  ['fulfilled', 'Fulfilled'],
  ['invoiced', 'Invoiced'],
  ['cancelled', 'Cancelled'],
];

const columnHelper = createColumnHelper<SalesOrder>();

export default function SalesOrderListPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: orders = [], isLoading, isError, error } = useQuery({
    queryKey: ['sales-orders', 'list', { search, fromDate, toDate }],
    queryFn: () =>
      getSalesOrders({
        search: search || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const counts = useMemo(() => {
    const c = { all: orders.length } as Record<Tab, number>;
    for (const t of TABS) if (t[0] !== 'all') c[t[0]] = 0;
    for (const o of orders) if (o.status in c) c[o.status as Tab] += 1;
    return c;
  }, [orders]);

  const rows = useMemo(
    () => (tab === 'all' ? orders : orders.filter((o) => o.status === tab)),
    [orders, tab],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('orderNumber', {
        header: 'Number',
        cell: (ctx) => (
          <span className="text-label-lg text-text-primary">
            {ctx.getValue() || '—'}
          </span>
        ),
      }),
      columnHelper.accessor('customerName', {
        header: 'Customer',
        cell: (ctx) => ctx.getValue() || '—',
      }),
      columnHelper.accessor('orderDate', { header: 'Ordered' }),
      columnHelper.accessor('expectedDate', {
        header: 'Expected',
        cell: (ctx) => ctx.getValue()?.slice(0, 10) ?? '—',
      }),
      columnHelper.display({
        id: 'fulfilment',
        header: 'Fulfilled',
        cell: (ctx) => {
          const order = ctx.row.original;
          const done = fulfilledLineCount(order);
          const total = order.lines.length;
          // Percentage of LINES fully shipped. The app's bar passes a 0–1
          // fraction to a component expecting 0–100, so a finished order
          // renders a 1%-wide bar; this one is scaled correctly.
          const pct = total > 0 ? (done / total) * 100 : 0;
          return (
            <div className="min-w-24">
              <div className="text-caption text-text-secondary tabular">
                {done}/{total} lines
              </div>
              <div className="mt-xxs h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={cn(
                    'h-full rounded-full',
                    pct >= 100 ? 'bg-success' : 'bg-warning',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (ctx) => <StatusBadge status={ctx.getValue()} />,
      }),
      columnHelper.accessor('total', {
        header: 'Total',
        meta: { align: 'right' },
        cell: (ctx) => formatMoney(ctx.getValue()),
      }),
    ],
    [],
  ) as never;

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <h1 className="text-h2 text-text-primary">Sales orders</h1>
          <p className="text-body-sm text-text-secondary">
            Confirmed orders, and how much of each has shipped.
          </p>
        </div>
        <Button asChild>
          <Link to="/sales-orders/new">
            <Plus className="size-4" />
            New sales order
          </Link>
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        onRowClick={(o) => navigate(`/sales-orders/${o.id}`)}
        empty={
          isError ? (
            <span className="text-body-sm text-danger">
              {error instanceof Error ? error.message : 'Could not load sales orders.'}
            </span>
          ) : (
            <span className="text-body-sm text-text-tertiary">
              {orders.length === 0
                ? 'No sales orders yet. Create one, or convert an accepted estimate.'
                : 'No sales orders match these filters.'}
            </span>
          )
        }
        toolbar={
          <div className="flex flex-col gap-sm border-b border-border-light p-md">
            <div className="flex flex-wrap items-center gap-sm">
              {/* The app has no search on this screen; the endpoint supports
                  it, so we offer it. */}
              <div className="relative min-w-56 flex-1">
                <Search className="pointer-events-none absolute left-sm top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by order number or notes…"
                  className="h-10 w-full rounded-md border border-border bg-background pl-[34px] pr-sm text-body-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
                />
              </div>
              <DateField
                value={fromDate}
                onChange={setFromDate}
                aria-label="From date"
                containerClassName="w-40"
              />
              <DateField
                value={toDate}
                onChange={setToDate}
                aria-label="To date"
                containerClassName="w-40"
              />
            </div>

            <div className="flex flex-wrap gap-xxs">
              {TABS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={cn(
                    'flex items-center gap-xs rounded-full px-sm py-xxs text-label-md transition-colors',
                    value === tab
                      ? 'bg-primary text-text-inverse'
                      : 'bg-neutral-100 text-text-secondary hover:bg-neutral-200',
                  )}
                >
                  {label}
                  <span
                    className={cn(
                      'tabular',
                      value === tab ? 'text-text-inverse/70' : 'text-text-tertiary',
                    )}
                  >
                    {counts[value] ?? 0}
                  </span>
                </button>
              ))}
            </div>
          </div>
        }
      />

      {orders.length >= PAGE_SIZE && (
        <p className="text-center text-caption text-text-tertiary">
          Showing the first {PAGE_SIZE}. Narrow the search or date range to see more —
          this endpoint does not return a page count.
        </p>
      )}
    </div>
  );
}
