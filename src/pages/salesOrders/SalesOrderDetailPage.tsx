import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Ban,
  FileText,
  PackageCheck,
  Pencil,
  RotateCcw,
  Trash2,
  XCircle,
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
import { CreditLimitDialog } from '@/features/customers/CreditLimitDialog';
import { FulfilDialog } from '@/features/salesOrders/FulfilDialog';
import { creditLimitError, type CreditAssessment } from '@/models/credit';
import { DocumentActions } from '@/features/share/DocumentActions';
import { useAdminOnly, useFeature, useIsOwner } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { addDays, isoToday } from '@/models/document';
import {
  billedNotShipped,
  fulfilmentPercent,
  isFullyFulfilled,
  salesOrderActions,
  unitsToShip,
  type FulfilLinePayload,
  type SalesOrder,
  type SalesOrderLine,
} from '@/models/salesOrder';
import {
  cancelSalesOrder,
  closeSalesOrder,
  convertSalesOrderToInvoice,
  deleteSalesOrder,
  fulfillSalesOrder,
  getSalesOrderById,
  reopenSalesOrder,
} from '@/networks/sales/salesOrderNetwork';
import { invalidateAfterPosting } from '@/features/documents/invalidateAfterPosting';
import { statusLabel } from '@/theme/status';
import { formatMoney } from '@/utils/money';

const units = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 4 });

