import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import type { Bill, BillStatus } from '@/models/bill';
import { getBills } from '@/networks/purchases/billNetwork';
import { formatMoney } from '@/utils/money';

const PAGE_LIMIT = 50;

type Tab = 'all' | 'draft' | 'open' | 'overdue' | 'partial' | 'paid';

const TABS: [Tab, string][] = [
  ['all', 'All'],
  ['draft', 'Draft'],
  ['open', 'Open'],
  ['overdue', 'Overdue'],
  ['partial', 'Partial'],
  ['paid', 'Paid'],
];

const columnHelper = createColumnHelper<Bill>();

export default function BillListPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  /**
   * One unfiltered fetch, tabbed client-side.
   *
   * Not an optimisation — a necessity. `overdue` is derived on read and never
   * stored, so `GET /bills?status=overdue` can only ever return an empty list.
   * Filtering some tabs on the server and one in the browser would make the
   * Overdue tab quietly different from the rest; all six filter locally instead,
   * against the status the serializer derives.
   */
  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ['bills', 'list', { search }],
    queryFn: () => getBills({ search: search || undefined, limit: PAGE_LIMIT }),
    placeholderData: keepPreviousData,
  });

  const counts = useMemo(() => {
    const c: Record<Tab, number> = {
      all: data.length,
      draft: 0,
      open: 0,
      overdue: 0,
      partial: 0,
      paid: 0,
    };
    for (const b of data) {
      if (b.status in c) c[b.status as Tab] += 1;
    }
    return c;
  }, [data]);

  const rows = useMemo(
    () => (tab === 'all' ? data : data.filter((b) => b.status === (tab as BillStatus))),
    [data, tab],
  );

  const totalOwed = useMemo(
    () => data.reduce((sum, b) => sum + b.balance, 0),
    [data],
  );
  const overdueOwed = useMemo(
    () =>
      data
        .filter((b) => b.status === 'overdue')
        .reduce((sum, b) => sum + b.balance, 0),
    [data],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('billNumber', {
        header: 'Bill',
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
      columnHelper.accessor('issueDate', {
        header: 'Date',
        cell: (ctx) => ctx.getValue().slice(0, 10) || '—',
      }),
      columnHelper.accessor('dueDate', {
        header: 'Due',
        cell: (ctx) => (
          <span
            className={cn(
              ctx.row.original.status === 'overdue' && 'text-danger',
            )}
          >
            {ctx.getValue().slice(0, 10) || '—'}
          </span>
        ),
      }),
      columnHelper.accessor('total', {
        header: 'Total',
        meta: { align: 'right' },
        cell: (ctx) => (
          <span className="tabular">{formatMoney(ctx.getValue())}</span>
        ),
      }),
      columnHelper.accessor('balance', {
        header: 'Owing',
        meta: { align: 'right' },
        cell: (ctx) => (
          <span
            className={cn('tabular', ctx.getValue() > 0 ? 'text-danger' : 'text-success')}
          >
            {formatMoney(ctx.getValue())}
          </span>
        ),
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
        title="Bills"
        description="What you owe suppliers."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to="/bills/pay">Pay bills</Link>
            </Button>
            <Button asChild>
              <Link to="/bills/new">
                <Plus className="size-4" />
                New bill
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-md sm:grid-cols-2">
        <Card className="p-lg">
          <p className="text-caption text-text-secondary">Owing on these bills</p>
          <p className="mt-xxs text-h3 text-text-primary tabular">
            {formatMoney(totalOwed)}
          </p>
        </Card>
        <Card className="p-lg">
          <p className="text-caption text-text-secondary">Of which overdue</p>
          <p
            className={cn(
              'mt-xxs text-h3 tabular',
              overdueOwed > 0 ? 'text-danger' : 'text-text-primary',
            )}
          >
            {formatMoney(overdueOwed)}
          </p>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        onRowClick={(b) => navigate(`/bills/${b.id}`)}
        empty={
          isError ? (
            <span className="text-body-sm text-danger">
              {error instanceof Error ? error.message : 'Could not load bills.'}
            </span>
          ) : search ? (
            <span className="text-body-sm text-text-tertiary">
              No results for &ldquo;{search}&rdquo;.
            </span>
          ) : tab !== 'all' ? (
            <span className="text-body-sm text-text-tertiary">
              No {tab} bills.
            </span>
          ) : (
            <span className="text-body-sm text-text-tertiary">
              No bills yet. Record what a supplier has invoiced you.
            </span>
          )
        }
        toolbar={
          <div className="flex flex-col gap-sm border-b border-border-light p-md">
            <SearchInput
              value={searchInput}
              onValueChange={setSearchInput}
              placeholder="Search by bill number, vendor or memo…"
              aria-label="Search bills"
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
                  <span className="ml-xxs tabular opacity-70">{counts[t]}</span>
                </button>
              ))}
            </div>
          </div>
        }
      />

      {/* Same caveat as invoices: GET /bills is flat, so the envelope drops the
          pagination block and there is no page count to page against. */}
      {data.length >= PAGE_LIMIT && (
        <p className="text-caption text-text-tertiary">
          Showing the {PAGE_LIMIT} most recent bills. Narrow the search to find
          older ones.
        </p>
      )}
    </div>
  );
}
