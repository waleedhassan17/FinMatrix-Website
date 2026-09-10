import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, TablePager } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import { PAYMENT_TERMS_LABELS, type Customer } from '@/models/customer';
import { getCustomers } from '@/networks/sales/customerNetwork';
import { colors } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';

type StatusFilter = 'all' | 'active' | 'inactive';
type SortField = 'name' | 'balance' | 'recent';

const PAGE_SIZE = 50;

/**
 * Balance colour by credit usage, ported from the app's getBalanceColor.
 * Nothing owed reads as settled; approaching the credit limit is the signal
 * worth surfacing in a list you scan rather than read.
 */
const balanceColor = (balance: number, creditLimit: number): string => {
  if (balance === 0) return colors.success;
  if (creditLimit > 0) {
    if (balance >= creditLimit * 0.8) return colors.danger;
    if (balance >= creditLimit * 0.5) return colors.warning;
  }
  return colors.textPrimary;
};

const columnHelper = createColumnHelper<Customer>();

export default function CustomerListPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortField>('name');
  const [page, setPage] = useState(1);

  // Debounced so a search runs on the pause, not on every keystroke — the app
  // uses 350ms and there is no reason for the two to differ.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['customers', 'list', { search, page }],
    queryFn: () =>
      getCustomers({ search: search || undefined, page, limit: PAGE_SIZE }),
    // Keeps the previous page on screen while the next one loads, instead of
    // flashing an empty table on every page change.
    placeholderData: keepPreviousData,
  });

  // Status and sort are client-side: the server offers `isActive` but no
  // `sortBy` at all (ordering is fixed createdAt DESC), and mixing a
  // server-filtered subset with a client sort reads as arbitrary. The app
  // does both client-side for the same reason.
  const rows = useMemo(() => {
    let list = data?.customers ?? [];
    if (status !== 'all') {
      list = list.filter((c) => (status === 'active' ? c.isActive : !c.isActive));
    }
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'balance') return b.balance - a.balance;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [data?.customers, status, sort]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Customer',
        cell: (ctx) => (
          <div className="min-w-0">
            <div className="truncate text-label-lg text-text-primary">
              {ctx.getValue()}
            </div>
            {ctx.row.original.company && (
              <div className="truncate text-caption text-text-secondary">
                {ctx.row.original.company}
              </div>
            )}
          </div>
        ),
      }),
      columnHelper.display({
        id: 'contact',
        header: 'Contact',
        cell: (ctx) => (
          <div className="min-w-0">
            <div className="truncate">{ctx.row.original.email || '—'}</div>
            {ctx.row.original.phone && (
              <div className="truncate text-caption text-text-secondary">
                {ctx.row.original.phone}
              </div>
            )}
          </div>
        ),
      }),
      columnHelper.accessor('paymentTerms', {
        header: 'Terms',
        cell: (ctx) => PAYMENT_TERMS_LABELS[ctx.getValue()] ?? ctx.getValue(),
      }),
      columnHelper.accessor('balance', {
        header: 'Balance',
        meta: { align: 'right' },
        cell: (ctx) => (
          <span
            style={{ color: balanceColor(ctx.getValue(), ctx.row.original.creditLimit) }}
          >
            {formatMoney(ctx.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('isActive', {
        header: 'Status',
        cell: (ctx) => (
          <StatusBadge status={ctx.getValue() ? 'active' : 'inactive'} />
        ),
      }),
    ],
    [],
  ) as never;

  const summary = data?.summary;

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <h1 className="text-h2 text-text-primary">Customers</h1>
          <p className="text-body-sm text-text-secondary">Who you sell to.</p>
        </div>
        <Button asChild>
          <Link to="/customers/new">
            <Plus className="size-4" />
            New customer
          </Link>
        </Button>
      </div>

      {/* Company-wide totals, straight from the server's summary — not a count
          of the loaded page. */}
      {summary && (
        <div className="grid gap-md sm:grid-cols-2">
          <Card className="p-lg">
            <p className="text-caption text-text-secondary">Total customers</p>
            <p className="mt-xxs text-h3 text-text-primary tabular">
              {summary.total}
            </p>
          </Card>
          <Card className="p-lg">
            <p className="text-caption text-text-secondary">Total owed</p>
            <p className="mt-xxs text-h3 text-text-primary tabular">
              {formatMoney(summary.outstandingBalance)}
            </p>
          </Card>
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        onRowClick={(c) => navigate(`/customers/${c.id}`)}
        empty={
          isError ? (
            <span className="text-body-sm text-danger">
              {error instanceof Error ? error.message : 'Could not load customers.'}
            </span>
          ) : search ? (
            <span className="text-body-sm text-text-tertiary">
              No results for &ldquo;{search}&rdquo;.
            </span>
          ) : (
            <span className="text-body-sm text-text-tertiary">
              No customers yet. Add your first to get started.
            </span>
          )
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-sm border-b border-border-light p-md">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-sm top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name, company or email…"
                className="h-10 w-full rounded-md border border-border bg-background pl-[34px] pr-sm text-body-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
              />
            </div>

            <FilterChips
              value={status}
              onChange={setStatus}
              options={[
                ['all', 'All'],
                ['active', 'Active'],
                ['inactive', 'Inactive'],
              ]}
            />
            <FilterChips
              value={sort}
              onChange={setSort}
              options={[
                ['name', 'A–Z'],
                ['balance', 'Balance'],
                ['recent', 'Recent'],
              ]}
            />
          </div>
        }
      />

      {data && (
        <TablePager
          page={data.pagination.page}
          totalPages={data.pagination.totalPages}
          total={data.pagination.total}
          onPage={setPage}
        />
      )}
    </div>
  );
}

function FilterChips<V extends string>({
  value,
  onChange,
  options,
}: {
  value: V;
  onChange: (v: V) => void;
  options: [V, string][];
}) {
  return (
    <div className="flex gap-xxs">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            'rounded-full px-sm py-xxs text-label-md transition-colors',
            v === value
              ? 'bg-primary text-text-inverse'
              : 'bg-neutral-100 text-text-secondary hover:bg-neutral-200',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
