import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, TablePager } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import { PAYMENT_TERMS_LABELS } from '@/models/customer';
import { vendorBalanceTone, type Vendor } from '@/models/vendor';
import { getVendors } from '@/networks/purchases/vendorNetwork';
import { formatMoney } from '@/utils/money';

type StatusFilter = 'all' | 'active' | 'inactive';
type SortField = 'name' | 'balance' | 'recent';

const PAGE_SIZE = 50;

const columnHelper = createColumnHelper<Vendor>();

export default function VendorListPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortField>('name');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // `GET /vendors` nests one level deeper than the flat lists, so the envelope
  // leaves pagination intact and this can be a real server-side pager.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['vendors', 'list', { search, page }],
    queryFn: () =>
      getVendors({ search: search || undefined, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => {
    let list = data?.vendors ?? [];
    if (status !== 'all') {
      list = list.filter((v) => (status === 'active' ? v.isActive : !v.isActive));
    }
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'balance') return b.balance - a.balance;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [data?.vendors, status, sort]);

  // There is no server-side summary on this route (customers have one, vendors
  // do not), so this is explicitly the loaded page, not a company-wide total.
  const pageOwed = useMemo(
    () => rows.reduce((sum, v) => sum + Math.max(v.balance, 0), 0),
    [rows],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Vendor',
        cell: (ctx) => (
          <div className="min-w-0">
            <div className="truncate text-label-lg text-text-primary">
              {ctx.getValue()}
            </div>
            {ctx.row.original.taxId && (
              <div className="truncate text-caption text-text-secondary">
                NTN {ctx.row.original.taxId}
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
            <div className="truncate">
              {ctx.row.original.contactPerson || ctx.row.original.email || '—'}
            </div>
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
      // A vendor balance is a liability. Anything above zero reads danger —
      // the inverse of the customer table, where a balance is money owed to us.
      columnHelper.accessor('balance', {
        header: 'You owe',
        meta: { align: 'right' },
        cell: (ctx) => (
          <span
            className={cn(
              'tabular',
              vendorBalanceTone(ctx.getValue()) === 'danger'
                ? 'text-danger'
                : 'text-success',
            )}
          >
            {formatMoney(ctx.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('isActive', {
        header: 'Status',
        cell: (ctx) => <StatusBadge status={ctx.getValue() ? 'active' : 'inactive'} />,
      }),
    ],
    [],
  ) as never;

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        title="Vendors"
        description="Who you buy from."
        actions={
          <Button asChild>
            <Link to="/vendors/new">
              <Plus className="size-4" />
              New vendor
            </Link>
          </Button>
        }
      />

      <Card className="p-lg">
        <p className="text-caption text-text-secondary">
          Owed on this page{data?.pagination.total ? ` of ${data.pagination.total}` : ''}
        </p>
        <p className="mt-xxs text-h3 text-text-primary tabular">
          {formatMoney(pageOwed)}
        </p>
      </Card>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        onRowClick={(v) => navigate(`/vendors/${v.id}`)}
        empty={
          isError ? (
            <span className="text-body-sm text-danger">
              {error instanceof Error ? error.message : 'Could not load vendors.'}
            </span>
          ) : search ? (
            <span className="text-body-sm text-text-tertiary">
              No results for &ldquo;{search}&rdquo;.
            </span>
          ) : (
            <span className="text-body-sm text-text-tertiary">
              No vendors yet. Add one before raising a bill or purchase order.
            </span>
          )
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-sm border-b border-border-light p-md">
            <SearchInput
              value={searchInput}
              onValueChange={setSearchInput}
              placeholder="Search by company, contact, email or phone…"
              aria-label="Search vendors"
              tone="background"
              containerClassName="min-w-56 flex-1"
            />

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
                ['balance', 'Owed'],
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
