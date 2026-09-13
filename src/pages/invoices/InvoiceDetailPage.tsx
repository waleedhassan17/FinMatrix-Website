import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Banknote, Pencil, Plus, Send, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { DetailLayout, RailSection } from '@/components/layout/DetailLayout';
import { MoreActionsMenu, PageHeader } from '@/components/layout/PageHeader';
import { DetailPageSkeleton, PageMessage } from '@/components/layout/PageState';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { KeyValueList } from '@/components/ui/KeyValueList';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { invoiceDocument } from '@/features/documents/documentBuilders';
import { docDate, dueLabel } from '@/features/documents/documentModel';
import { DocumentPaper } from '@/features/documents/DocumentPaper';
import { documentPdfBlob } from '@/features/documents/documentPdf';
import { PartyCard } from '@/features/documents/PartyCard';
import {
  useDocumentCompany,
  useDocumentCustomer,
} from '@/features/documents/useDocumentContext';
import { DocumentActions } from '@/features/share/DocumentActions';
import { useAdminOnly, useCapability } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { isEditable, type Invoice } from '@/models/invoice';
import { paymentMethodLabel } from '@/models/payment';
import {
  deleteInvoice,
  getInvoiceById,
  sendInvoice,
  voidInvoice,
} from '@/networks/sales/invoiceNetwork';
import { getPayments } from '@/networks/sales/paymentNetwork';
import { formatMoney } from '@/utils/money';

