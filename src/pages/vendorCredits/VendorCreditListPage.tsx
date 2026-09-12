import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import type { VendorCredit } from '@/models/vendorCredit';
import { getVendorCredits } from '@/networks/purchases/vendorCreditNetwork';
import { formatMoney } from '@/utils/money';

const PAGE_SIZE = 50;

/** No `draft` and no `refunded` on this side — see the model's header. */
type Tab = 'all' | 'open' | 'applied' | 'closed' | 'void';

const TABS: [Tab, string][] = [
  ['all', 'All'],
  ['open', 'Open'],
  ['applied', 'Applied'],
  ['closed', 'Closed'],
  ['void', 'Void'],
];

const columnHelper = createColumnHelper<VendorCredit>();

export default function VendorCreditListPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const {
    data: credits = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['vendor-credits', 'list', { search }],
    queryFn: () =>
      getVendorCredits({ search: search || undefined, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const counts = useMemo(() => {
    const c = { all: credits.length } as Record<Tab, number>;
    for (const t of TABS) if (t[0] !== 'all') c[t[0]] = 0;
    for (const credit of credits) if (credit.status in c) c[credit.status as Tab] += 1;
    return c;
  }, [credits]);

  const rows = useMemo(
    () => (tab === 'all' ? credits : credits.filter((c) => c.status === tab)),
    [credits, tab],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('vendorCreditNumber', {
        header: 'Number',
        cell: (ctx) => (
          <span className="text-label-lg text-text-primary">
            {ctx.getValue() || '—'}
          </span>
        ),
      }),
      columnHelper.accessor('vendorName', {
        header: 'Supplier',
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
          <h1 className="text-h2 text-text-primary">Vendor credits</h1>
          <p className="text-body-sm text-text-secondary">
            Money a supplier owes back for returns and overcharges, and how much
            of each is still unused.
          </p>
        </div>
        <Button asChild>
          <Link to="/vendor-credits/new">
            <Plus className="size-4" />
            New vendor credit
          </Link>
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        onRowClick={(c) => navigate(`/vendor-credits/${c.id}`)}
        empty={
          isError ? (
            <span className="text-body-sm text-danger">
              {error instanceof Error
                ? error.message
                : 'Could not load vendor credits.'}
            </span>
          ) : (
            <span className="text-body-sm text-text-tertiary">
              {credits.length === 0
                ? 'No vendor credits yet.'
                : 'No vendor credits match these filters.'}
            </span>
          )
        }
        toolbar={
          <div className="flex flex-col gap-sm border-b border-border-light p-md">
            <SearchInput
              value={searchInput}
              onValueChange={setSearchInput}
              placeholder="Search by vendor credit number or vendor…"
              aria-label="Search vendor credits"
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

      {credits.length >= PAGE_SIZE && (
        <p className="text-center text-caption text-text-tertiary">
          Showing the first {PAGE_SIZE}. Narrow the search to see more — this
          endpoint does not return a page count.
        </p>
      )}
    </div>
  );
}
