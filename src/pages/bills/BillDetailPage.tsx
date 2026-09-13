import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CheckCircle2, FileText, Pencil, Store, Trash2 } from 'lucide-react';
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
import { ProofLink } from '@/features/bills/ProofLink';
import { AmountSummary } from '@/features/documents/AmountSummary';
import { billDocument } from '@/features/documents/documentBuilders';
import { docDate, dueLabel } from '@/features/documents/documentModel';
import { DocumentPaper } from '@/features/documents/DocumentPaper';
import { documentPdfBlob } from '@/features/documents/documentPdf';
import { PartyCard } from '@/features/documents/PartyCard';
import { useDocumentCompany, useDocumentVendor } from '@/features/documents/useDocumentContext';
import { DocumentActions } from '@/features/share/DocumentActions';
import { useAdminOnly } from '@/hooks/useCapability';
import { isBillEditable, isBillPayable } from '@/models/bill';
import {
  deleteBill,
  getBillById,
  getBillPayments,
  postBill,
} from '@/networks/purchases/billNetwork';
import { formatMoney } from '@/utils/money';

export default function BillDetailPage() {
  const { billId = '' } = useParams<{ billId: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canDelete = useAdminOnly('bill.delete');

  const [confirmPost, setConfirmPost] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: bill, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['bills', billId],
    queryFn: () => getBillById(billId),
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['bills', billId, 'payments'],
    queryFn: () => getBillPayments(billId),
    // A draft has never been paid; the route would only answer with an empty
    // list, and asking implies otherwise.
    enabled: Boolean(bill && bill.status !== 'draft'),
  });

  const company = useDocumentCompany();
  const vendor = useDocumentVendor(bill?.vendorId);
  const doc = useMemo(() => (bill ? billDocument(bill, company, vendor) : null), [bill, company, vendor]);

  const post = useMutation({
    mutationFn: () => postBill(billId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Bill posted', {
        description: 'Accounts payable now carries this balance.',
      });
    },
    onError: (e: Error) =>
      toast.error('Could not post bill', { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: () => deleteBill(billId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Bill deleted');
      navigate('/bills', { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not delete bill', { description: e.message }),
  });

  if (isLoading) return <DetailPageSkeleton />;

  if (isError || !bill || !doc) {
    return (
      <PageMessage
        tone={isError ? 'error' : 'notFound'}
        title={isError ? 'This bill could not be loaded' : 'Bill not found'}
        description={error instanceof Error ? error.message : 'It may have been removed.'}
        onRetry={isError ? () => refetch() : undefined}
        backTo="/bills"
        backLabel="Back to bills"
      />
    );
  }

  const editable = isBillEditable(bill.status);
  const payable = isBillPayable(bill);
  const draft = bill.status === 'draft';
  const voided = bill.status === 'void';
  const owing = !draft && !voided && bill.balance > 0;
  const due = owing ? dueLabel(bill.dueDate) : null;
  // The server refuses a delete once anything has been paid; leading with a
  // button that cannot work is worse than not offering it.
  const deletable = canDelete && bill.amountPaid === 0 && bill.status !== 'paid';

  return (
    <DetailLayout
      header={
        <PageHeader
          back={{ to: '/bills', label: 'Bills' }}
          title={bill.billNumber || 'Bill'}
          status={<StatusBadge status={bill.status} />}
          meta={[
            <Link
              key="vendor"
              to={`/vendors/${bill.vendorId}`}
              className="text-label-md text-text-primary hover:text-primary hover:underline"
            >
              {doc.party?.name || 'Vendor'}
            </Link>,
            bill.issueDate ? `Dated ${docDate(bill.issueDate)}` : null,
            bill.dueDate ? `Due ${docDate(bill.dueDate)}` : null,
          ]}
          actions={
            <>
              {editable && (
                <Button asChild variant="secondary" size="sm">
                  <Link to={`/bills/${bill.id}/edit`}>
                    <Pencil className="size-4" />
                    Edit
                  </Link>
                </Button>
              )}
              {/* Draft → open. This is what writes the AP journal entry, and it is
                  also what makes the bill payable at all. */}
              {draft && (
                <Button size="sm" onClick={() => setConfirmPost(true)} disabled={post.isPending}>
                  <CheckCircle2 className="size-4" />
                  {post.isPending ? 'Posting…' : 'Post to books'}
                </Button>
              )}
              {payable && (
                <Button asChild size="sm">
                  <Link to={`/bills/pay?vendorId=${bill.vendorId}&billId=${bill.id}`}>
                    <Banknote className="size-4" />
                    Pay bill
                  </Link>
                </Button>
              )}
              <DocumentActions
                document={doc.share}
                getPdf={() => documentPdfBlob(doc)}
                cacheKey={[bill.id, bill.updatedAt, bill.status, company.name, company.logo, vendor?.id].join('|')}
              />
              <MoreActionsMenu
                actions={[
                  { label: 'View vendor', icon: Store, to: `/vendors/${bill.vendorId}` },
                  {
                    label: 'View purchase order',
                    icon: FileText,
                    to: `/purchase-orders/${bill.purchaseOrderId}`,
                    hidden: !bill.purchaseOrderId,
                  },
                  {
                    label: 'Delete bill',
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => setConfirmDelete(true),
                    hidden: !deletable,
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
            label={voided ? 'Voided' : draft ? 'Draft total' : owing ? 'Balance due' : 'Paid in full'}
            amount={owing ? bill.balance : bill.total}
            tone={voided ? 'muted' : !draft && !owing ? 'success' : 'default'}
            note={due?.label}
            noteTone={due?.tone}
            progress={
              draft || voided
                ? undefined
                : {
                    value: bill.amountPaid,
                    total: bill.total,
                    label: 'Paid',
                    caption: `${formatMoney(bill.amountPaid)} of ${formatMoney(bill.total)} paid`,
                  }
            }
          >
            {draft && (
              <p className="mt-xs text-caption text-text-secondary">
                Not posted to accounts payable yet, so it cannot be paid.
              </p>
            )}
          </AmountSummary>

          <PartyCard
            title="Vendor"
            to={`/vendors/${bill.vendorId}`}
            party={doc.party}
            loading={!vendor}
            extra={
              vendor
                ? [{ label: 'Owed to vendor', value: formatMoney(vendor.balance), hidden: vendor.balance === 0 }]
                : []
            }
          />

          {!draft && (
            <RailSection title="Payments">
              {paymentsLoading ? (
                <p className="text-body-sm text-text-tertiary">Loading payments…</p>
              ) : payments.length === 0 ? (
                <p className="text-body-sm text-text-tertiary">Nothing paid against this bill yet.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border-light">
                  {payments.map((p) => (
                    <li key={p.id} className="flex flex-col gap-xxs py-xs first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-sm">
                        <div className="min-w-0">
                          <p className="truncate text-label-md text-text-primary">{p.reference || 'Payment'}</p>
                          <p className="text-caption text-text-secondary">
                            {[docDate(p.date), p.method, p.bankAccountName ? `from ${p.bankAccountName}` : '']
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-label-md text-success tabular">{formatMoney(p.appliedAmount)}</p>
                          {/* A payment can settle several bills at once; showing only
                              this bill's share without saying so would make the
                              numbers look wrong against the bank. */}
                          {p.allocations.length > 1 && (
                            <p className="text-caption text-text-tertiary tabular">
                              of {formatMoney(p.totalAmount)} · {p.allocations.length} bills
                            </p>
                          )}
                        </div>
                      </div>
                      <ProofLink proofId={p.proofId} fileName={p.proofFileName} mimeType={p.proofMimeType} />
                    </li>
                  ))}
                </ul>
              )}
            </RailSection>
          )}

          <RailSection title="Details">
            <KeyValueList
              items={[
                { label: 'Bill #', value: bill.billNumber || '—' },
                {
                  label: 'Purchase order',
                  value: (
                    <Link to={`/purchase-orders/${bill.purchaseOrderId}`} className="text-primary hover:underline">
                      View order
                    </Link>
                  ),
                  hidden: !bill.purchaseOrderId,
                },
                { label: 'Created', value: docDate(bill.createdAt), hidden: !bill.createdAt },
                { label: 'Last updated', value: docDate(bill.updatedAt), hidden: !bill.updatedAt },
              ]}
            />
          </RailSection>
        </>
      }
    >
      {draft && (
        <div className="rounded-md border border-border bg-surface-2 p-md">
          <p className="text-body-sm text-text-secondary">
            This bill is a draft. Nothing has been posted to accounts payable and it cannot be
            paid until you post it.
          </p>
        </div>
      )}

      <DocumentPaper doc={doc} />

      <ConfirmDialog
        open={confirmPost}
        onOpenChange={setConfirmPost}
        title="Post this bill?"
        description={`${formatMoney(bill.total)} will be posted to accounts payable against ${
          doc.party?.name || 'this vendor'
        }. Once posted the bill can no longer be edited.`}
        confirmLabel="Post to books"
        busy={post.isPending}
        onConfirm={() => post.mutate()}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this bill?"
        description="This cannot be undone. A bill with any payment against it will be refused by the server."
        confirmLabel="Delete bill"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </DetailLayout>
  );
}
