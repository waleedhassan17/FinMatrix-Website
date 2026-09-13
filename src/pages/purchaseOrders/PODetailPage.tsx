import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  PackageCheck,
  Pencil,
  Send,
  Store,
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
import { KeyValueList } from '@/components/ui/KeyValueList';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AmountSummary } from '@/features/documents/AmountSummary';
import { purchaseOrderDocument } from '@/features/documents/documentBuilders';
import { docDate } from '@/features/documents/documentModel';
import { DocumentPaper } from '@/features/documents/DocumentPaper';
import { documentPdfBlob } from '@/features/documents/documentPdf';
import { PartyCard } from '@/features/documents/PartyCard';
import { useDocumentCompany, useDocumentVendor } from '@/features/documents/useDocumentContext';
import { ReceiveItemsPanel } from '@/features/purchaseOrders/ReceiveItemsPanel';
import { DocumentActions } from '@/features/share/DocumentActions';
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

  const { data: po, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['purchase-orders', poId],
    queryFn: () => getPurchaseOrderById(poId),
  });

  const company = useDocumentCompany();
  const vendor = useDocumentVendor(po?.vendorId);
  const doc = useMemo(() => (po ? purchaseOrderDocument(po, company, vendor) : null), [po, company, vendor]);

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

  if (isLoading) return <DetailPageSkeleton />;

  if (isError || !po || !doc) {
    return (
      <PageMessage
        tone={isError ? 'error' : 'notFound'}
        title={isError ? 'This purchase order could not be loaded' : 'Purchase order not found'}
        description={error instanceof Error ? error.message : 'It may have been removed.'}
        onRetry={isError ? () => refetch() : undefined}
        backTo="/purchase-orders"
        backLabel="Back to purchase orders"
      />
    );
  }

  const billId = existingBill?.id || po.billId;
  const received = hasAnyReceipt(po);
  const canReceive = isReceivable(po.status) && statusCap.allowed;
  // Edit is gated twice: the capability (false for staff) AND draft-only,
  // because PATCH rebuilds every line and zeroes what was received.
  const canEdit = editCap.allowed && isPOEditable(po.status);
  const receivedAmount = receivedValue(po);

  // On screen only: what has arrived is the buyer's working figure, not something
  // the vendor's copy of the order should carry.
  const screenDoc = received
    ? { ...doc, totals: [...doc.totals, { label: 'Received so far', value: receivedAmount, dividerBefore: true }] }
    : doc;

  const startReceiving = () => {
    setDrafts(buildReceiptDrafts(po.lines));
    setReceiving(true);
  };

  return (
    <DetailLayout
      header={
        <PageHeader
          back={{ to: '/purchase-orders', label: 'Purchase orders' }}
          title={po.poNumber || 'Purchase order'}
          status={<StatusBadge status={po.status} />}
          meta={[
            <Link
              key="vendor"
              to={`/vendors/${po.vendorId}`}
              className="text-label-md text-text-primary hover:text-primary hover:underline"
            >
              {doc.party?.name || 'Vendor'}
            </Link>,
            po.orderDate ? `Ordered ${docDate(po.orderDate)}` : null,
            po.expectedDate ? `Expected ${docDate(po.expectedDate)}` : null,
          ]}
          actions={
            <>
              {canEdit && (
                <Button asChild variant="secondary" size="sm">
                  <Link to={`/purchase-orders/${po.id}/edit`}>
                    <Pencil className="size-4" />
                    Edit
                  </Link>
                </Button>
              )}

              {po.status === 'draft' && statusCap.allowed && (
                <Button size="sm" onClick={() => setConfirmSend(true)} disabled={changeStatus.isPending}>
                  <Send className="size-4" />
                  Send to vendor
                </Button>
              )}

              {canReceive && !receiving && (
                <Button size="sm" onClick={startReceiving}>
                  <PackageCheck className="size-4" />
                  Receive items
                </Button>
              )}

              {/* Only offered once something has actually arrived: create-bill
                  bills the received quantity, so with nothing received it would
                  raise a bill for zero. */}
              {billId ? (
                <Button asChild variant="secondary" size="sm">
                  <Link to={`/bills/${billId}`}>
                    <FileText className="size-4" />
                    View bill
                  </Link>
                </Button>
              ) : (
                received && (
                  <Button variant="secondary" size="sm" onClick={() => setConfirmBill(true)}>
                    <FileText className="size-4" />
                    Convert to bill
                  </Button>
                )
              )}

              <DocumentActions
                document={doc.share}
                getPdf={() => documentPdfBlob(doc)}
                cacheKey={[po.id, po.updatedAt, po.status, company.name, company.logo, vendor?.id].join('|')}
              />

              <MoreActionsMenu
                actions={[
                  { label: 'View vendor', icon: Store, to: `/vendors/${po.vendorId}` },
                  {
                    label: 'Close order',
                    icon: XCircle,
                    onSelect: () => setConfirmClose(true),
                    hidden: !(po.status !== 'closed' && po.status !== 'draft' && statusCap.allowed),
                  },
                  {
                    label: 'Delete order',
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => setConfirmDelete(true),
                    hidden: !canDelete,
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
            amount={po.total}
            progress={
              po.status === 'draft'
                ? undefined
                : {
                    value: receivedAmount,
                    total: po.total,
                    label: 'Received',
                    tone: 'primary',
                    caption: received
                      ? `${formatMoney(receivedAmount)} of ${formatMoney(po.total)} received`
                      : 'Nothing received yet',
                  }
            }
          >
            {po.status === 'draft' && (
              <p className="mt-xs text-caption text-text-secondary">
                A draft — send it to the vendor when it is ready. A purchase order posts
                nothing to the ledger.
              </p>
            )}
          </AmountSummary>

          <PartyCard
            title="Vendor"
            to={`/vendors/${po.vendorId}`}
            party={doc.party}
            loading={!vendor}
          />

          {billId && (
            <RailSection title="Bill">
              <Link
                to={`/bills/${billId}`}
                className="flex items-center justify-between gap-sm rounded-md text-body-sm text-primary hover:underline"
              >
                <span className="inline-flex items-center gap-xs">
                  <FileText className="size-4" aria-hidden="true" />
                  {existingBill?.number || 'Open the bill for this order'}
                </span>
              </Link>
            </RailSection>
          )}

          <RailSection title="Details">
            <KeyValueList
              items={[
                { label: 'PO #', value: po.poNumber || '—' },
                { label: 'Lines', value: String(po.lines.length) },
                { label: 'Created', value: docDate(po.createdAt), hidden: !po.createdAt },
                { label: 'Last updated', value: docDate(po.updatedAt), hidden: !po.updatedAt },
              ]}
            />
          </RailSection>
        </>
      }
    >
      {receiving && (
        <ReceiveItemsPanel
          drafts={drafts}
          onChange={setDrafts}
          onSubmit={() => receive.mutate()}
          onCancel={() => setReceiving(false)}
          busy={receive.isPending}
        />
      )}

      <DocumentPaper
        doc={screenDoc}
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
                  className={cn('h-full rounded-full', pct >= 100 ? 'bg-success' : 'bg-primary')}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        }}
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
            A bill for <strong>{formatMoney(receivedAmount)}</strong> will be raised against{' '}
            {doc.party?.name || 'this vendor'} — the received quantity at the ordered cost, not the
            full order value of {formatMoney(po.total)}. It clears Goods Received Not Invoiced
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
    </DetailLayout>
  );
}
