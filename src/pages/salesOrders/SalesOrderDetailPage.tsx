import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  FileText,
  PackageCheck,
  Pencil,
  Trash2,
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
import { FulfilDialog } from '@/features/salesOrders/FulfilDialog';
import { useAdminOnly, useIsOwner } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { addDays, isoToday } from '@/models/document';
import {
  areLinesEditable,
  fulfilmentPercent,
  isFulfillable,
  isFullyFulfilled,
  isInvoiceable,
  isSalesOrderEditable,
  type FulfilLinePayload,
  type SalesOrderLine,
} from '@/models/salesOrder';
import {
  cancelSalesOrder,
  convertSalesOrderToInvoice,
  deleteSalesOrder,
  fulfillSalesOrder,
  getSalesOrderById,
} from '@/networks/sales/salesOrderNetwork';

export default function SalesOrderDetailPage() {
  const { salesOrderId = '' } = useParams<{ salesOrderId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isOwner = useIsOwner();
  const canDelete = useAdminOnly('salesOrder.delete');

  const [fulfilOpen, setFulfilOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dueDate, setDueDate] = useState(addDays(isoToday(), 30));

  const { data: order, isLoading, isError, error } = useQuery({
    queryKey: ['sales-orders', salesOrderId],
    queryFn: () => getSalesOrderById(salesOrderId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const fulfil = useMutation({
    mutationFn: (lines: FulfilLinePayload[]) =>
      fulfillSalesOrder(salesOrderId, lines),
    onSuccess: (updated) => {
      setFulfilOpen(false);
      invalidate();
      toast.success('Shipment recorded', {
        description: `The order is now ${updated.status}.`,
      });
    },
    onError: (e: Error) =>
      toast.error('Could not record shipment', { description: e.message }),
  });

  const toInvoice = useMutation({
    mutationFn: () => convertSalesOrderToInvoice(salesOrderId, dueDate || undefined),
    onSuccess: ({ invoiceId }) => {
      setConvertOpen(false);
      invalidate();
      toast.success('Invoice created', {
        description: 'The sale is posted and stock has been decremented.',
      });
      if (invoiceId) navigate(`/invoices/${invoiceId}`);
    },
    onError: (e: Error) =>
      toast.error('Could not create invoice', { description: e.message }),
  });

  const doCancel = useMutation({
    mutationFn: () => cancelSalesOrder(salesOrderId),
    onSuccess: () => {
      setCancelOpen(false);
      invalidate();
      toast.success('Sales order cancelled');
    },
    onError: (e: Error) =>
      toast.error('Could not cancel order', { description: e.message }),
  });

  const doDelete = useMutation({
    mutationFn: () => deleteSalesOrder(salesOrderId),
    onSuccess: () => {
      invalidate();
      toast.success('Sales order deleted');
      navigate('/sales-orders', { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not delete order', { description: e.message }),
  });

  if (isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading sales order…</p>;
  }

  if (isError || !order) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Sales order not found</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          {error instanceof Error ? error.message : 'It may have been deleted.'}
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/sales-orders">Back to sales orders</Link>
        </Button>
      </Card>
    );
  }

  const busy = fulfil.isPending || toInvoice.isPending || doCancel.isPending;
  const fullyFulfilled = isFullyFulfilled(order);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/sales-orders">
          <ArrowLeft className="size-4" />
          Sales orders
        </Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-md">
        <div className="flex items-center gap-sm">
          <h1 className="text-h2 text-text-primary">{order.orderNumber || 'Order'}</h1>
          <StatusBadge status={order.status} />
        </div>

        <div className="flex flex-wrap gap-xs">
          {isSalesOrderEditable(order.status) && (
            <Button asChild variant="secondary">
              <Link to={`/sales-orders/${order.id}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
          )}

          {isFulfillable(order.status) && (
            <Button variant="secondary" onClick={() => setFulfilOpen(true)} disabled={busy}>
              <PackageCheck className="size-4" />
              Record shipment
            </Button>
          )}

          {/* Admin only, same reasoning as the estimate route: this posts a
              real invoice with no maker-checker branch, so a staff caller
              would recognise revenue without approval. */}
          {isInvoiceable(order.status) && isOwner && (
            <Button onClick={() => setConvertOpen(true)} disabled={busy}>
              <FileText className="size-4" />
              Convert to invoice
            </Button>
          )}

          {isSalesOrderEditable(order.status) && (
            <Button variant="danger" onClick={() => setCancelOpen(true)} disabled={busy}>
              <Ban className="size-4" />
              Cancel order
            </Button>
          )}

          {canDelete && order.status !== 'invoiced' && (
            <Button variant="text" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {!isOwner && isInvoiceable(order.status) && (
        <p className="rounded-md bg-primary-tint p-md text-body-sm text-text-primary">
          Invoicing an order posts the sale and moves stock, so it is the
          owner&rsquo;s action. Record shipments here and ask them to invoice.
        </p>
      )}

      {!areLinesEditable(order.status) && isSalesOrderEditable(order.status) && (
        <p className="rounded-md bg-warning-lighter p-md text-body-sm text-text-primary">
          This order has started shipping, so its lines are locked — editing them
          would reset the fulfilment record. Dates and notes can still be changed.
        </p>
      )}

      {order.invoiceId && (
        <Link
          to={`/invoices/${order.invoiceId}`}
          className="flex items-center gap-sm rounded-md border border-border bg-surface px-lg py-md hover:bg-surface-hover"
        >
          <ArrowRight className="size-4 text-primary" />
          <span className="flex-1 text-body-sm text-text-primary">
            Invoiced — open the invoice
          </span>
        </Link>
      )}

      <DocumentView
        title="Sales order"
        counterpartyLabel="Order for"
        counterpartyName={order.customerName}
        meta={[
          ['Order #', order.orderNumber || '—'],
          ['Ordered', order.orderDate || '—'],
          ['Expected', order.expectedDate?.slice(0, 10) ?? '—'],
        ]}
        lines={order.lines}
        lineExtraHeader="Fulfilled"
        lineExtra={(line) => <FulfilmentCell line={line as SalesOrderLine} />}
        subtotal={order.subtotal}
        discountType={order.discountType}
        discountValue={order.discountValue}
        discountAmount={order.discountAmount}
        taxAmount={order.taxAmount}
        total={order.total}
        notes={order.notes}
      />

      <FulfilDialog
        open={fulfilOpen}
        onOpenChange={setFulfilOpen}
        lines={order.lines}
        busy={fulfil.isPending}
        onSubmit={(payload) => fulfil.mutate(payload)}
      />

      <ConfirmDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        title="Convert to invoice?"
        description={
          <>
            This creates a <strong>posted</strong> invoice straight away: the sale
            is recognised, the customer&rsquo;s balance goes up and stock is
            decremented.
            {!fullyFulfilled && (
              <>
                {' '}
                This order is <strong>not fully shipped</strong>, and converting
                still bills and decrements the <strong>full ordered quantity</strong> —
                there is no partial invoicing.
              </>
            )}
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
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this order?"
        description="This cannot be undone — there is no way to reopen a cancelled order. No stock is released, because a sales order never reserves any."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        destructive
        busy={doCancel.isPending}
        onConfirm={() => doCancel.mutate()}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this sales order?"
        description="The order and its lines are removed permanently, including any fulfilment record."
        confirmLabel="Delete permanently"
        destructive
        busy={doDelete.isPending}
        onConfirm={() => doDelete.mutate()}
      />
    </div>
  );
}

function FulfilmentCell({ line }: { line: SalesOrderLine }) {
  const pct = fulfilmentPercent(line);
  return (
    <div className="min-w-24">
      <div className="text-caption text-text-secondary tabular">
        {line.quantityFulfilled}/{line.quantity}
      </div>
      <div className="mt-xxs h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={cn(
            'h-full rounded-full',
            pct >= 100 ? 'bg-success' : 'bg-warning',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
