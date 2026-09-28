import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
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
import { LIST_PAGE_SIZE, statusCountsOf } from '@/models/documentList';
import { getBillPage } from '@/networks/purchases/billNetwork';
import { formatMoney } from '@/utils/money';

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
   * Searched, filtered by tab and paged BY THE SERVER; "Load more" fetches the
   * next page.
   *
   * The tabs used to filter one unpaged fetch in the browser, because overdue
   * is derived from the due date and the server could not filter by it. It
   * now filters by the status each bill displays, and sends counts and totals
   * over every bill the search matches — so each tab can show all of its
   * bills, and the counts stay true for the tabs not shown.
   */
  const list = useInfiniteQuery({
    queryKey: ['bills', 'list', { search, tab }],
    queryFn: ({ pageParam }) =>
      getBillPage({
        search: search || undefined,
        status: tab === 'all' ? undefined : (tab as BillStatus),
        page: pageParam,
        limit: LIST_PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
  const { isLoading, isError, error } = list;
  const data = useMemo(() => list.data?.pages.flatMap((p) => p.rows) ?? [], [list.data]);
  const serverSummary = list.data?.pages[0]?.summary ?? null;
  const matching = list.data?.pages[0]?.total ?? data.length;

  const counts = useMemo(() => statusCountsOf(serverSummary, data), [serverSummary, data]);

  // Already filtered by the server; applied here too only so a tab switch
  // shows at once, before its answer lands.
  const rows = useMemo(
    () => (tab === 'all' ? data : data.filter((b) => b.status === (tab as BillStatus))),
    [data, tab],
  );

  // What the open bills owe — drafts are not owed until posted.
  const { totalOwed, overdueOwed } = useMemo(() => {
    if (serverSummary) return { totalOwed: serverSummary.outstanding, overdueOwed: serverSummary.overdue };
    let owed = 0;
    let overdue = 0;
    for (const b of data) {
      if (b.status === 'open' || b.status === 'partial' || b.status === 'overdue') owed += b.balance;
      if (b.status === 'overdue') overdue += b.balance;
    }
    return { totalOwed: owed, overdueOwed: overdue };
  }, [serverSummary, data]);

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
                  <span className="ml-xxs tabular opacity-70">{counts[t] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
        }
      />

      {list.hasNextPage && (
        <div className="flex flex-col items-center gap-xs">
          <p className="text-caption text-text-tertiary tabular">
            Showing {data.length} of {matching}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
          >
            {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
