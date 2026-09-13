import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Ban,
  FileText,
  PackageCheck,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { DetailLayout, RailSection } from '@/components/layout/DetailLayout';
import { MoreActionsMenu, PageHeader } from '@/components/layout/PageHeader';
import { DetailPageSkeleton, PageMessage } from '@/components/layout/PageState';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DateField } from '@/components/ui/Field';
import { KeyValueList } from '@/components/ui/KeyValueList';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AmountSummary } from '@/features/documents/AmountSummary';
import { salesOrderDocument } from '@/features/documents/documentBuilders';
import { docDate } from '@/features/documents/documentModel';
import { DocumentPaper } from '@/features/documents/DocumentPaper';
import { documentPdfBlob } from '@/features/documents/documentPdf';
import { PartyCard } from '@/features/documents/PartyCard';
import { useDocumentCompany, useDocumentCustomer } from '@/features/documents/useDocumentContext';
import { FulfilDialog } from '@/features/salesOrders/FulfilDialog';
import { DocumentActions } from '@/features/share/DocumentActions';
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

  const { data: order, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sales-orders', salesOrderId],
    queryFn: () => getSalesOrderById(salesOrderId),
  });

  const company = useDocumentCompany();
  const customer = useDocumentCustomer(order?.customerId);
  const doc = useMemo(
    () => (order ? salesOrderDocument(order, company, customer) : null),
    [order, company, customer],
  );

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

  if (isLoading) return <DetailPageSkeleton />;

  if (isError || !order || !doc) {
    return (
      <PageMessage
        tone={isError ? 'error' : 'notFound'}
        title={isError ? 'This sales order could not be loaded' : 'Sales order not found'}
        description={error instanceof Error ? error.message : 'It may have been deleted.'}
        onRetry={isError ? () => refetch() : undefined}
        backTo="/sales-orders"
        backLabel="Back to sales orders"
      />
    );
  }

  const busy = fulfil.isPending || toInvoice.isPending || doCancel.isPending;
  const fullyFulfilled = isFullyFulfilled(order);
  const ordered = order.lines.reduce((sum, l) => sum + l.quantity, 0);
  const shipped = order.lines.reduce((sum, l) => sum + Math.min(l.quantityFulfilled, l.quantity), 0);

  return (
    <DetailLayout
      header={
        <PageHeader
          back={{ to: '/sales-orders', label: 'Sales orders' }}
          title={order.orderNumber || 'Sales order'}
          status={<StatusBadge status={order.status} />}
          meta={[
            <Link
              key="customer"
              to={`/customers/${order.customerId}`}
              className="text-label-md text-text-primary hover:text-primary hover:underline"
            >
              {doc.party?.name || 'Customer'}
            </Link>,
            order.orderDate ? `Ordered ${docDate(order.orderDate)}` : null,
            order.expectedDate ? `Expected ${docDate(order.expectedDate)}` : null,
          ]}
          actions={
            <>
              {isSalesOrderEditable(order.status) && (
                <Button asChild variant="secondary" size="sm">
                  <Link to={`/sales-orders/${order.id}/edit`}>
                    <Pencil className="size-4" />
                    Edit
                  </Link>
                </Button>
              )}

              {isFulfillable(order.status) && (
                <Button variant="secondary" size="sm" onClick={() => setFulfilOpen(true)} disabled={busy}>
                  <PackageCheck className="size-4" />
                  Record shipment
                </Button>
              )}

              {/* Admin only, same reasoning as the estimate route: this posts a
                  real invoice with no maker-checker branch, so a staff caller
                  would recognise revenue without approval. */}
              {isInvoiceable(order.status) && isOwner && (
                <Button size="sm" onClick={() => setConvertOpen(true)} disabled={busy}>
                  <FileText className="size-4" />
                  Convert to invoice
                </Button>
              )}

              {order.invoiceId && (
                <Button asChild size="sm">
                  <Link to={`/invoices/${order.invoiceId}`}>
                    <ArrowRight className="size-4" />
                    View invoice
                  </Link>
                </Button>
              )}

              <DocumentActions
                document={doc.share}
                getPdf={() => documentPdfBlob(doc)}
                cacheKey={[order.id, order.updatedAt, order.status, company.name, company.logo, customer?.id].join('|')}
              />

              <MoreActionsMenu
                actions={[
                  { label: 'View customer', icon: Users, to: `/customers/${order.customerId}` },
                  {
                    label: 'Cancel order',
                    icon: Ban,
                    destructive: true,
                    onSelect: () => setCancelOpen(true),
                    hidden: !isSalesOrderEditable(order.status),
                  },
                  {
                    label: 'Delete order',
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => setDeleteOpen(true),
                    hidden: !(canDelete && order.status !== 'invoiced'),
                  },
                ]}
              />
            </>
          }
        />
      }
      aside={
        <>
          <AmountSummary
            label="Order total"
            amount={order.total}
            tone={order.status === 'cancelled' ? 'muted' : 'default'}
            progress={
              ordered > 0
                ? {
                    value: shipped,
                    total: ordered,
                    label: 'Shipped',
                    tone: fullyFulfilled ? 'success' : 'primary',
                    caption: `${shipped.toLocaleString('en-US')} of ${ordered.toLocaleString('en-US')} units shipped`,
                  }
                : undefined
            }
          />

          <PartyCard
            title="Customer"
            to={`/customers/${order.customerId}`}
            party={doc.party}
            loading={!customer}
          />

          {order.invoiceId && (
            <RailSection title="Invoice">
              <Link
                to={`/invoices/${order.invoiceId}`}
                className="inline-flex items-center gap-xs text-body-sm text-primary hover:underline"
              >
                <FileText className="size-4" aria-hidden="true" />
                Open the invoice for this order
              </Link>
            </RailSection>
          )}

          <RailSection title="Details">
            <KeyValueList
              items={[
                { label: 'Order #', value: order.orderNumber || '—' },
                {
                  label: 'From estimate',
                  value: (
                    <Link to={`/estimates/${order.sourceEstimateId}`} className="text-primary hover:underline">
                      View estimate
                    </Link>
                  ),
                  hidden: !order.sourceEstimateId,
                },
                { label: 'Created', value: docDate(order.createdAt), hidden: !order.createdAt },
                { label: 'Last updated', value: docDate(order.updatedAt), hidden: !order.updatedAt },
              ]}
            />
          </RailSection>
        </>
      }
    >
      {!isOwner && isInvoiceable(order.status) && (
        <p className="rounded-md bg-primary-tint p-md text-body-sm text-text-primary">
          Invoicing an order posts the sale and moves stock, so it is the owner&rsquo;s action.
          Record shipments here and ask them to invoice.
        </p>
      )}

      {!areLinesEditable(order.status) && isSalesOrderEditable(order.status) && (
        <p className="rounded-md bg-warning-lighter p-md text-body-sm text-text-primary">
          This order has started shipping, so its lines are locked — editing them would reset the
          fulfilment record. Dates and notes can still be changed.
        </p>
      )}

      <DocumentPaper
        doc={doc}
        lineExtraHeader="Fulfilled"
        lineExtra={(_line, i) => {
          const line = order.lines[i];
          return line ? <FulfilmentCell line={line} /> : null;
        }}
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
            This creates a <strong>posted</strong> invoice straight away: the sale is recognised,
            the customer&rsquo;s balance goes up and stock is decremented.
            {!fullyFulfilled && (
              <>
                {' '}
                This order is <strong>not fully shipped</strong>, and converting still bills and
                decrements the <strong>full ordered quantity</strong> — there is no partial
                invoicing.
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
    </DetailLayout>
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
          className={cn('h-full rounded-full', pct >= 100 ? 'bg-success' : 'bg-warning')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
