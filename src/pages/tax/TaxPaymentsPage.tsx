import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, TablePager } from '@/components/ui/DataTable';
import { TaxTabs } from '@/features/tax/TaxTabs';
import { formatReportDate } from '@/models/reportPeriod';
import type { TaxPayment } from '@/models/tax';
import { deleteTaxPayment, getTaxPayments, getTaxRates } from '@/networks/tax/taxNetwork';
import { formatMoney } from '@/utils/money';

const PAGE_SIZE = 20;

type Row = TaxPayment & { rateName: string };

const columnHelper = createColumnHelper<Row>();

/** Remittances to the tax authority. Owner only. */
export default function TaxPaymentsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [reversing, setReversing] = useState<Row | null>(null);

  // One fetch, paged here — see taxNetwork: the server's paging totals are
  // stripped by the response envelope, so only a client-side pager can be exact.
  const payments = useQuery({
    queryKey: ['tax', 'payments'],
    queryFn: () => getTaxPayments(),
  });

  const rates = useQuery({
    queryKey: ['tax', 'rates', 'all'],
    queryFn: () => getTaxRates(),
  });

  const rows = useMemo<Row[]>(() => {
    const byId = new Map((rates.data ?? []).map((r) => [r.id, r]));
    return (payments.data?.rows ?? []).map((p) => ({
      ...p,
      rateName: byId.get(p.taxRateId)?.name ?? '—',
    }));
  }, [payments.data, rates.data]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  // A reversal can shrink the list under the current page; stay on a real one.
  const current = Math.min(page, totalPages);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const reverse = useMutation({
    mutationFn: (id: string) => deleteTaxPayment(id),
    onSuccess: () => {
      setReversing(null);
      for (const key of ['tax', 'accounts', 'reports', 'journal-entries', 'dashboard']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success('Payment reversed', {
        description: 'The liability is restored and the money returned to Cash.',
      });
    },
    onError: (e: Error) => toast.error('Could not reverse the payment', { description: e.message }),
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('paymentDate', {
        header: 'Paid on',
        cell: (c) => formatReportDate(c.getValue()),
      }),
      columnHelper.accessor('period', { header: 'Period' }),
      columnHelper.accessor('rateName', { header: 'Tax' }),
      columnHelper.accessor('reference', {
        header: 'Reference',
        cell: (c) => c.getValue() || '—',
      }),
      columnHelper.accessor('amount', {
        header: 'Amount',
        meta: { align: 'right' },
        cell: (c) => formatMoney(c.getValue()),
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        meta: { align: 'right' },
        cell: (c) => (
          <Button variant="text" size="sm" onClick={() => setReversing(c.row.original)}>
            <Undo2 className="size-4" />
            Reverse
          </Button>
        ),
      }),
    ],
    [],
  ) as never;

  return (
    <div className="flex flex-col gap-lg">
      <TaxTabs />
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h1 className="text-h2 text-text-primary">Tax payments</h1>
          <p className="text-body-sm text-text-secondary">
            Remittances to the tax authority. Each one debits Sales Tax Payable (2300)
            and credits Cash (1000).
          </p>
        </div>
        <Button asChild>
          <Link to="/tax/payments/new">
            <Plus className="size-4" />
            Record payment
          </Link>
        </Button>
      </div>

      {payments.error && (
        <p className="text-body-sm text-danger">{payments.error.message}</p>
      )}

      <div>
        <DataTable
          columns={columns}
          data={pageRows}
          isLoading={payments.isLoading}
          empty={
            <p className="p-lg text-center text-body-sm text-text-tertiary">
              No tax payments recorded yet.
            </p>
          }
        />
        <TablePager
          page={current}
          totalPages={totalPages}
          total={rows.length}
          onPage={setPage}
        />
        {payments.data?.truncated && (
          <p className="mt-sm text-caption text-text-tertiary">
            Showing the most recent {rows.length} payments.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={reversing !== null}
        onOpenChange={(o) => !o && setReversing(null)}
        title="Reverse this tax payment?"
        description={
          reversing
            ? `A reversing entry for ${formatMoney(reversing.amount)} is posted — Cash goes back up and the liability is restored. The original entry stays on file. This is refused if the payment has been reconciled against a bank statement.`
            : undefined
        }
        confirmLabel="Reverse payment"
        destructive
        busy={reverse.isPending}
        onConfirm={() => reversing && reverse.mutate(reversing.id)}
      />
    </div>
  );
}
