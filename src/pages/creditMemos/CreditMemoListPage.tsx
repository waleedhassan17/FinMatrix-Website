import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import type { CreditMemo } from '@/models/creditMemo';
import { getCreditMemos } from '@/networks/sales/creditMemoNetwork';
import { formatMoney } from '@/utils/money';

const PAGE_SIZE = 50;

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

  const { data: memos = [], isLoading, isError, error } = useQuery({
    queryKey: ['credit-memos', 'list', { search }],
    queryFn: () => getCreditMemos({ search: search || undefined, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const counts = useMemo(() => {
    const c = { all: memos.length } as Record<Tab, number>;
    for (const t of TABS) if (t[0] !== 'all') c[t[0]] = 0;
    for (const m of memos) if (m.status in c) c[m.status as Tab] += 1;
    return c;
  }, [memos]);

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
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <h1 className="text-h2 text-text-primary">Credit memos</h1>
          <p className="text-body-sm text-text-secondary">
            Credits owed back to customers, and how much of each is still unused.
          </p>
        </div>
        <Button asChild>
          <Link to="/credit-memos/new">
            <Plus className="size-4" />
            New credit memo
          </Link>
        </Button>
      </div>

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
              {memos.length === 0
                ? 'No credit memos yet.'
                : 'No credit memos match these filters.'}
            </span>
          )
        }
        toolbar={
          <div className="flex flex-col gap-sm border-b border-border-light p-md">
            <div className="relative">
              <Search className="pointer-events-none absolute left-sm top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                // The server searches creditMemoNumber only — not the reason,
                // not the customer name. Saying so beats a confusing no-match.
                placeholder="Search by credit memo number…"
                className="h-10 w-full rounded-md border border-border bg-background pl-[34px] pr-sm text-body-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
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

      {memos.length >= PAGE_SIZE && (
        <p className="text-center text-caption text-text-tertiary">
          Showing the first {PAGE_SIZE}. Narrow the search to see more — this
          endpoint does not return a page count.
        </p>
      )}
    </div>
  );
}
