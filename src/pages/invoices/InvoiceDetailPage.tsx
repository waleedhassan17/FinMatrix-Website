import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  Banknote,
  Download,
  Pencil,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DocumentView } from '@/features/documents/DocumentView';
import { useAdminOnly, useCapability } from '@/hooks/useCapability';
import { isEditable, type Invoice } from '@/models/invoice';
import {
  deleteInvoice,
  getInvoiceById,
  getInvoicePdfUrl,
  sendInvoice,
  voidInvoice,
} from '@/networks/sales/invoiceNetwork';

export default function InvoiceDetailPage() {
  const { invoiceId = '' } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const voidCap = useCapability('transaction.void');
  const canDelete = useAdminOnly('invoice.delete');

  const [voidOpen, setVoidOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const { data: invoice, isLoading, isError, error } = useQuery({
    queryKey: ['invoices', invoiceId],
    queryFn: () => getInvoiceById(invoiceId),
  });

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

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      // Not a plain link: this route needs the Authorization header, so the
      // bytes are fetched here and handed to the browser as an object URL.
      const url = await getInvoicePdfUrl(invoiceId);
      window.open(url, '_blank', 'noopener');
      // Give the new tab time to read it before releasing the blob.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error('Could not open PDF', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading invoice…</p>;
  }

  if (isError || !invoice) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Invoice not found</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          {error instanceof Error ? error.message : 'It may have been deleted.'}
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/invoices">Back to invoices</Link>
        </Button>
      </Card>
    );
  }

  const editable = isEditable(invoice.status);
  const settled = invoice.status === 'paid' || invoice.status === 'void';

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/invoices">
          <ArrowLeft className="size-4" />
          Invoices
        </Link>
      </Button>

      {/* ── Actions ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div className="flex items-center gap-sm">
          <h1 className="text-h2 text-text-primary">
            {invoice.invoiceNumber || 'Invoice'}
          </h1>
          <StatusBadge
            status={invoice.status}
            label={invoice.status === 'draft' ? 'Draft — not posted' : undefined}
          />
        </div>

        <div className="flex flex-wrap gap-xs">
          <Button variant="secondary" onClick={downloadPdf} disabled={downloading}>
            <Download className="size-4" />
            {downloading ? 'Preparing…' : 'PDF'}
          </Button>

          {editable && (
            <Button asChild variant="secondary">
              <Link to={`/invoices/${invoice.id}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
          )}

          {editable && (
            <Button onClick={() => post.mutate()} disabled={post.isPending}>
              <Send className="size-4" />
              {post.isPending ? 'Posting…' : 'Post to books'}
            </Button>
          )}

          {/* Module 5 left this gap open; module 8 fills it. The invoice is
              pre-checked on the payment form via the query string. */}
          {!editable && invoice.balance > 0 && (
            <Button asChild>
              <Link
                to={`/payments/new?customerId=${invoice.customerId}&invoiceId=${invoice.id}`}
              >
                <Banknote className="size-4" />
                Record payment
              </Link>
            </Button>
          )}

          {!editable && !settled && voidCap.allowed && (
            <Button variant="danger" onClick={() => setVoidOpen(true)}>
              <Ban className="size-4" />
              {voidCap.submitLabel('Void')}
            </Button>
          )}

          {settled && (
            <Button asChild>
              <Link to="/invoices/new">
                <Plus className="size-4" />
                New invoice
              </Link>
            </Button>
          )}

          {/* Admin only — DELETE /invoices/:id is @Roles('admin'), and it is
              refused outright once anything has been paid. */}
          {canDelete && invoice.amountPaid === 0 && (
            <Button variant="text" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <DocumentView
        title="Invoice"
        counterpartyLabel="Bill to"
        counterpartyName={invoice.customerName}
        meta={[
          ['Invoice #', invoice.invoiceNumber || '—'],
          ['Issued', invoice.issueDate || '—'],
          ['Due', invoice.dueDate || '—'],
        ]}
        lines={invoice.lines}
        subtotal={invoice.subtotal}
        discountType={invoice.discountType}
        discountValue={invoice.discountValue}
        discountAmount={invoice.discountAmount}
        taxAmount={invoice.taxAmount}
        total={invoice.total}
        extraTotals={[
          { label: 'Amount paid', value: invoice.amountPaid, tone: 'success' },
          {
            label: 'Balance due',
            value: invoice.balance,
            strong: true,
            dividerBefore: true,
            tone: invoice.balance > 0 ? 'danger' : 'success',
          },
        ]}
        notes={invoice.notes}
      />

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
    </div>
  );
}

export type { Invoice };
