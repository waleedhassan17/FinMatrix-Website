import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAdminOnly } from '@/hooks/useCapability';
import { paymentMethodLabel } from '@/models/payment';
import { deletePayment, getPaymentById } from '@/networks/sales/paymentNetwork';
import { formatMoney } from '@/utils/money';

export default function PaymentDetailPage() {
  const { paymentId = '' } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canDelete = useAdminOnly('payment.delete');

  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: payment, isLoading, isError, error } = useQuery({
    queryKey: ['payments', paymentId],
    queryFn: () => getPaymentById(paymentId),
  });

  const doDelete = useMutation({
    mutationFn: () => deletePayment(paymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Payment reversed', {
        description: 'The invoices it settled are open again.',
      });
      navigate('/payments', { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not reverse payment', { description: e.message }),
  });

  if (isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading payment…</p>;
  }

  if (isError || !payment) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Payment not found</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          {error instanceof Error ? error.message : 'It may have been reversed.'}
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/payments">Back to payments</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/payments">
          <ArrowLeft className="size-4" />
          Payments
        </Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <h1 className="text-h2 text-text-primary">
            {payment.reference || `Payment ${payment.id.slice(0, 8)}`}
          </h1>
          <p className="text-body-sm text-text-secondary">
            {payment.customerName} · {payment.paymentDate}
          </p>
        </div>

        {/* Admin only. DELETE /payments/:id is @Roles('admin') with no approval
            path, so staff cannot reverse a payment or even request it. */}
        {canDelete && (
          <Button variant="text" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" />
            Reverse payment
          </Button>
        )}
      </div>

      <Card className="p-xl">
        <div className="grid gap-lg sm:grid-cols-3">
          <Figure label="Amount received" value={formatMoney(payment.amount)} />
          <Figure label="Applied to invoices" value={formatMoney(payment.allocated)} />
          <Figure
            label="Held as credit"
            value={formatMoney(payment.unapplied)}
            tone={payment.unapplied > 0 ? 'warning' : undefined}
          />
        </div>

        <div className="mt-xl border-t border-border-light pt-md">
          <Row label="Method" value={paymentMethodLabel(payment.paymentMethod)} />
          <Row label="Reference" value={payment.reference || '—'} />
          <Row label="Date" value={payment.paymentDate || '—'} />
        </div>

        {payment.memo && (
          <div className="mt-lg border-t border-border-light pt-md">
            <SectionHeader title="Notes" />
            <p className="mt-sm whitespace-pre-line text-body-sm text-text-secondary">
              {payment.memo}
            </p>
          </div>
        )}
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Applied to" />
        {payment.applications.length === 0 ? (
          <p className="mt-md text-body-sm text-text-tertiary">
            Nothing was applied — the whole amount is held as a customer credit.
          </p>
        ) : (
          <div className="mt-md divide-y divide-border-light">
            {payment.applications.map((a) => (
              <Link
                key={a.invoiceId}
                to={`/invoices/${a.invoiceId}`}
                className="flex items-center gap-md py-sm first:pt-0 last:pb-0 hover:bg-surface-hover"
              >
                <ArrowRight className="size-4 shrink-0 text-text-tertiary" />
                <span className="flex-1 text-label-lg text-text-primary">
                  {a.invoiceNumber || a.invoiceId.slice(0, 8)}
                </span>
                <span className="text-label-lg text-text-primary tabular">
                  {formatMoney(a.amountApplied)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Reverse this payment?"
        description="Every invoice it settled reopens, the customer's balance is restored and a reversing journal entry is posted. This cannot be undone, and it is refused if the payment sits inside a completed bank reconciliation."
        confirmLabel="Reverse payment"
        destructive
        busy={doDelete.isPending}
        onConfirm={() => doDelete.mutate()}
      />
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warning';
}) {
  return (
    <div>
      <p className="text-caption text-text-secondary">{label}</p>
      <p
        className={`mt-xxs text-h3 tabular ${
          tone === 'warning' ? 'text-warning' : 'text-text-primary'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border-light py-xs last:border-0">
      <span className="text-body-sm text-text-secondary">{label}</span>
      <span className="text-body-sm text-text-primary">{value}</span>
    </div>
  );
}
