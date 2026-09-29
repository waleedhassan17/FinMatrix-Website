import { createColumnHelper } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { LoadMore } from '@/components/ui/LoadMore';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePagedList } from '@/hooks/usePagedList';
import { cn } from '@/lib/cn';
import { LIST_PAGE_SIZE, statusCountsOf } from '@/models/documentList';
import type { CreditMemo } from '@/models/creditMemo';
import { getCreditMemoPage } from '@/networks/sales/creditMemoNetwork';
import { formatMoney } from '@/utils/money';

type Tab = 'all' | 'open' | 'applied' | 'closed' | 'refunded' | 'void';

const TABS: [Tab, string][] = [
  ['all', 'All'],
  ['open', 'Open'],
  ['applied', 'Applied'],
  ['closed', 'Closed'],
  ['refunded', 'Refunded'],
  ['void', 'Void'],
];

const columnHelper = createColumnHelper<CreditMemo>();

export default function CreditMemoListPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Searched, filtered by tab and paged BY THE SERVER; "Load more" fetches the
  // next page. The counts are the server's, over every credit memo the search
  // matches — this page used to show and count only the first 50.
  const list = usePagedList(['credit-memos', 'list', { search, tab }], (page) =>
    getCreditMemoPage({
      search: search || undefined,
      status: tab === 'all' ? undefined : (tab as CreditMemo['status']),
      page,
      limit: LIST_PAGE_SIZE,
    }),
  );
  const { isLoading, isError, error } = list;
  const memos = list.rows;

  const counts = useMemo(() => statusCountsOf(list.summary, memos), [list.summary, memos]);

  const rows = useMemo(
    () => (tab === 'all' ? memos : memos.filter((m) => m.status === tab)),
    [memos, tab],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('creditMemoNumber', {
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
      columnHelper.accessor('date', { header: 'Date' }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (ctx) => <StatusBadge status={ctx.getValue()} />,
      }),
      columnHelper.accessor('total', {
        header: 'Total',
        meta: { align: 'right' },
        cell: (ctx) => formatMoney(ctx.getValue()),
      }),
      columnHelper.accessor('balance', {
        header: 'Available',
        meta: { align: 'right' },
        cell: (ctx) => (
          <span className={ctx.getValue() > 0 ? 'text-success' : 'text-text-tertiary'}>
            {formatMoney(ctx.getValue())}
          </span>
        ),
      }),
    ],
    [],
  ) as never;

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        title="Credit memos"
        description="Credits owed back to customers, and how much of each is still unused."
        actions={
          <Button asChild>
            <Link to="/credit-memos/new">
              <Plus className="size-4" />
              New credit memo
            </Link>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        onRowClick={(m) => navigate(`/credit-memos/${m.id}`)}
        empty={
          isError ? (
            <span className="text-body-sm text-danger">
              {error instanceof Error ? error.message : 'Could not load credit memos.'}
            </span>
          ) : (
            <span className="text-body-sm text-text-tertiary">
              {!search && tab === 'all'
                ? 'No credit memos yet.'
                : 'No credit memos match these filters.'}
            </span>
          )
        }
        toolbar={
          <div className="flex flex-col gap-sm border-b border-border-light p-md">
            <SearchInput
              value={searchInput}
              onValueChange={setSearchInput}
              // The server matches the number and the customer — not the
              // reason. Saying so beats a confusing no-match.
              placeholder="Search by credit memo number or customer…"
              aria-label="Search credit memos"
              tone="background"
            />

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

      <LoadMore
        shown={memos.length}
        total={list.total}
        hasMore={list.hasNextPage}
        loading={list.isFetchingNextPage}
        onMore={list.fetchNextPage}
      />
    </div>
  );
}
