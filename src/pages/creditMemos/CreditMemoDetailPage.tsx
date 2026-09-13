import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Banknote, FileText, Link2, Trash2, Users } from 'lucide-react';
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
import { ApplyCreditDialog } from '@/features/creditMemos/ApplyCreditDialog';
import { AmountSummary } from '@/features/documents/AmountSummary';
import { creditMemoDocument } from '@/features/documents/documentBuilders';
import { docDate } from '@/features/documents/documentModel';
import { DocumentPaper } from '@/features/documents/DocumentPaper';
import { documentPdfBlob } from '@/features/documents/documentPdf';
import { PartyCard } from '@/features/documents/PartyCard';
import { useDocumentCompany, useDocumentCustomer } from '@/features/documents/useDocumentContext';
import { DocumentActions } from '@/features/share/DocumentActions';
import { useAdminOnly, useCapability } from '@/hooks/useCapability';
import { canApply, canDelete, canRefund, canVoid } from '@/models/creditMemo';
import {
  applyCreditMemo,
  deleteCreditMemo,
  getCreditMemoById,
  refundCreditMemo,
  voidCreditMemo,
  type CreditMemoWriteResult,
} from '@/networks/sales/creditMemoNetwork';
import { formatMoney } from '@/utils/money';

export default function CreditMemoDetailPage() {
  const { creditMemoId = '' } = useParams<{ creditMemoId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const cap = useCapability('creditMemo.manage');
  const canRemove = useAdminOnly('creditMemo.delete');

  const [applyOpen, setApplyOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: memo, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['credit-memos', creditMemoId],
    queryFn: () => getCreditMemoById(creditMemoId),
  });

  const company = useDocumentCompany();
  const customer = useDocumentCustomer(memo?.customerId);
  const doc = useMemo(
    () => (memo ? creditMemoDocument(memo, company, customer) : null),
    [memo, company, customer],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['credit-memos'] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  /**
   * Every one of these four actions is maker-checker for staff, so each can
   * come back as a pending approval instead of a result — including the three
   * that return HTTP 200 rather than 201.
   */
  const settle = (
    result: CreditMemoWriteResult,
    doneMessage: string,
    pendingMessage: string,
    close: () => void,
  ) => {
    close();
    if (result.pending) {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      toast.success('Sent for approval', { description: pendingMessage });
      navigate('/my-requests');
      return;
    }
    invalidate();
    toast.success(doneMessage);
  };

  const apply = useMutation({
    mutationFn: ({ invoiceId, amount }: { invoiceId: string; amount: string }) =>
      applyCreditMemo(creditMemoId, invoiceId, amount),
    onSuccess: (r) =>
      settle(r, 'Credit applied', 'Nothing is applied until the owner approves.', () =>
        setApplyOpen(false),
      ),
    onError: (e: Error) =>
      toast.error('Could not apply credit', { description: e.message }),
  });

  const refund = useMutation({
    mutationFn: () => refundCreditMemo(creditMemoId),
    onSuccess: (r) =>
      settle(r, 'Refund recorded', 'No cash leaves until the owner approves.', () =>
        setRefundOpen(false),
      ),
    onError: (e: Error) =>
      toast.error('Could not refund credit', { description: e.message }),
  });

  const doVoid = useMutation({
    mutationFn: () => voidCreditMemo(creditMemoId),
    onSuccess: (r) =>
      settle(r, 'Credit memo voided', 'Nothing is reversed until the owner approves.', () =>
        setVoidOpen(false),
      ),
    onError: (e: Error) =>
      toast.error('Could not void credit memo', { description: e.message }),
  });

  const doDelete = useMutation({
    mutationFn: () => deleteCreditMemo(creditMemoId),
    onSuccess: () => {
      invalidate();
      toast.success('Credit memo deleted');
      navigate('/credit-memos', { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not delete credit memo', { description: e.message }),
  });

  if (isLoading) return <DetailPageSkeleton />;

  if (isError || !memo || !doc) {
    return (
      <PageMessage
        tone={isError ? 'error' : 'notFound'}
        title={isError ? 'This credit memo could not be loaded' : 'Credit memo not found'}
        description={error instanceof Error ? error.message : 'It may have been deleted.'}
        onRetry={isError ? () => refetch() : undefined}
        backTo="/credit-memos"
        backLabel="Back to credit memos"
      />
    );
  }

  const busy = apply.isPending || refund.isPending || doVoid.isPending;
  const voided = memo.status === 'void';

  return (
    <DetailLayout
      header={
        <PageHeader
          back={{ to: '/credit-memos', label: 'Credit memos' }}
          title={memo.creditMemoNumber || 'Credit memo'}
          status={<StatusBadge status={memo.status} />}
          meta={[
            <Link
              key="customer"
              to={`/customers/${memo.customerId}`}
              className="text-label-md text-text-primary hover:text-primary hover:underline"
            >
              {doc.party?.name || 'Customer'}
            </Link>,
            memo.date ? `Dated ${docDate(memo.date)}` : null,
          ]}
          actions={
            <>
              {canApply(memo) && (
                <Button size="sm" onClick={() => setApplyOpen(true)} disabled={busy}>
                  <Link2 className="size-4" />
                  {cap.submitLabel('Apply to invoice')}
                </Button>
              )}

              <DocumentActions
                document={doc.share}
                getPdf={() => documentPdfBlob(doc)}
                cacheKey={[memo.id, memo.updatedAt, memo.status, company.name, company.logo, customer?.id].join('|')}
              />

              <MoreActionsMenu
                actions={[
                  { label: 'View customer', icon: Users, to: `/customers/${memo.customerId}` },
                  {
                    label: 'View original invoice',
                    icon: FileText,
                    to: `/invoices/${memo.originalInvoiceId}`,
                    hidden: !memo.originalInvoiceId,
                  },
                  {
                    label: cap.submitLabel('Refund remaining credit'),
                    icon: Banknote,
                    onSelect: () => setRefundOpen(true),
                    hidden: !canRefund(memo),
                    disabled: busy,
                  },
                  {
                    // Disappears the moment any of the credit has been consumed —
                    // the server refuses with ALREADY_APPLIED.
                    label: cap.submitLabel('Void credit memo'),
                    icon: Ban,
                    destructive: true,
                    onSelect: () => setVoidOpen(true),
                    hidden: !canVoid(memo),
                    disabled: busy,
                  },
                  {
                    label: 'Delete credit memo',
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => setDeleteOpen(true),
                    hidden: !(canRemove && canDelete(memo)),
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
            label={voided ? 'Voided' : 'Available credit'}
            amount={voided ? memo.total : memo.balance}
            tone={voided ? 'muted' : memo.balance > 0 ? 'success' : 'default'}
            progress={
              voided
                ? undefined
                : {
                    value: memo.amountApplied,
                    total: memo.total,
                    label: 'Applied',
                    tone: 'primary',
                    caption: `${formatMoney(memo.amountApplied)} of ${formatMoney(memo.total)} applied`,
                  }
            }
          />

          <PartyCard
            title="Customer"
            to={`/customers/${memo.customerId}`}
            party={doc.party}
            loading={!customer}
          />

          <RailSection title="Details">
            <KeyValueList
              items={[
                { label: 'Credit memo #', value: memo.creditMemoNumber || '—' },
                {
                  label: 'Original invoice',
                  value: (
                    <Link to={`/invoices/${memo.originalInvoiceId}`} className="text-primary hover:underline">
                      View invoice
                    </Link>
                  ),
                  hidden: !memo.originalInvoiceId,
                },
                { label: 'Created', value: docDate(memo.createdAt), hidden: !memo.createdAt },
                { label: 'Last updated', value: docDate(memo.updatedAt), hidden: !memo.updatedAt },
              ]}
            />
          </RailSection>
        </>
      }
    >
      {cap.needsApproval && canApply(memo) && (
        <p className="rounded-md bg-primary-tint p-md text-body-sm text-text-primary">
          Applying, refunding or voiding a credit all go to the owner for approval. Nothing changes
          on this memo until they act.
        </p>
      )}

      <DocumentPaper doc={doc} />

      <ApplyCreditDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        customerId={memo.customerId}
        creditBalance={memo.balance}
        busy={apply.isPending}
        onSubmit={(invoiceId, amount) => apply.mutate({ invoiceId, amount })}
      />

      <ConfirmDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        title="Refund the remaining credit?"
        description={
          <>
            This pays <strong>{formatMoney(memo.balance)}</strong> — the whole remaining balance —
            back to the customer in cash. There is no partial refund, the money comes out of account
            1000 Cash, and it posts dated today rather than the memo&rsquo;s date.
          </>
        }
        confirmLabel={cap.submitLabel('Refund in full')}
        busy={refund.isPending}
        onConfirm={() => refund.mutate()}
      />

      <ConfirmDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title="Void this credit memo?"
        description="The credit is reversed and any restocked goods are pulled back out of inventory. This fails if those goods have already been sold on."
        confirmLabel={cap.submitLabel('Void credit memo')}
        destructive
        busy={doVoid.isPending}
        onConfirm={() => doVoid.mutate()}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this credit memo?"
        description="The memo and its lines are removed permanently."
        confirmLabel="Delete permanently"
        destructive
        busy={doDelete.isPending}
        onConfirm={() => doDelete.mutate()}
      />
    </DetailLayout>
  );
}
