import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Clock, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { DateField } from '@/components/ui/Field';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useCapability } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { LIST_PAGE_SIZE, statusCountsOf } from '@/models/documentList';
import type { Invoice } from '@/models/invoice';
import { fetchApprovals } from '@/networks/approvals/approvalsNetwork';
import { getInvoicePage } from '@/networks/sales/invoiceNetwork';
import { formatMoney } from '@/utils/money';

type Tab = 'all' | 'draft' | 'sent' | 'overdue' | 'paid';

const TABS: [Tab, string][] = [
  ['all', 'All'],
  ['draft', 'Draft'],
  ['sent', 'Sent'],
  ['overdue', 'Overdue'],
  ['paid', 'Paid'],
];

const columnHelper = createColumnHelper<Invoice>();

export default function InvoiceListPage() {
  const navigate = useNavigate();
  const cap = useCapability('invoice.create');

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
  // next page. The tab goes to the server because the counts below are the
  // server's — over every invoice the search matches — so a tab has to show
  // all of its invoices, not just those among the rows already loaded.
  const list = useInfiniteQuery({
    queryKey: ['invoices', 'list', { search, fromDate, toDate, tab }],
    queryFn: ({ pageParam }) =>
      getInvoicePage({
        search: search || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        status: tab === 'all' ? undefined : tab,
        page: pageParam,
        limit: LIST_PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
  const { isLoading, isError, error } = list;
  const invoices = useMemo(() => list.data?.pages.flatMap((p) => p.rows) ?? [], [list.data]);
  const serverSummary = list.data?.pages[0]?.summary ?? null;
  const matching = list.data?.pages[0]?.total ?? invoices.length;

  // Staff see their own submitted requests above the table — they are not
  // invoices yet and would otherwise be invisible until an owner acted.
  const { data: pending = [] } = useQuery({
    queryKey: ['approvals', 'mine', 'invoice'],
    queryFn: () => fetchApprovals({ status: 'pending', type: 'invoice' }),
    enabled: cap.needsApproval,
  });

  // The server's counts and totals — over every invoice the search matches —
  // or, from an older server, over the rows loaded.
  const counts = useMemo(() => statusCountsOf(serverSummary, invoices), [serverSummary, invoices]);

  const summary = useMemo(() => {
    if (serverSummary) return { outstanding: serverSummary.outstanding, overdue: serverSummary.overdue };
    let outstanding = 0;
    let overdue = 0;
    for (const inv of invoices) {
      if (inv.status === 'sent' || inv.status === 'overdue' || inv.status === 'partial') {
        outstanding += inv.balance;
      }
      if (inv.status === 'overdue') overdue += inv.balance;
    }
    return { outstanding, overdue };
  }, [serverSummary, invoices]);

  // Already filtered by the server; applied here too only so a tab switch
  // shows at once, before its answer lands.
  const rows = useMemo(
    () => (tab === 'all' ? invoices : invoices.filter((i) => i.status === tab)),
    [invoices, tab],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('invoiceNumber', {
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
      columnHelper.accessor('issueDate', { header: 'Issued' }),
      columnHelper.accessor('dueDate', { header: 'Due' }),
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
        header: 'Balance',
        meta: { align: 'right' },
        cell: (ctx) => (
          <span className={ctx.getValue() > 0 ? 'text-danger' : 'text-success'}>
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
        title="Invoices"
        description="What customers owe you."
        actions={
          <Button asChild>
            <Link to="/invoices/new">
              <Plus className="size-4" />
              New invoice
            </Link>
          </Button>
        }
      />

      {pending.length > 0 && (
        <Card className="border border-warning-light bg-warning-lighter p-lg">
          <p className="text-overline text-warning">
            Waiting for approval · {pending.length}
          </p>
          <div className="mt-sm flex flex-col gap-xs">
            {pending.map((req) => (
              <Link
                key={req.id}
                to="/my-requests"
                className="flex items-center gap-sm rounded-md bg-surface px-md py-sm hover:bg-surface-hover"
              >
                <Clock className="size-4 shrink-0 text-warning" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm text-text-primary">
                    {req.summary}
                  </p>
                  <p className="text-caption text-text-tertiary">
                    Sent to the owner · not an invoice yet
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-md sm:grid-cols-2">
        <Card className="p-lg">
          <p className="text-caption text-text-secondary">
            {serverSummary ? 'Outstanding' : 'Outstanding (loaded)'}
          </p>
          <p className="mt-xxs text-h3 text-text-primary tabular">
            {formatMoney(summary.outstanding)}
          </p>
        </Card>
        <Card className="p-lg">
          <p className="text-caption text-text-secondary">
            {serverSummary ? 'Overdue' : 'Overdue (loaded)'}
          </p>
          <p className="mt-xxs text-h3 text-danger tabular">
            {formatMoney(summary.overdue)}
          </p>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        onRowClick={(inv) => navigate(`/invoices/${inv.id}`)}
        empty={
          isError ? (
            <span className="text-body-sm text-danger">
              {error instanceof Error ? error.message : 'Could not load invoices.'}
            </span>
          ) : (
            <span className="text-body-sm text-text-tertiary">
              {!search && !fromDate && !toDate && tab === 'all'
                ? 'No invoices yet. Create your first to bill a customer.'
                : 'No invoices match these filters.'}
            </span>
          )
        }
        toolbar={
          <div className="flex flex-col gap-sm border-b border-border-light p-md">
            <div className="flex flex-wrap items-center gap-sm">
              <SearchInput
                value={searchInput}
                onValueChange={setSearchInput}
                placeholder="Search by invoice number, customer or notes…"
                aria-label="Search invoices"
                tone="background"
                containerClassName="min-w-56 flex-1"
              />
              {/* The server applies the range only when BOTH dates are set. */}
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

      {list.hasNextPage && (
        <div className="flex flex-col items-center gap-xs">
          <p className="text-caption text-text-tertiary tabular">
            Showing {invoices.length} of {matching}
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
