import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Pencil,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DateField } from '@/components/ui/Field';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DocumentView } from '@/features/documents/DocumentView';
import { useAdminOnly, useFeature, useIsOwner } from '@/hooks/useCapability';
import { addDays, isoToday } from '@/models/document';
import {
  isConvertible,
  isEstimateEditable,
  isExpired,
  type EstimateSettableStatus,
} from '@/models/estimate';
import {
  convertEstimateToInvoice,
  convertEstimateToSalesOrder,
  deleteEstimate,
  getEstimateById,
  setEstimateStatus,
} from '@/networks/sales/estimateNetwork';

export default function EstimateDetailPage() {
  const { estimateId = '' } = useParams<{ estimateId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isOwner = useIsOwner();
  const canDelete = useAdminOnly('estimate.delete');
  const salesOrdersEnabled = useFeature('salesOrders');

  const [convertOpen, setConvertOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dueDate, setDueDate] = useState(addDays(isoToday(), 30));

  const { data: estimate, isLoading, isError, error } = useQuery({
    queryKey: ['estimates', estimateId],
    queryFn: () => getEstimateById(estimateId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['estimates'] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const status = useMutation({
    mutationFn: (next: EstimateSettableStatus) =>
      setEstimateStatus(estimateId, next),
    onSuccess: (updated) => {
      invalidate();
      toast.success(`Estimate marked ${updated.status}`);
    },
    onError: (e: Error) =>
      toast.error('Could not update status', { description: e.message }),
  });

  const toInvoice = useMutation({
    mutationFn: () => convertEstimateToInvoice(estimateId, dueDate || undefined),
    onSuccess: ({ invoiceId }) => {
      setConvertOpen(false);
      invalidate();
      toast.success('Invoice created', {
        description: 'The sale is posted and stock has been decremented.',
      });
      if (invoiceId) navigate(`/invoices/${invoiceId}`);
    },
    // INSUFFICIENT_STOCK (422) names the item and the shortfall — the one
    // thing that legitimately refuses a conversion.
    onError: (e: Error) =>
      toast.error('Could not convert to invoice', { description: e.message }),
  });

  const toSalesOrder = useMutation({
    mutationFn: () => convertEstimateToSalesOrder(estimateId),
    onSuccess: ({ salesOrderId }) => {
      invalidate();
      toast.success('Sales order created', {
        description: 'Nothing has been billed or posted.',
      });
      if (salesOrderId) navigate(`/sales-orders/${salesOrderId}`);
    },
    onError: (e: Error) =>
      toast.error('Could not convert to sales order', { description: e.message }),
  });

  const doDelete = useMutation({
    mutationFn: () => deleteEstimate(estimateId),
    onSuccess: () => {
      invalidate();
      toast.success('Estimate deleted');
      navigate('/estimates', { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not delete estimate', { description: e.message }),
  });

  if (isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading estimate…</p>;
  }

  if (isError || !estimate) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Estimate not found</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          {error instanceof Error ? error.message : 'It may have been deleted.'}
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/estimates">Back to estimates</Link>
        </Button>
      </Card>
    );
  }

  const editable = isEstimateEditable(estimate.status);
  const convertible = isConvertible(estimate.status);
  const expired = isExpired(estimate);
  const busy = status.isPending || toInvoice.isPending || toSalesOrder.isPending;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/estimates">
          <ArrowLeft className="size-4" />
          Estimates
        </Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-md">
        <div className="flex items-center gap-sm">
          <h1 className="text-h2 text-text-primary">
            {estimate.estimateNumber || 'Estimate'}
          </h1>
          <StatusBadge status={estimate.status} />
          {expired && <StatusBadge status="expired" />}
        </div>

        <div className="flex flex-wrap gap-xs">
          {editable && (
            <Button asChild variant="secondary">
              <Link to={`/estimates/${estimate.id}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
          )}

          {estimate.status === 'draft' && (
            <Button onClick={() => status.mutate('sent')} disabled={busy}>
              <Send className="size-4" />
              Mark sent
            </Button>
          )}

          {estimate.status === 'sent' && (
            <>
              <Button variant="secondary" onClick={() => status.mutate('declined')} disabled={busy}>
                <X className="size-4" />
                Declined
              </Button>
              <Button onClick={() => status.mutate('accepted')} disabled={busy}>
                <Check className="size-4" />
                Accepted
              </Button>
            </>
          )}

          {estimate.status === 'declined' && (
            <Button variant="secondary" onClick={() => status.mutate('accepted')} disabled={busy}>
              <Check className="size-4" />
              Mark accepted
            </Button>
          )}

          {convertible && salesOrdersEnabled && (
            <Button
              variant="secondary"
              onClick={() => toSalesOrder.mutate()}
              disabled={busy}
            >
              <ArrowRight className="size-4" />
              To sales order
            </Button>
          )}

          {/* Admin only, deliberately.

              This route has NO maker-checker branch: it calls
              InvoicesService.create with status 'sent', so a staff caller would
              get a real posted invoice — revenue recognised, COGS posted, stock
              decremented — with no approval. That is a complete bypass of
              invoice.create = 'request'. Hiding it here closes the hole in our
              UI; the API still permits it, which is a backend follow-up. */}
          {convertible && isOwner && (
            <Button onClick={() => setConvertOpen(true)} disabled={busy}>
              <FileText className="size-4" />
              Convert to invoice
            </Button>
          )}

          {canDelete && editable && (
            <Button variant="text" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {!isOwner && convertible && (
        <p className="rounded-md bg-primary-tint p-md text-body-sm text-text-primary">
          Invoicing an estimate posts the sale and moves stock, so it is the
          owner&rsquo;s action. Ask them to convert this one when the customer
          accepts.
        </p>
      )}

      {estimate.convertedToId && (
        <Link
          to={
            estimate.convertedToType === 'invoice'
              ? `/invoices/${estimate.convertedToId}`
              : `/sales-orders/${estimate.convertedToId}`
          }
          className="flex items-center gap-sm rounded-md border border-border bg-surface px-lg py-md hover:bg-surface-hover"
        >
          <ArrowRight className="size-4 text-primary" />
          <span className="flex-1 text-body-sm text-text-primary">
            Converted to{' '}
            {estimate.convertedToType === 'invoice' ? 'an invoice' : 'a sales order'} —
            open it
          </span>
        </Link>
      )}

      <DocumentView
        title="Estimate"
        counterpartyLabel="Quote for"
        counterpartyName={estimate.customerName}
        meta={[
          ['Estimate #', estimate.estimateNumber || '—'],
          ['Date', estimate.estimateDate || '—'],
          ['Valid until', estimate.expiryDate?.slice(0, 10) ?? '—'],
        ]}
        lines={estimate.lines}
        subtotal={estimate.subtotal}
        discountType={estimate.discountType}
        discountValue={estimate.discountValue}
        discountAmount={estimate.discountAmount}
        taxAmount={estimate.taxAmount}
        total={estimate.total}
        notes={estimate.notes}
      />

      <ConfirmDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        title="Convert to invoice?"
        description={
          <>
            This creates a <strong>posted</strong> invoice straight away: the sale
            is recognised in the ledger, the customer&rsquo;s balance goes up and
            stock is decremented. It cannot be undone except by voiding the
            invoice. The invoice is dated <strong>today</strong>, not the estimate
            date.
          </>
        }
        confirmLabel="Convert and post"
        busy={toInvoice.isPending}
        onConfirm={() => toInvoice.mutate()}
      >
        <DateField
          label="Payment due"
          value={dueDate}
          onChange={setDueDate}
          min={isoToday()}
          hint="Defaults to 30 days from today."
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this estimate?"
        description="The quote and its lines are removed permanently."
        confirmLabel="Delete permanently"
        destructive
        busy={doDelete.isPending}
        onConfirm={() => doDelete.mutate()}
      />
    </div>
  );
}
