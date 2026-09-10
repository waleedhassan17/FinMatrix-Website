import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileText,
  PackageCheck,
  Pencil,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DocumentView } from '@/features/documents/DocumentView';
import { ReceiveItemsPanel } from '@/features/purchaseOrders/ReceiveItemsPanel';
import { useAdminOnly, useCapability } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import {
  buildReceiptDrafts,
  hasAnyReceipt,
  isPOEditable,
  isReceivable,
  receiptDraftsToPayload,
  receivedPercent,
  receivedValue,
  type ReceiptDraft,
} from '@/models/purchaseOrder';
import {
  createBillFromPO,
  deletePurchaseOrder,
  getPurchaseOrderById,
  POAlreadyBilledError,
  receivePurchaseOrderItems,
  setPurchaseOrderStatus,
} from '@/networks/purchases/purchaseOrderNetwork';
import { formatMoney } from '@/utils/money';

export default function PODetailPage() {
  const { poId = '' } = useParams<{ poId: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const editCap = useCapability('purchaseOrder.edit');
  const statusCap = useCapability('purchaseOrder.updateStatus');
  const canDelete = useAdminOnly('purchaseOrder.delete');

  const [receiving, setReceiving] = useState(false);
  const [drafts, setDrafts] = useState<ReceiptDraft[]>([]);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmBill, setConfirmBill] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Set when a second Convert-to-Bill is refused; the existing bill is linked
  // rather than the refusal being reported as a failure.
  const [existingBill, setExistingBill] = useState<{
    id: string;
    number: string;
  } | null>(null);

  const { data: po, isLoading, isError, error } = useQuery({
    queryKey: ['purchase-orders', poId],
    queryFn: () => getPurchaseOrderById(poId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  };

  const changeStatus = useMutation({
    mutationFn: (status: 'sent' | 'closed') =>
      setPurchaseOrderStatus(poId, status),
    onSuccess: (updated) => {
      invalidate();
      toast.success(
        updated.status === 'sent' ? 'Sent to vendor' : 'Purchase order closed',
      );
    },
    onError: (e: Error) =>
      toast.error('Could not update the order', { description: e.message }),
  });

  const receive = useMutation({
    // Cumulative, not a delta — receiptDraftsToPayload adds today's arrival to
    // what was already booked in.
    mutationFn: () => receivePurchaseOrderItems(poId, receiptDraftsToPayload(drafts)),
    onSuccess: (updated) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setReceiving(false);
      toast.success('Goods received', {
        description:
          updated.status === 'received'
            ? 'The order is now fully received.'
            : 'Stock has been increased and GRNI posted.',
      });
    },
    onError: (e: Error) =>
      toast.error('Could not receive items', { description: e.message }),
  });

  const convert = useMutation({
    mutationFn: () => createBillFromPO(poId),
    onSuccess: (bill) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Bill created', {
        description: `${bill.billNumber || 'The bill'} covers what has been received.`,
      });
      navigate(`/bills/${bill.id}`);
    },
    onError: (e: Error) => {
      if (e instanceof POAlreadyBilledError) {
        setExistingBill({ id: e.billId, number: e.billNumber });
        toast.info('This order has already been billed', {
          description: 'Open the existing bill instead of raising another.',
        });
        return;
      }
      toast.error('Could not create the bill', { description: e.message });
    },
  });

  const remove = useMutation({
    mutationFn: () => deletePurchaseOrder(poId),
    onSuccess: () => {
      invalidate();
      toast.success('Purchase order deleted');
      navigate('/purchase-orders', { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not delete the order', { description: e.message }),
  });

  if (isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading purchase order…</p>;
  }

  if (isError || !po) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Purchase order not found</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          {error instanceof Error ? error.message : 'It may have been removed.'}
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/purchase-orders">Back to purchase orders</Link>
        </Button>
      </Card>
    );
  }

  const billId = existingBill?.id || po.billId;
  const received = hasAnyReceipt(po);
  const canReceive = isReceivable(po.status) && statusCap.allowed;
  // Edit is gated twice: the capability (false for staff) AND draft-only,
  // because PATCH rebuilds every line and zeroes what was received.
  const canEdit = editCap.allowed && isPOEditable(po.status);

  const startReceiving = () => {
    setDrafts(buildReceiptDrafts(po.lines));
    setReceiving(true);
  };

  return (
    <div className="flex flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/purchase-orders">
          <ArrowLeft className="size-4" />
          Purchase orders
        </Link>
      </Button>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-0">
          <div className="flex items-center gap-sm">
            <h1 className="text-h2 text-text-primary">{po.poNumber || 'Order'}</h1>
            <StatusBadge status={po.status} />
          </div>
          <p className="text-body-sm text-text-secondary">
            <Link to={`/vendors/${po.vendorId}`} className="hover:underline">
              {po.vendorName || 'Unknown vendor'}
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap gap-xs">
          {canEdit && (
            <Button asChild variant="secondary">
              <Link to={`/purchase-orders/${po.id}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
          )}

          {po.status === 'draft' && statusCap.allowed && (
            <Button onClick={() => setConfirmSend(true)} disabled={changeStatus.isPending}>
              <Send className="size-4" />
              Send to vendor
            </Button>
          )}

          {canReceive && !receiving && (
            <Button onClick={startReceiving}>
              <PackageCheck className="size-4" />
              Receive items
            </Button>
          )}

          {/* Only offered once something has actually arrived: create-bill
              bills the received quantity, so with nothing received it would
              raise a bill for zero. */}
          {billId ? (
            <Button asChild variant="secondary">
              <Link to={`/bills/${billId}`}>
                <FileText className="size-4" />
                View bill
              </Link>
            </Button>
          ) : (
            received && (
              <Button variant="secondary" onClick={() => setConfirmBill(true)}>
                <FileText className="size-4" />
                Convert to bill
              </Button>
            )
          )}

          {po.status !== 'closed' && po.status !== 'draft' && statusCap.allowed && (
            <Button variant="secondary" onClick={() => setConfirmClose(true)}>
              <XCircle className="size-4" />
              Close
            </Button>
          )}

          {canDelete && (
            <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {receiving && (
        <ReceiveItemsPanel
          drafts={drafts}
          onChange={setDrafts}
          onSubmit={() => receive.mutate()}
          onCancel={() => setReceiving(false)}
          busy={receive.isPending}
        />
      )}

      <DocumentView
        title="Purchase order"
        counterpartyLabel="To"
        counterpartyName={po.vendorName}
        meta={[
          ['PO #', po.poNumber || '—'],
          ['Order date', po.orderDate.slice(0, 10) || '—'],
          ['Expected', po.expectedDate.slice(0, 10) || '—'],
        ]}
        lines={po.lines}
        quantityHeader="Ordered"
        priceHeader="Unit cost"
        lineExtraHeader="Received"
        // The extra-column slot built for sales-order fulfilment, reused
        // unchanged — the two progress readouts are the same idea.
        lineExtra={(_line, i) => {
          const l = po.lines[i];
          if (!l) return null;
          const pct = receivedPercent(l);
          return (
            <div className="min-w-28">
              <div className="flex justify-between text-caption text-text-secondary tabular">
                <span>
                  {l.receivedQuantity} / {l.quantity}
                </span>
                <span>{Math.round(pct)}%</span>
              </div>
              <div className="mt-xxs h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={cn(
                    'h-full rounded-full',
                    pct >= 100 ? 'bg-success' : 'bg-primary',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        }}
        subtotal={po.subtotal}
        discountType="none"
        discountValue={0}
        discountAmount={0}
        taxAmount={po.taxAmount}
        total={po.total}
        extraTotals={
          received
            ? [
                {
                  label: 'Received so far',
                  value: receivedValue(po),
                  dividerBefore: true,
                },
              ]
            : []
        }
        notes={po.notes}
      />

      <ConfirmDialog
        open={confirmSend}
        onOpenChange={setConfirmSend}
        title="Send this order to the vendor?"
        description="This marks the order as sent. It posts nothing to the ledger — a purchase order is a commitment, not a transaction."
        confirmLabel="Send to vendor"
        busy={changeStatus.isPending}
        onConfirm={() => changeStatus.mutate('sent')}
      />

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Close this order?"
        description={
          received
            ? 'Closing stops any further receipts against this order. What has already been received stays booked in.'
            : 'Closing stops any further receipts against this order. Nothing has been received.'
        }
        confirmLabel="Close order"
        busy={changeStatus.isPending}
        onConfirm={() => changeStatus.mutate('closed')}
      />

      <ConfirmDialog
        open={confirmBill}
        onOpenChange={setConfirmBill}
        title="Raise a bill for what has arrived?"
        description={
          <>
            A bill for <strong>{formatMoney(receivedValue(po))}</strong> will be
            raised against {po.vendorName || 'this vendor'} — the received
            quantity at the ordered cost, not the full order value of{' '}
            {formatMoney(po.total)}. It clears Goods Received Not Invoiced
            against accounts payable. An order can only be billed once.
          </>
        }
        confirmLabel="Create bill"
        busy={convert.isPending}
        onConfirm={() => convert.mutate()}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this purchase order?"
        description="This cannot be undone. An order with received stock or a bill against it will be refused by the server."
        confirmLabel="Delete order"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
