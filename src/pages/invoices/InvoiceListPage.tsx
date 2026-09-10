import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Clock, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { DateField } from '@/components/ui/Field';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useCapability } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import type { Invoice } from '@/models/invoice';
import { fetchApprovals } from '@/networks/approvals/approvalsNetwork';
import { getInvoices } from '@/networks/sales/invoiceNetwork';
import { formatMoney } from '@/utils/money';

const PAGE_SIZE = 50;

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

  const { data: invoices = [], isLoading, isError, error } = useQuery({
    queryKey: ['invoices', 'list', { search, fromDate, toDate }],
    queryFn: () =>
      getInvoices({
        search: search || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  // Staff see their own submitted requests above the table — they are not
  // invoices yet and would otherwise be invisible until an owner acted.
  const { data: pending = [] } = useQuery({
    queryKey: ['approvals', 'mine', 'invoice'],
    queryFn: () => fetchApprovals({ status: 'pending', type: 'invoice' }),
    enabled: cap.needsApproval,
  });

  // Counts and the summary bar are computed over LOADED rows, not from the
  // server: GET /invoices returns a bare array — its `summary` and
  // `pagination` are discarded by the response envelope before they reach us.
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: invoices.length, draft: 0, sent: 0, overdue: 0, paid: 0 };
    for (const inv of invoices) {
      if (inv.status in c) c[inv.status as Tab] += 1;
    }
    return c;
  }, [invoices]);

  const summary = useMemo(() => {
    let outstanding = 0;
    let overdue = 0;
    for (const inv of invoices) {
      if (inv.status === 'sent' || inv.status === 'overdue' || inv.status === 'partial') {
        outstanding += inv.balance;
      }
      if (inv.status === 'overdue') overdue += inv.balance;
    }
    return { outstanding, overdue };
  }, [invoices]);

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
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <h1 className="text-h2 text-text-primary">Invoices</h1>
          <p className="text-body-sm text-text-secondary">What customers owe you.</p>
        </div>
        <Button asChild>
          <Link to="/invoices/new">
            <Plus className="size-4" />
            New invoice
          </Link>
        </Button>
      </div>

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
          <p className="text-caption text-text-secondary">Outstanding (loaded)</p>
          <p className="mt-xxs text-h3 text-text-primary tabular">
            {formatMoney(summary.outstanding)}
          </p>
        </Card>
        <Card className="p-lg">
          <p className="text-caption text-text-secondary">Overdue (loaded)</p>
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
              {invoices.length === 0
                ? 'No invoices yet. Create your first to bill a customer.'
                : 'No invoices match these filters.'}
            </span>
          )
        }
        toolbar={
          <div className="flex flex-col gap-sm border-b border-border-light p-md">
            <div className="flex flex-wrap items-center gap-sm">
              <div className="relative min-w-56 flex-1">
                <Search className="pointer-events-none absolute left-sm top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by invoice number or notes…"
                  className="h-10 w-full rounded-md border border-border bg-background pl-[34px] pr-sm text-body-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
                />
              </div>
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
                    {counts[value]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        }
      />

      {invoices.length >= PAGE_SIZE && (
        <p className="text-center text-caption text-text-tertiary">
          Showing the first {PAGE_SIZE}. Narrow the search or date range to see more —
          this endpoint does not return a page count.
        </p>
      )}
    </div>
  );
}
