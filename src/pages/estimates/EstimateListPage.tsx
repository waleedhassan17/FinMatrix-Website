import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { DateField } from '@/components/ui/Field';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import { isExpired, type Estimate } from '@/models/estimate';
import { getEstimates } from '@/networks/sales/estimateNetwork';
import { formatMoney } from '@/utils/money';

const PAGE_SIZE = 50;

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

  const { data: estimates = [], isLoading, isError, error } = useQuery({
    queryKey: ['estimates', 'list', { search, fromDate, toDate }],
    queryFn: () =>
      getEstimates({
        search: search || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  // Counts over loaded rows: GET /estimates returns a bare array, its summary
  // and pagination discarded by the response envelope.
  const counts = useMemo(() => {
    const c = { all: estimates.length } as Record<Tab, number>;
    for (const t of TABS) if (t[0] !== 'all') c[t[0]] = 0;
    for (const e of estimates) if (e.status in c) c[e.status as Tab] += 1;
    return c;
  }, [estimates]);

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
              {estimates.length === 0
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

      {estimates.length >= PAGE_SIZE && (
        <p className="text-center text-caption text-text-tertiary">
          Showing the first {PAGE_SIZE}. Narrow the search or date range to see more —
          this endpoint does not return a page count.
        </p>
      )}
    </div>
  );
}
