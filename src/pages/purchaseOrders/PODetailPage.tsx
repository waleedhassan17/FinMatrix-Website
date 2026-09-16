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
import { Combobox } from '@/components/ui/Combobox';
import { DateField } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
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
import { addDays, isoToday } from '@/models/document';
import { PAYMENT_TERMS_DAYS } from '@/models/customer';
import {
  buildReceiptDrafts,
  hasAnyReceipt,
  hasUnbilledReceipts,
  isPOEditable,
  isReceivable,
  isRequisition,
  receiptDraftsToPayload,
  receivedPercent,
  type ReceiptDraft,
} from '@/models/purchaseOrder';
import { getBillableAccounts } from '@/networks/accounting/accountNetwork';
import { ApiError } from '@/networks/network/apiHelpers';
import {
  createBillFromPO,
  deletePurchaseOrder,
  getPurchaseOrderById,
  receivePurchaseOrderItems,
  setPurchaseOrderStatus,
} from '@/networks/purchases/purchaseOrderNetwork';
import { formatMoney } from '@/utils/money';
import { invalidateAfterPosting } from '@/features/documents/invalidateAfterPosting';

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
  // The bill form inside the Convert dialog. Everything is optional: the
  // server numbers it, dates it today and sets the due date from the vendor's
  // terms when these are left blank.
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(isoToday());
  const [dueDate, setDueDate] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [needsExpenseAccount, setNeedsExpenseAccount] = useState(false);

  const { data: po, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['purchase-orders', poId],
    queryFn: () => getPurchaseOrderById(poId),
  });

  const company = useDocumentCompany();
  const vendor = useDocumentVendor(po?.vendorId);
  const doc = useMemo(() => (po ? purchaseOrderDocument(po, company, vendor) : null), [po, company, vendor]);

  const invalidate = () => {
    invalidateAfterPosting(queryClient);
  };

  const { data: billable = [] } = useQuery({
    queryKey: ['accounts', 'billable'],
    queryFn: getBillableAccounts,
    enabled: needsExpenseAccount,
  });

  const changeStatus = useMutation({
    mutationFn: (status: 'sent' | 'closed') =>
      setPurchaseOrderStatus(poId, status),
    onSuccess: (updated) => {
      invalidate();
      toast.success(
        updated.status === 'closed' ? 'Purchase order closed' : 'Approved and sent to the vendor',
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
    mutationFn: () =>
      createBillFromPO(poId, {
        billNumber: billNumber.trim() || undefined,
        billDate: billDate || undefined,
        dueDate: dueDate || undefined,
        defaultAccountId: expenseAccountId || undefined,
      }),
    onSuccess: ({ bill }) => {
      invalidate();
      setConfirmBill(false);
      toast.success('Bill created', {
        description: `${bill.billNumber || 'The bill'} covers the goods received and not billed yet, tax included.`,
      });
      navigate(`/bills/${bill.id}`);
    },
    onError: (e: Error) => {
      // An older non-stock line saved without an expense account: ask for one.
      if (e instanceof ApiError && e.code === 'EXPENSE_ACCOUNT_REQUIRED') {
        setNeedsExpenseAccount(true);
        toast.info('Choose an expense account', { description: e.message });
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

  const requisition = isRequisition(po);
  const received = hasAnyReceipt(po);
  const unbilled = hasUnbilledReceipts(po);
  const canReceive = isReceivable(po.status) && statusCap.allowed;
  // Edit is gated twice: the capability (false for staff) AND draft-only,
  // because PATCH rebuilds every line.
  const canEdit = editCap.allowed && isPOEditable(po.status);
  // Tax-inclusive, like the order total they sit beside.
  const receivedAmount = po.receivedValueGross;
  const billedAmount = po.billedValueGross;
  const unbilledAmount = po.unbilledValueGross;
  const vendorTermsDays = vendor ? (PAYMENT_TERMS_DAYS as Record<string, number>)[vendor.paymentTerms] ?? 30 : 30;

  // On screen only: what has arrived is the buyer's working figure, not something
  // the vendor's copy of the order should carry.
  const screenDoc = received
    ? {
        ...doc,
        totals: [
          ...doc.totals,
          { label: 'Received so far (incl. tax)', value: receivedAmount, dividerBefore: true },
          { label: 'Billed so far (incl. tax)', value: billedAmount },
        ],
      }
    : doc;

  const openBillDialog = () => {
    setBillNumber('');
    setBillDate(isoToday());
    setDueDate(addDays(isoToday(), vendorTermsDays));
    setExpenseAccountId('');
    setNeedsExpenseAccount(false);
    setConfirmBill(true);
  };

  const startReceiving = () => {
    setDrafts(buildReceiptDrafts(po.lines));
    setReceiving(true);
  };

  return (
    <DetailLayout
      header={
        <PageHeader
          back={{ to: '/purchase-orders', label: 'Purchase orders' }}
          title={po.poNumber || (requisition ? 'Purchase requisition' : 'Purchase order')}
          status={<StatusBadge status={po.status} label={requisition ? 'Requisition' : undefined} />}
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

              {requisition && statusCap.allowed && (
                <Button size="sm" onClick={() => setConfirmSend(true)} disabled={changeStatus.isPending}>
                  <Send className="size-4" />
                  Approve &amp; send
                </Button>
              )}

              {canReceive && !receiving && (
                <Button size="sm" onClick={startReceiving}>
                  <PackageCheck className="size-4" />
                  Receive items
                </Button>
              )}

              {/* Offered whenever goods have arrived that no bill covers yet —
                  once per delivery if need be. */}
              {unbilled && !requisition && po.status !== 'closed' && (
                <Button variant="secondary" size="sm" onClick={openBillDialog}>
                  <FileText className="size-4" />
                  Convert to bill
                </Button>
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
                    hidden: !(po.status !== 'closed' && !requisition && statusCap.allowed),
                  },
                  {
                    label: 'Delete order',
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => setConfirmDelete(true),
                    hidden: !(canDelete && !received && po.bills.length === 0),
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
            label={requisition ? 'Requisition total' : 'Order total'}
            amount={po.total}
            progress={
              requisition
                ? undefined
                : {
                    value: receivedAmount,
                    total: po.total,
                    label: 'Received',
                    tone: 'primary',
                    caption: received
                      ? `Received ${formatMoney(receivedAmount)} of ${formatMoney(po.total)} · Billed ${formatMoney(billedAmount)}`
                      : 'Nothing received yet',
                  }
            }
          >
            {requisition && (
              <p className="mt-xs text-caption text-text-secondary">
                A purchase requisition — approve it and send it to the vendor to make it a purchase
                order. Nothing posts to the ledger until goods are received.
              </p>
            )}
          </AmountSummary>

          <PartyCard
            title="Vendor"
            to={`/vendors/${po.vendorId}`}
            party={doc.party}
            loading={!vendor}
          />

          {po.bills.length > 0 && (
            <RailSection title={po.bills.length === 1 ? 'Bill' : 'Bills'}>
              <ul className="-mx-sm flex flex-col">
                {po.bills.map((b) => (
                  <li key={b.id}>
                    <Link
                      to={`/bills/${b.id}`}
                      className="flex items-center justify-between gap-sm rounded-md px-sm py-xs hover:bg-surface-hover"
                    >
                      <span className="inline-flex min-w-0 items-center gap-xs text-label-md text-text-primary">
                        <FileText className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                        <span className="truncate">{b.billNumber}</span>
                      </span>
                      <span className="text-label-md text-text-primary tabular">{formatMoney(b.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </RailSection>
          )}

          <RailSection title="Details">
            <KeyValueList
              items={[
                { label: requisition ? 'Requisition #' : 'PO #', value: po.poNumber || '—' },
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
        // A requisition has had nothing received against it — no column.
        lineExtraHeader={requisition ? undefined : 'Received'}
        // The extra-column slot built for sales-order fulfilment, reused
        // unchanged — the two progress readouts are the same idea.
        lineExtra={requisition ? undefined : (_line, i) => {
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
        title="Approve this requisition and send it to the vendor?"
        description="It becomes a purchase order that goods can be received against. It posts nothing to the ledger — a purchase order is a commitment, not a transaction."
        confirmLabel="Approve & send"
        busy={changeStatus.isPending}
        onConfirm={() => changeStatus.mutate('sent')}
      />

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Close this order?"
        description={
          unbilled
            ? 'Goods received on this order have not been billed yet. Bill them first — a closed order cannot be billed.'
            : received
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
        title="Bill the goods received"
        description={
          <>
            Bill <strong>{doc.party?.name || 'this vendor'}</strong>{' '}
            <strong>{formatMoney(unbilledAmount)}</strong> (tax included) for the goods received and not
            billed yet. You pay the vendor this amount, tax included. Goods that arrive later can be
            billed separately.
          </>
        }
        confirmLabel={convert.isPending ? 'Creating…' : 'Create bill'}
        busy={convert.isPending}
        confirmDisabled={needsExpenseAccount && !expenseAccountId}
        onConfirm={() => convert.mutate()}
      >
        <div className="grid gap-md sm:grid-cols-2">
          <Input
            label="Vendor's invoice #"
            value={billNumber}
            onChange={(e) => setBillNumber(e.target.value)}
            placeholder="Optional"
            hint="Left blank, the bill is numbered BILL-YYYY-NNNN."
            containerClassName="sm:col-span-2"
          />
          <DateField label="Bill date" value={billDate} onChange={setBillDate} />
          <DateField
            label="Due date"
            value={dueDate}
            onChange={setDueDate}
            min={billDate}
            hint={`Vendor terms: ${vendorTermsDays} days.`}
          />
          {needsExpenseAccount && (
            <Combobox
              label="Expense account for non-stock lines *"
              value={expenseAccountId}
              onChange={setExpenseAccountId}
              options={billable
                .filter((a) => a.type === 'expense')
                .map((a) => ({ value: a.id, label: `${a.accountNumber} · ${a.name}` }))}
              placeholder="Choose an account…"
              searchPlaceholder="Search accounts…"
              containerClassName="sm:col-span-2"
            />
          )}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this purchase order?"
        description="This cannot be undone. Only an order with nothing received and no bill can be deleted; its number is not reused."
        confirmLabel="Delete order"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </DetailLayout>
  );
}
