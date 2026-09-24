import { createColumnHelper } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PanelHeader, PanelLink } from '@/features/dashboard/PanelHeader';
import { useCapability } from '@/hooks/useCapability';
import { displayDate } from '@/models/dashboard';
import type { RecentTransaction } from '@/serializers/dashboardSerializer';
import { formatMoney } from '@/utils/money';

const columnHelper = createColumnHelper<RecentTransaction>();

const TYPE_LABEL: Record<RecentTransaction['type'], string> = {
  invoice: 'Invoice',
  bill: 'Bill',
  payment: 'Payment',
  other: 'Document',
};

/** The detail page a row opens, or null when this build has none for it. */
const rowTarget = (t: RecentTransaction): string | null => {
  if (!t.id) return null;
  if (t.type === 'invoice') return `/invoices/${t.id}`;
  if (t.type === 'bill') return `/bills/${t.id}`;
  return null;
};

/**
 * The latest invoices and bills, as a table.
 *
 * It was a list of number-over-date lines with a badge and an amount: no
 * column headings, nothing to say whether a row was money in or out, and no way
 * to open one. Now each row states its type and opens its own document — the
 * dashboard is where people go to find the thing they need to act on.
 */
export function RecentActivityCard({
  transactions,
  loading,
  failed,
  companyIsEmpty,
}: {
  transactions: RecentTransaction[];
  loading: boolean;
  failed: boolean;
  companyIsEmpty: boolean;
}) {
  const navigate = useNavigate();
  const canInvoice = useCapability('invoice.create').allowed;

  const columns = useMemo(
    () => [
      // Date and Type give way on a phone, where the table would otherwise
      // scroll the amount — the column that matters — out of view. The date
      // moves under the document number instead.
      columnHelper.accessor('date', {
        header: 'Date',
        meta: { className: 'hidden sm:table-cell' },
        cell: (c) => (
          <span className="whitespace-nowrap text-text-secondary">
            {displayDate(c.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor((t) => TYPE_LABEL[t.type], {
        id: 'type',
        header: 'Type',
        meta: { className: 'hidden sm:table-cell' },
      }),
      columnHelper.accessor('description', {
        header: 'Number',
        cell: (c) => (
          <>
            <span className="block whitespace-nowrap text-label-md text-text-primary">
              {c.getValue()}
            </span>
            <span className="block whitespace-nowrap text-caption text-text-tertiary sm:hidden">
              {TYPE_LABEL[c.row.original.type]} · {displayDate(c.row.original.date)}
            </span>
          </>
        ),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (c) => <StatusBadge status={c.getValue()} />,
      }),
      columnHelper.accessor('amount', {
        header: 'Amount',
        meta: { align: 'right' },
        cell: (c) => (
          <span className="whitespace-nowrap">{formatMoney(c.getValue())}</span>
        ),
      }),
    ],
    [],
    // DataTable takes `ColumnDef<T, unknown>`; the same cast every list page uses.
  ) as never;

  return (
    <DataTable
      columns={columns}
      data={transactions}
      isLoading={loading}
      onRowClick={(t) => {
        const to = rowTarget(t);
        if (to) navigate(to);
      }}
      toolbar={
        <PanelHeader
          title="Recent activity"
          description="Latest invoices and bills"
          action={
            <>
              <PanelLink to="/invoices">Invoices</PanelLink>
              <PanelLink to="/bills">Bills</PanelLink>
            </>
          }
        />
      }
      empty={
        failed ? (
          <p className="text-body-sm text-text-secondary">
            Recent activity is unavailable right now.
          </p>
        ) : companyIsEmpty ? (
          <div className="flex flex-col items-center gap-md">
            <p className="max-w-[28rem] text-body-sm text-text-secondary">
              No transactions yet. Add a customer and raise your first invoice to
              get started.
            </p>
            {canInvoice && (
              <Button asChild size="sm">
                <Link to="/invoices/new">
                  <Plus className="size-4" />
                  New invoice
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <p className="text-body-sm text-text-tertiary">Nothing recent.</p>
        )
      }
    />
  );
}

export default RecentActivityCard;