export default function SalesOrderDetailPage() {
  const { salesOrderId = '' } = useParams<{ salesOrderId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isOwner = useIsOwner();
  const canDelete = useAdminOnly('salesOrder.delete');
  // Item photos beside the lines of the PDF the customer receives.
  const inventoryEnabled = useFeature('inventory');

  const [fulfilOpen, setFulfilOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dueDate, setDueDate] = useState(addDays(isoToday(), 30));
  const [closeRemaining, setCloseRemaining] = useState(false);
  // A shipment or invoice the credit limit refused, and how to retry it.
  const [creditIssue, setCreditIssue] = useState<{
    assessment: CreditAssessment;
    retry: (reason: string) => void;
  } | null>(null);

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
    invalidateAfterPosting(queryClient);
  };

  const fulfil = useMutation({
    mutationFn: ({ lines, overrideReason }: { lines: FulfilLinePayload[]; overrideReason?: string }) =>
      fulfillSalesOrder(salesOrderId, lines, overrideReason),
    onSuccess: (updated) => {
      setFulfilOpen(false);
      setCreditIssue(null);
      invalidate();
      toast.success('Shipment recorded', {
        description: `The order is now ${statusLabel(updated.status).toLowerCase()}.`,
      });
    },
    onError: (e: Error, vars) => {
      // Goods leaving on credit past the customer's limit.
      const credit = creditLimitError(e);
      if (credit) {
        setFulfilOpen(false);
        setCreditIssue({
          assessment: credit,
          retry: (reason) => fulfil.mutate({ lines: vars.lines, overrideReason: reason }),
        });
        return;
      }
      toast.error('Could not record shipment', { description: e.message });
    },
  });

  const toInvoice = useMutation({
    mutationFn: (overrideReason?: string) =>
      convertSalesOrderToInvoice(salesOrderId, dueDate || undefined, overrideReason, closeRemaining),
    onSuccess: ({ invoiceId, pending }) => {
      setConvertOpen(false);
      setCreditIssue(null);
      invalidate();
      if (pending) {
        toast.success('Sent for approval', {
          description: 'The invoice is raised once the owner approves it.',
        });
        return;
      }
      toast.success('Invoice created', {
        description: closeRemaining
          ? 'The sale is posted and the rest of the order is closed.'
          : 'The sale is posted and the billed stock has left the books.',
      });
      if (invoiceId) navigate(`/invoices/${invoiceId}`);
    },
    onError: (e: Error) => {
      const credit = creditLimitError(e);
      if (credit) {
        setConvertOpen(false);
        setCreditIssue({ assessment: credit, retry: (reason) => toInvoice.mutate(reason) });
        return;
      }
      toast.error('Could not create invoice', { description: e.message });
    },
  });

  const doClose = useMutation({
    mutationFn: (reason?: string) => closeSalesOrder(salesOrderId, reason),
    onSuccess: () => {
      setCloseOpen(false);
      invalidate();
      toast.success('Sales order closed', {
        description: 'What has not shipped will not ship. You can reopen it.',
      });
    },
    onError: (e: Error) => toast.error('Could not close order', { description: e.message }),
  });

  const doReopen = useMutation({
    mutationFn: () => reopenSalesOrder(salesOrderId),
    onSuccess: (updated) => {
      invalidate();
      toast.success('Sales order reopened', {
        description: `The order is ${statusLabel(updated.status).toLowerCase()} again.`,
      });
    },
    onError: (e: Error) => toast.error('Could not reopen order', { description: e.message }),
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

  const busy =
    fulfil.isPending || toInvoice.isPending || doCancel.isPending || doClose.isPending || doReopen.isPending;
  const actions = salesOrderActions(order);
  const managed = !!order.deliveryId;
  const fullyFulfilled = isFullyFulfilled(order);
  const ordered = order.lines.reduce((sum, l) => sum + l.quantity, 0);
  const shipped = order.lines.reduce((sum, l) => sum + Math.min(l.quantityFulfilled, l.quantity), 0);
  const invoiced = order.lines.reduce((sum, l) => sum + Math.min(l.quantityInvoiced, l.quantity), 0);
  const toShip = unitsToShip(order);
  const billedAhead = billedNotShipped(order);
  const next = order.nextInvoice;
  const shippedUnbilled = order.totals?.toInvoice ?? 0;
  // Closing is offered on a partly shipped order; the dialog explains when
  // shipped goods must be invoiced first.
  const offerClose = !managed && order.status === 'partial';
  const invoiceLabel = !isOwner
    ? 'Request invoice'
    : next?.mode === 'shipped'
      ? 'Invoice shipped goods'
      : 'Convert to invoice';

  const openConvert = () => {
    setCloseRemaining(false);
    setConvertOpen(true);
  };

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
              {actions.edit && (
                <Button asChild variant="secondary" size="sm">
                  <Link to={`/sales-orders/${order.id}/edit`}>
                    <Pencil className="size-4" />
                    Edit
                  </Link>
                </Button>
              )}

              {actions.ship && (
                <Button variant="secondary" size="sm" onClick={() => setFulfilOpen(true)} disabled={busy}>
                  <PackageCheck className="size-4" />
                  Record shipment
                </Button>
              )}

              {/* Invoicing posts. The owner posts directly; a staff member's
                  request goes to the owner, as a directly raised invoice does. */}
              {actions.invoice && (
                <Button size="sm" onClick={openConvert} disabled={busy}>
                  <FileText className="size-4" />
                  {invoiceLabel}
                </Button>
              )}

              {order.invoiceId && (
                <Button asChild size="sm" variant={actions.invoice ? 'secondary' : 'primary'}>
                  <Link to={`/invoices/${order.invoiceId}`}>
                    <ArrowRight className="size-4" />
                    {order.invoices.length > 1 ? 'Latest invoice' : 'View invoice'}
                  </Link>
                </Button>
              )}

              <DocumentActions
                document={doc.share}
                getPdf={() => documentPdfBlob(doc, { linePhotos: inventoryEnabled })}
                cacheKey={[order.id, order.updatedAt, order.status, company.name, company.logo, customer?.id].join('|')}
              />

              <MoreActionsMenu
                actions={[
                  {
                    label: 'Close order',
                    icon: XCircle,
                    onSelect: () => setCloseOpen(true),
                    hidden: !offerClose,
                  },
                  {
                    label: 'Reopen order',
                    icon: RotateCcw,
                    onSelect: () => doReopen.mutate(),
                    disabled: busy,
                    hidden: !actions.reopen,
                  },
                  {
                    label: 'Cancel order',
                    icon: Ban,
                    destructive: true,
                    onSelect: () => setCancelOpen(true),
                    hidden: !actions.cancel,
                  },
                  {
                    label: 'Delete order',
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => setDeleteOpen(true),
                    hidden: !(canDelete && actions.delete),
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
                    caption:
                      `${units(shipped)} of ${units(ordered)} units shipped` +
                      (invoiced > 0 ? ` · ${units(invoiced)} invoiced` : ''),
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

          {order.invoices.length > 0 && (
            <RailSection title={order.invoices.length === 1 ? 'Invoice' : 'Invoices'}>
              <ul className="-mx-sm flex flex-col">
                {order.invoices.map((inv) => (
                  <li key={inv.id}>
                    <Link
                      to={`/invoices/${inv.id}`}
                      className="flex items-center justify-between gap-sm rounded-md px-sm py-xs hover:bg-surface-hover"
                    >
                      <span className="inline-flex min-w-0 items-center gap-xs text-label-md text-text-primary">
                        <FileText className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                        <span className={cn('truncate', inv.status === 'void' && 'line-through text-text-tertiary')}>
                          {inv.invoiceNumber}
                        </span>
                        {inv.status === 'void' && <span className="text-caption text-text-tertiary">void</span>}
                      </span>
                      <span className="text-label-md text-text-primary tabular">{formatMoney(inv.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
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
                {
                  label: 'Delivery',
                  value: (
                    <Link to={`/deliveries/${order.deliveryId}`} className="text-primary hover:underline">
                      {order.deliveryReference || 'View delivery'}
                    </Link>
                  ),
                  hidden: !order.deliveryId,
                },
                { label: 'Created', value: docDate(order.createdAt), hidden: !order.createdAt },
                { label: 'Last updated', value: docDate(order.updatedAt), hidden: !order.updatedAt },
              ]}
            />
          </RailSection>
        </>
      }
    >
      <OrderBanners
        order={order}
        isOwner={isOwner}
        managed={managed}
        toShip={toShip}
        billedAhead={billedAhead}
      />

      <DocumentPaper
        doc={doc}
        lineExtraHeader="Shipped"
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
        onSubmit={(payload) => fulfil.mutate({ lines: payload })}
      />

      <CreditLimitDialog
        assessment={creditIssue?.assessment ?? null}
        onOpenChange={(open) => {
          if (!open) setCreditIssue(null);
        }}
        busy={fulfil.isPending || toInvoice.isPending}
        onOverride={(reason) => creditIssue?.retry(reason)}
      />

      <ConfirmDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        title={next?.mode === 'shipped' ? 'Invoice the shipped goods?' : 'Convert to invoice?'}
        description={
          next?.mode === 'shipped' ? (
            <>
              This creates a <strong>posted</strong> invoice for the goods shipped and not invoiced
              yet: the sale is recognised, the customer&rsquo;s balance goes up and that stock leaves
              the books.
              {!isOwner && ' The owner approves it first.'}
            </>
          ) : (
            <>
              Nothing has been recorded as shipped, so this <strong>ships and invoices the whole
              order</strong> in one step: the sale is recognised, the customer&rsquo;s balance goes
              up and the stock leaves the books.
              {!isOwner && ' The owner approves it first.'}
            </>
          )
        }
        confirmLabel={isOwner ? 'Invoice and post' : 'Send for approval'}
        busy={toInvoice.isPending}
        confirmDisabled={!next}
        onConfirm={() => toInvoice.mutate(undefined)}
      >
        <div className="flex flex-col gap-md">
          {next && <NextInvoiceTable next={next} />}

          {next && !next.isFinal && next.mode === 'shipped' && (
            <div className="rounded-md bg-surface-hover p-sm text-body-sm text-text-secondary">
              <p>
                {units(toShip)} unit{toShip === 1 ? '' : 's'} on this order {toShip === 1 ? 'has' : 'have'}{' '}
                not shipped yet. The order stays open for them, to be shipped and invoiced later.
              </p>
              <label className="mt-sm flex items-start gap-sm">
                <input
                  type="checkbox"
                  className="mt-xxs size-4 accent-[color:var(--color-primary)]"
                  checked={closeRemaining}
                  onChange={(e) => setCloseRemaining(e.target.checked)}
                />
                <span>
                  <span className="text-text-primary">Close the rest of this order</span> — the
                  customer will not take the remaining goods. You can reopen it later.
                </span>
              </label>
            </div>
          )}

          <DateField
            label="Payment due"
            value={dueDate}
            onChange={setDueDate}
            min={isoToday()}
            hint="Defaults to 30 days from today."
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Close this order?"
        description={
          actions.close ? (
            <>
              The {units(toShip)} unit{toShip === 1 ? '' : 's'} not shipped yet will{' '}
              <strong>not ship</strong>. What has been shipped and invoiced stays as it is, and the
              stock held for the rest is released. You can reopen the order later.
            </>
          ) : (
            <>
              {units(shippedUnbilled)} shipped unit{shippedUnbilled === 1 ? ' is' : 's are'} not
              invoiced yet. Invoice them first — tick &ldquo;Close the rest of this order&rdquo; on
              that invoice to do both in one step.
            </>
          )
        }
        reason={
          actions.close
            ? { label: 'Reason (optional)', placeholder: 'e.g. Customer does not need the rest', minLength: 0 }
            : undefined
        }
        confirmLabel="Close order"
        confirmDisabled={!actions.close}
        busy={doClose.isPending}
        onConfirm={(reason) => doClose.mutate(reason)}
      />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this order?"
        description="This cannot be undone — there is no way to reopen a cancelled order. Nothing has shipped or been invoiced on it, so nothing else changes."
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
        description="The order and its lines are removed permanently."
        confirmLabel="Delete permanently"
        destructive
        busy={doDelete.isPending}
        onConfirm={() => doDelete.mutate()}
      />
    </DetailLayout>
  );
}

/** The notes above the document: who acts next, and why. */
function OrderBanners({
  order,
  isOwner,
  managed,
  toShip,
  billedAhead,
}: {
  order: SalesOrder;
  isOwner: boolean;
  managed: boolean;
  toShip: number;
  billedAhead: number;
}) {
  const actions = salesOrderActions(order);
  const note = 'rounded-md p-md text-body-sm text-text-primary';

  if (managed) {
    return (
      <p className={cn(note, 'bg-primary-tint')}>
        This order belongs to delivery{' '}
        <Link to={`/deliveries/${order.deliveryId}`} className="text-primary hover:underline">
          {order.deliveryReference || 'its delivery'}
        </Link>
        . It is shipped and invoiced through that delivery.
      </p>
    );
  }

  return (
    <>
      {!isOwner && actions.invoice && (
        <p className={cn(note, 'bg-primary-tint')}>
          Invoicing an order posts the sale and moves stock, so the owner approves it. A request
          you send appears in their approvals.
        </p>
      )}

      {order.status === 'invoiced' && billedAhead > 0 && (
        <p className={cn(note, 'bg-warning-lighter')}>
          {units(billedAhead)} unit{billedAhead === 1 ? ' is' : 's are'} invoiced but not delivered
          yet. Use <strong>Record shipment</strong> when {billedAhead === 1 ? 'it goes' : 'they go'} out
          — the invoice already took the stock off the books, so nothing else changes.
        </p>
      )}

      {order.status === 'partial' && order.invoices.length > 0 && toShip > 0 && (
        <p className={cn(note, 'bg-primary-tint')}>
          {units(toShip)} unit{toShip === 1 ? '' : 's'} still to ship. Ship and invoice{' '}
          {toShip === 1 ? 'it' : 'them'} as {toShip === 1 ? 'it goes' : 'they go'} out, or close the
          order if the customer will not take the rest.
        </p>
      )}

      {order.status === 'closed' && (
        <p className={cn(note, 'bg-surface-hover')}>
          This order was closed: what had not shipped will not ship. Reopen it to ship the rest.
        </p>
      )}

      {order.hasBackorder && actions.ship && (
        <p className={cn(note, 'bg-warning-lighter')}>
          Some items on this order are on backorder — there is not enough stock to ship all of it.
          It cannot be shipped beyond what is on the shelf until stock arrives.
        </p>
      )}

      {actions.edit && !actions.editLines && (
        <p className={cn(note, 'bg-warning-lighter')}>
          This order has started shipping, so its lines are locked — editing them would reset the
          shipment record. Dates and notes can still be changed.
        </p>
      )}
    </>
  );
}

/** What the next invoice bills, line by line. */
function NextInvoiceTable({ next }: { next: NonNullable<SalesOrder['nextInvoice']> }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-border">
          <th className="py-xs text-left text-overline text-text-secondary">Item</th>
          <th className="py-xs text-right text-overline text-text-secondary">Qty</th>
          <th className="py-xs text-right text-overline text-text-secondary">Amount</th>
        </tr>
      </thead>
      <tbody>
        {next.lines.map((l) => (
          <tr key={l.salesOrderLineId} className="border-b border-border-light">
            <td className="py-xs text-body-sm text-text-primary">{l.description || '—'}</td>
            <td className="py-xs text-right text-body-sm text-text-primary tabular">{units(l.quantity)}</td>
            <td className="py-xs text-right text-body-sm text-text-primary tabular">
              {formatMoney(l.quantity * l.unitPrice * (1 + l.taxRate / 100))}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        {next.discountAmount > 0 && (
          <tr>
            <td colSpan={2} className="pt-xs text-right text-body-sm text-text-secondary">
              Discount
            </td>
            <td className="pt-xs text-right text-body-sm text-text-secondary tabular">
              −{formatMoney(next.discountAmount)}
            </td>
          </tr>
        )}
        <tr>
          <td colSpan={2} className="pt-xs text-right text-label-md text-text-primary">
            Invoice total
          </td>
          <td className="pt-xs text-right text-label-md text-text-primary tabular">{formatMoney(next.total)}</td>
        </tr>
      </tfoot>
    </table>
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
      {line.quantityInvoiced > 0 && (
        <div className="mt-xxs text-caption text-text-tertiary tabular">
          {line.quantityInvoiced >= line.quantity ? 'Invoiced' : `${line.quantityInvoiced} invoiced`}
        </div>
      )}
      {line.backorderQty > 0 && (
        <div className="mt-xxs text-caption text-warning tabular">Backorder {line.backorderQty}</div>
      )}
      {line.onHand !== null && line.backorderQty === 0 && line.quantityFulfilled < line.quantity && (
        <div className="mt-xxs text-caption text-text-tertiary tabular">{line.onHand} on hand</div>
      )}
    </div>
  );
}
