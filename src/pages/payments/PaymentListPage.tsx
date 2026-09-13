import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { DateField } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { PAYMENT_METHOD_OPTIONS, paymentMethodLabel, type ApiPaymentMethod, type Payment } from '@/models/payment';
import { getPayments } from '@/networks/sales/paymentNetwork';
import { formatMoney } from '@/utils/money';

const PAGE_SIZE = 50;

const columnHelper = createColumnHelper<Payment>();

export default function PaymentListPage() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<'' | ApiPaymentMethod>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data: payments = [], isLoading, isError, error } = useQuery({
    queryKey: ['payments', 'list', { method, fromDate, toDate }],
    queryFn: () =>
      getPayments({
        paymentMethod: method || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const totals = useMemo(() => {
    let received = 0;
    let unapplied = 0;
    for (const p of payments) {
      received += p.amount;
      unapplied += p.unapplied;
    }
    return { received, unapplied };
  }, [payments]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('paymentDate', { header: 'Date' }),
      columnHelper.accessor('customerName', {
        header: 'Customer',
        cell: (ctx) => ctx.getValue() || '—',
      }),
      columnHelper.accessor('reference', {
        header: 'Reference',
        cell: (ctx) => (
          // A payment has no number — the reference is free text and often
          // blank, so a short id is the fallback handle.
          <span className="text-body-sm text-text-primary">
            {ctx.getValue() || (
              <span className="text-text-tertiary">
                {ctx.row.original.id.slice(0, 8)}
              </span>
            )}
          </span>
        ),
      }),
      columnHelper.accessor('paymentMethod', {
        header: 'Method',
        cell: (ctx) => paymentMethodLabel(ctx.getValue()),
      }),
      columnHelper.accessor('amount', {
        header: 'Amount',
        meta: { align: 'right' },
        cell: (ctx) => formatMoney(ctx.getValue()),
      }),
      columnHelper.accessor('allocated', {
        header: 'Applied',
        meta: { align: 'right' },
        cell: (ctx) => formatMoney(ctx.getValue()),
      }),
      columnHelper.accessor('unapplied', {
        header: 'Unapplied',
        meta: { align: 'right' },
        cell: (ctx) => (
          <span className={ctx.getValue() > 0 ? 'text-warning' : 'text-text-tertiary'}>
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
        title="Payments received"
        description="Money customers have paid you, and where it was applied."
        actions={
          <Button asChild>
            <Link to="/payments/new">
              <Plus className="size-4" />
              Receive payment
            </Link>
          </Button>
        }
      />

      <div className="grid gap-md sm:grid-cols-2">
        <Card className="p-lg">
          <p className="text-caption text-text-secondary">Received (loaded)</p>
          <p className="mt-xxs text-h3 text-text-primary tabular">
            {formatMoney(totals.received)}
          </p>
        </Card>
        <Card className="p-lg">
          <p className="text-caption text-text-secondary">Held as credit (loaded)</p>
          <p className="mt-xxs text-h3 text-warning tabular">
            {formatMoney(totals.unapplied)}
          </p>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={payments}
        isLoading={isLoading}
        onRowClick={(p) => navigate(`/payments/${p.id}`)}
        empty={
          isError ? (
            <span className="text-body-sm text-danger">
              {error instanceof Error ? error.message : 'Could not load payments.'}
            </span>
          ) : (
            <span className="text-body-sm text-text-tertiary">
              No payments recorded yet.
            </span>
          )
        }
        toolbar={
          <div className="flex flex-wrap items-end gap-sm border-b border-border-light p-md">
            <Select
              label="Method"
              value={method}
              onChange={(v) => setMethod(v as ApiPaymentMethod)}
              options={[{ label: 'All methods', value: '' }, ...PAYMENT_METHOD_OPTIONS]}
              containerClassName="w-48"
            />
            {/* The server ignores a lone start date — it filters only when
                both bounds are set. */}
            <DateField
              label="From"
              value={fromDate}
              onChange={setFromDate}
              containerClassName="w-40"
            />
            <DateField
              label="To"
              value={toDate}
              onChange={setToDate}
              containerClassName="w-40"
              hint={
                fromDate && !toDate ? 'Set both dates to filter by range.' : undefined
              }
            />
          </div>
        }
      />

      {payments.length >= PAGE_SIZE && (
        <p className="text-center text-caption text-text-tertiary">
          Showing the first {PAGE_SIZE}. Narrow the filters to see more — this
          endpoint does not return a page count.
        </p>
      )}
    </div>
  );
}
