import { createColumnHelper } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { DateField } from '@/components/ui/Field';
import { LoadMore } from '@/components/ui/LoadMore';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePagedList } from '@/hooks/usePagedList';
import { cn } from '@/lib/cn';
import { LIST_PAGE_SIZE, statusCountsOf } from '@/models/documentList';
import { isExpired, type Estimate } from '@/models/estimate';
import { getEstimatePage } from '@/networks/sales/estimateNetwork';
import { formatMoney } from '@/utils/money';

type Tab = 'all' | 'draft' | 'sent' | 'accepted' | 'declined' | 'converted';

const TABS: [Tab, string][] = [
  ['all', 'All'],
  ['draft', 'Draft'],
  ['sent', 'Sent'],
  ['accepted', 'Accepted'],
  ['declined', 'Declined'],
  ['converted', 'Converted'],
];

const columnHelper = createColumnHelper<Estimate>();

export default function EstimateListPage() {
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

  // Searched, filtered by tab and paged BY THE SERVER; "Load more" fetches the
  // next page. The counts are the server's, over every estimate the search
  // matches — this page used to show and count only the first 50.
  const list = usePagedList(['estimates', 'list', { search, fromDate, toDate, tab }], (page) =>
    getEstimatePage({
      search: search || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      status: tab === 'all' ? undefined : (tab as Estimate['status']),
      page,
      limit: LIST_PAGE_SIZE,
    }),
  );
  const { isLoading, isError, error } = list;
  const estimates = list.rows;
  const counts = useMemo(() => statusCountsOf(list.summary, estimates), [list.summary, estimates]);

  // Already filtered by the server; applied here too only so a tab switch
  // shows at once, before its answer lands.
  const rows = useMemo(
    () => (tab === 'all' ? estimates : estimates.filter((e) => e.status === tab)),
    [estimates, tab],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('estimateNumber', {
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
      columnHelper.accessor('estimateDate', { header: 'Date' }),
      columnHelper.accessor('expiryDate', {
        header: 'Valid until',
        cell: (ctx) => {
          const value = ctx.getValue();
          if (!value) return <span className="text-text-tertiary">—</span>;
          // The server never sets the `expired` status, so past-expiry is
          // derived here and shown as a hint rather than a status change.
          const expired = isExpired(ctx.row.original);
          return (
            <span className={expired ? 'text-warning' : undefined}>
              {value.slice(0, 10)}
              {expired && ' · expired'}
            </span>
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
      <PageHeader
        title="Estimates"
        description="Quotes and proposals. Nothing posts until one is converted."
        actions={
          <Button asChild>
            <Link to="/estimates/new">
              <Plus className="size-4" />
              New estimate
            </Link>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        onRowClick={(e) => navigate(`/estimates/${e.id}`)}
        empty={
          isError ? (
            <span className="text-body-sm text-danger">
              {error instanceof Error ? error.message : 'Could not load estimates.'}
            </span>
          ) : (
            <span className="text-body-sm text-text-tertiary">
              {!search && !fromDate && !toDate && tab === 'all'
                ? 'No estimates yet. Create a quote to get started.'
                : 'No estimates match these filters.'}
            </span>
          )
        }
        toolbar={
          <div className="flex flex-col gap-sm border-b border-border-light p-md">
            <div className="flex flex-wrap items-center gap-sm">
              <SearchInput
                value={searchInput}
                onValueChange={setSearchInput}
                placeholder="Search by estimate number, customer or notes…"
                aria-label="Search estimates"
                tone="background"
                containerClassName="min-w-56 flex-1"
              />
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

      <LoadMore
        shown={estimates.length}
        total={list.total}
        hasMore={list.hasNextPage}
        loading={list.isFetchingNextPage}
        onMore={list.fetchNextPage}
      />
    </div>
  );
}