export default function InvoiceDetailPage() {
  const { invoiceId = '' } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const voidCap = useCapability('transaction.void');
  const canDelete = useAdminOnly('invoice.delete');

  const [voidOpen, setVoidOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: invoice, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['invoices', invoiceId],
    queryFn: () => getInvoiceById(invoiceId),
  });

  const company = useDocumentCompany();
  const customer = useDocumentCustomer(invoice?.customerId);

  const payments = useQuery({
    queryKey: ['payments', 'list', { invoiceId }],
    queryFn: () => getPayments({ invoiceId }),
    enabled: !!invoice && invoice.amountPaid > 0,
  });

  const doc = useMemo(
    () => (invoice ? invoiceDocument(invoice, company, customer) : null),
    [invoice, company, customer],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const post = useMutation({
    mutationFn: () => sendInvoice(invoiceId),
    onSuccess: () => {
      invalidate();
      toast.success('Posted to the books', {
        description: 'The sale is now recognised in your ledger.',
      });
    },
    // The server's reason matters here — INSUFFICIENT_STOCK names the item and
    // the shortfall, INVOICE_ZERO_TOTAL says the invoice is empty. Replacing
    // that with "something went wrong" would strand the user.
    onError: (e: Error) =>
      toast.error('Could not post invoice', { description: e.message }),
  });

  const doVoid = useMutation({
    mutationFn: (reason: string) => voidInvoice(invoiceId, reason),
    onSuccess: (result) => {
      setVoidOpen(false);
      if (result.pending) {
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        toast.success('Sent for approval', {
          description: 'The invoice is voided once the owner approves.',
        });
        navigate('/my-requests');
        return;
      }
      invalidate();
      toast.success('Invoice voided');
    },
    onError: (e: Error) =>
      toast.error('Could not void invoice', { description: e.message }),
  });

  const doDelete = useMutation({
    mutationFn: () => deleteInvoice(invoiceId),
    onSuccess: () => {
      invalidate();
      toast.success('Invoice deleted');
      navigate('/invoices', { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not delete invoice', { description: e.message }),
  });

  if (isLoading) return <DetailPageSkeleton />;

  if (isError || !invoice || !doc) {
    return (
      <PageMessage
        tone={isError ? 'error' : 'notFound'}
        title={isError ? 'This invoice could not be loaded' : 'Invoice not found'}
        description={error instanceof Error ? error.message : 'It may have been deleted.'}
        onRetry={isError ? () => refetch() : undefined}
        backTo="/invoices"
        backLabel="Back to invoices"
      />
    );
  }

  const editable = isEditable(invoice.status);
  const voided = invoice.status === 'void';
  const settled = invoice.status === 'paid' || voided;
  const owing = !editable && !voided && invoice.balance > 0;
  const due = owing ? dueLabel(invoice.dueDate) : null;
  const paidShare = invoice.total > 0 ? Math.min(100, (invoice.amountPaid / invoice.total) * 100) : 0;
  const paymentUrl = `/payments/new?customerId=${invoice.customerId}&invoiceId=${invoice.id}`;

  return (
    <DetailLayout
      header={
        <PageHeader
          back={{ to: '/invoices', label: 'Invoices' }}
          title={invoice.invoiceNumber || 'Invoice'}
          status={
            <StatusBadge
              status={invoice.status}
              label={invoice.status === 'draft' ? 'Draft — not posted' : undefined}
            />
          }
          meta={[
            <Link
              key="customer"
              to={`/customers/${invoice.customerId}`}
              className="text-label-md text-text-primary hover:text-primary hover:underline"
            >
              {doc.party?.name || 'Customer'}
            </Link>,
            invoice.issueDate ? `Issued ${docDate(invoice.issueDate)}` : null,
            invoice.dueDate ? `Due ${docDate(invoice.dueDate)}` : null,
          ]}
          actions={
            <>
              {editable && (
                <>
                  <Button asChild variant="secondary" size="sm">
                    <Link to={`/invoices/${invoice.id}/edit`}>
                      <Pencil className="size-4" />
                      Edit
                    </Link>
                  </Button>
                  <Button size="sm" onClick={() => post.mutate()} disabled={post.isPending}>
                    <Send className="size-4" />
                    {post.isPending ? 'Posting…' : 'Post to books'}
                  </Button>
                </>
              )}
              {owing && (
                <Button asChild size="sm">
                  <Link to={paymentUrl}>
                    <Banknote className="size-4" />
                    Record payment
                  </Link>
                </Button>
              )}
              <DocumentActions
                document={doc.share}
                getPdf={() => documentPdfBlob(doc)}
                cacheKey={[invoice.id, invoice.updatedAt, invoice.status, company.name, company.logo, customer?.id].join('|')}
              />
              <MoreActionsMenu
                actions={[
                  { label: 'New invoice', icon: Plus, to: '/invoices/new', hidden: !settled },
                  { label: 'View customer', icon: Users, to: `/customers/${invoice.customerId}` },
                  {
                    label: voidCap.submitLabel('Void invoice'),
                    icon: Ban,
                    destructive: true,
                    onSelect: () => setVoidOpen(true),
                    hidden: editable || settled || !voidCap.allowed,
                  },
                  {
                    // Admin only — DELETE /invoices/:id is @Roles('admin'), and it
                    // is refused outright once anything has been paid.
                    label: 'Delete invoice',
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => setDeleteOpen(true),
                    hidden: !(canDelete && invoice.amountPaid === 0),
                  },
                ]}
              />
            </>
          }
        />
      }
      aside={
        <>
          <Card className="p-lg">
            <p className="text-overline text-text-tertiary">
              {voided ? 'Voided' : editable ? 'Draft total' : owing ? 'Balance due' : 'Paid in full'}
            </p>
            <p
              className={cn(
                'mt-xxs text-display-sm tabular',
                voided ? 'text-text-tertiary line-through' : owing || editable ? 'text-text-primary' : 'text-success',
              )}
            >
              {formatMoney(owing ? invoice.balance : invoice.total)}
            </p>
            {due && (
              <p
                className={cn(
                  'mt-xxs text-label-md',
                  due.tone === 'danger' ? 'text-danger' : due.tone === 'warning' ? 'text-warning' : 'text-text-secondary',
                )}
              >
                {due.label}
              </p>
            )}
            {!editable && !voided && (
              <>
                <div
                  className="mt-md h-2 overflow-hidden rounded-full bg-neutral-100"
                  role="progressbar"
                  aria-label="Paid"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(paidShare)}
                >
                  <div className="h-full rounded-full bg-success" style={{ width: `${paidShare}%` }} />
                </div>
                <p className="mt-xs text-caption text-text-secondary">
                  {formatMoney(invoice.amountPaid)} of {formatMoney(invoice.total)} paid
                </p>
              </>
            )}
            {editable && (
              <p className="mt-xs text-caption text-text-secondary">
                Not in the books yet. Post it to recognise the sale and bill the customer.
              </p>
            )}
          </Card>

          <PartyCard
            title="Customer"
            to={`/customers/${invoice.customerId}`}
            party={doc.party}
            loading={!customer}
            extra={
              customer
                ? [{ label: 'Outstanding', value: formatMoney(customer.balance), hidden: customer.balance === 0 }]
                : []
            }
          />

          <RailSection title="Payments">
            {invoice.amountPaid === 0 ? (
              <p className="text-body-sm text-text-tertiary">No payments recorded yet.</p>
            ) : payments.isLoading ? (
              <div className="flex flex-col gap-xs">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (payments.data ?? []).length === 0 ? (
              <p className="text-body-sm text-text-secondary">
                {formatMoney(invoice.amountPaid)} applied from payments and credits.
              </p>
            ) : (
              <ul className="-mx-sm flex flex-col">
                {(payments.data ?? []).map((p) => {
                  const applied =
                    p.applications.find((a) => a.invoiceId === invoice.id)?.amountApplied ?? p.amount;
                  return (
                    <li key={p.id}>
                      <Link
                        to={`/payments/${p.id}`}
                        className="flex items-center justify-between gap-sm rounded-md px-sm py-xs hover:bg-surface-hover"
                      >
                        <span className="min-w-0">
                          <span className="block text-label-md text-text-primary">{docDate(p.paymentDate)}</span>
                          <span className="block truncate text-caption text-text-secondary">
                            {[paymentMethodLabel(p.paymentMethod), p.reference].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="text-label-md text-success tabular">{formatMoney(applied)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </RailSection>

          <RailSection title="Details">
            <KeyValueList
              items={[
                { label: 'Invoice #', value: invoice.invoiceNumber || '—' },
                { label: 'Created', value: docDate(invoice.createdAt), hidden: !invoice.createdAt },
                { label: 'Last updated', value: docDate(invoice.updatedAt), hidden: !invoice.updatedAt },
                { label: 'Lines', value: String(invoice.lines.length) },
              ]}
            />
          </RailSection>
        </>
      }
    >
      <DocumentPaper doc={doc} />

      <ConfirmDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title="Void this invoice?"
        description={
          voidCap.needsApproval
            ? 'This goes to the owner for approval. Nothing changes until they approve it.'
            : 'Voiding reverses the journal entry and restores any stock. It cannot be undone.'
        }
        confirmLabel={voidCap.submitLabel('Void invoice')}
        destructive
        busy={doVoid.isPending}
        // The server requires a reason on this route — it is not optional.
        reason={{
          label: 'Reason *',
          placeholder: 'Why is this being voided?',
        }}
        onConfirm={(reason) => doVoid.mutate(reason ?? '')}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this invoice?"
        description="The invoice, its journal entry and any stock movements are removed permanently. Voiding is usually the right choice instead."
        confirmLabel="Delete permanently"
        destructive
        busy={doDelete.isPending}
        onConfirm={() => doDelete.mutate()}
      />
    </DetailLayout>
  );
}

export type { Invoice };
