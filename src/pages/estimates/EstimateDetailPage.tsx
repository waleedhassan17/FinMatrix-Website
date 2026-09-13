import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  FileText,
  Pencil,
  Send,
  Trash2,
  Users,
  X,
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
import { estimateDocument } from '@/features/documents/documentBuilders';
import { docDate } from '@/features/documents/documentModel';
import { DocumentPaper } from '@/features/documents/DocumentPaper';
import { documentPdfBlob } from '@/features/documents/documentPdf';
import { PartyCard } from '@/features/documents/PartyCard';
import { useDocumentCompany, useDocumentCustomer } from '@/features/documents/useDocumentContext';
import { DocumentActions } from '@/features/share/DocumentActions';
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

  const { data: estimate, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['estimates', estimateId],
    queryFn: () => getEstimateById(estimateId),
  });

  const company = useDocumentCompany();
  const customer = useDocumentCustomer(estimate?.customerId);
  const doc = useMemo(
    () => (estimate ? estimateDocument(estimate, company, customer) : null),
    [estimate, company, customer],
  );

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

  if (isLoading) return <DetailPageSkeleton />;

  if (isError || !estimate || !doc) {
    return (
      <PageMessage
        tone={isError ? 'error' : 'notFound'}
        title={isError ? 'This estimate could not be loaded' : 'Estimate not found'}
        description={error instanceof Error ? error.message : 'It may have been deleted.'}
        onRetry={isError ? () => refetch() : undefined}
        backTo="/estimates"
        backLabel="Back to estimates"
      />
    );
  }

  const editable = isEstimateEditable(estimate.status);
  const convertible = isConvertible(estimate.status);
  const expired = isExpired(estimate);
  const busy = status.isPending || toInvoice.isPending || toSalesOrder.isPending;
  const convertedTo = estimate.convertedToId
    ? estimate.convertedToType === 'invoice'
      ? { to: `/invoices/${estimate.convertedToId}`, label: 'invoice' }
      : { to: `/sales-orders/${estimate.convertedToId}`, label: 'sales order' }
    : null;

  return (
    <DetailLayout
      header={
        <PageHeader
          back={{ to: '/estimates', label: 'Estimates' }}
          title={estimate.estimateNumber || 'Estimate'}
          status={
            <>
              <StatusBadge status={estimate.status} />
              {expired && <StatusBadge status="expired" />}
            </>
          }
          meta={[
            <Link
              key="customer"
              to={`/customers/${estimate.customerId}`}
              className="text-label-md text-text-primary hover:text-primary hover:underline"
            >
              {doc.party?.name || 'Customer'}
            </Link>,
            estimate.estimateDate ? `Dated ${docDate(estimate.estimateDate)}` : null,
            estimate.expiryDate ? `Valid until ${docDate(estimate.expiryDate)}` : null,
          ]}
          actions={
            <>
              {editable && (
                <Button asChild variant="secondary" size="sm">
                  <Link to={`/estimates/${estimate.id}/edit`}>
                    <Pencil className="size-4" />
                    Edit
                  </Link>
                </Button>
              )}

              {estimate.status === 'draft' && (
                <Button size="sm" onClick={() => status.mutate('sent')} disabled={busy}>
                  <Send className="size-4" />
                  Mark sent
                </Button>
              )}

              {estimate.status === 'sent' && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => status.mutate('declined')} disabled={busy}>
                    <X className="size-4" />
                    Declined
                  </Button>
                  <Button size="sm" onClick={() => status.mutate('accepted')} disabled={busy}>
                    <Check className="size-4" />
                    Accepted
                  </Button>
                </>
              )}

              {estimate.status === 'declined' && (
                <Button variant="secondary" size="sm" onClick={() => status.mutate('accepted')} disabled={busy}>
                  <Check className="size-4" />
                  Mark accepted
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
                <Button size="sm" onClick={() => setConvertOpen(true)} disabled={busy}>
                  <FileText className="size-4" />
                  Convert to invoice
                </Button>
              )}

              {convertedTo && (
                <Button asChild size="sm">
                  <Link to={convertedTo.to}>
                    <ArrowRight className="size-4" />
                    View {convertedTo.label}
                  </Link>
                </Button>
              )}

              <DocumentActions
                document={doc.share}
                getPdf={() => documentPdfBlob(doc)}
                cacheKey={[estimate.id, estimate.updatedAt, estimate.status, company.name, company.logo, customer?.id].join('|')}
              />

              <MoreActionsMenu
                actions={[
                  {
                    label: 'Convert to sales order',
                    icon: ArrowRight,
                    onSelect: () => toSalesOrder.mutate(),
                    hidden: !(convertible && salesOrdersEnabled),
                    disabled: busy,
                  },
                  { label: 'View customer', icon: Users, to: `/customers/${estimate.customerId}` },
                  {
                    label: 'Delete estimate',
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => setDeleteOpen(true),
                    hidden: !(canDelete && editable),
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
            label="Quote total"
            amount={estimate.total}
            tone={estimate.status === 'declined' ? 'muted' : 'default'}
            note={
              expired
                ? 'This quote has expired'
                : estimate.expiryDate
                  ? `Valid until ${docDate(estimate.expiryDate)}`
                  : undefined
            }
            noteTone={expired ? 'danger' : 'neutral'}
          />

          <PartyCard
            title="Customer"
            to={`/customers/${estimate.customerId}`}
            party={doc.party}
            loading={!customer}
          />

          {convertedTo && (
            <RailSection title="Converted">
              <Link
                to={convertedTo.to}
                className="inline-flex items-center gap-xs text-body-sm text-primary hover:underline"
              >
                <ArrowRight className="size-4" aria-hidden="true" />
                Open the {convertedTo.label} this became
              </Link>
            </RailSection>
          )}

          <RailSection title="Details">
            <KeyValueList
              items={[
                { label: 'Estimate #', value: estimate.estimateNumber || '—' },
                { label: 'Created', value: docDate(estimate.createdAt), hidden: !estimate.createdAt },
                { label: 'Last updated', value: docDate(estimate.updatedAt), hidden: !estimate.updatedAt },
              ]}
            />
          </RailSection>
        </>
      }
    >
      {!isOwner && convertible && (
        <p className="rounded-md bg-primary-tint p-md text-body-sm text-text-primary">
          Invoicing an estimate posts the sale and moves stock, so it is the owner&rsquo;s action.
          Ask them to convert this one when the customer accepts.
        </p>
      )}

      <DocumentPaper doc={doc} />

      <ConfirmDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        title="Convert to invoice?"
        description={
          <>
            This creates a <strong>posted</strong> invoice straight away: the sale is recognised in
            the ledger, the customer&rsquo;s balance goes up and stock is decremented. It cannot be
            undone except by voiding the invoice. The invoice is dated <strong>today</strong>, not
            the estimate date.
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
    </DetailLayout>
  );
}
