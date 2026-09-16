import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, ReceiptText, RotateCcw, Users } from 'lucide-react';
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
import { docDate } from '@/features/documents/documentModel';
import { DocumentPaper } from '@/features/documents/DocumentPaper';
import { documentPdfBlob } from '@/features/documents/documentPdf';
import { PartyCard } from '@/features/documents/PartyCard';
import { paymentReceiptDocument } from '@/features/documents/receiptBuilders';
import { useDocumentCompany, useDocumentCustomer } from '@/features/documents/useDocumentContext';
import { invalidateAfterPosting } from '@/features/documents/invalidateAfterPosting';
import { ApplyAdvanceDialog } from '@/features/payments/ApplyAdvanceDialog';
import { DocumentActions } from '@/features/share/DocumentActions';
import { useAdminOnly, useCapability } from '@/hooks/useCapability';
import { paymentMethodLabel } from '@/models/payment';
import { deletePayment, getPaymentById } from '@/networks/sales/paymentNetwork';
import { formatMoney } from '@/utils/money';

export default function PaymentDetailPage() {
  const { paymentId = '' } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canDelete = useAdminOnly('payment.delete');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const applyCap = useCapability('payment.receive');

  const { data: payment, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['payments', paymentId],
    queryFn: () => getPaymentById(paymentId),
  });

  const company = useDocumentCompany();
  const customer = useDocumentCustomer(payment?.customerId);
  const doc = useMemo(
    () => (payment ? paymentReceiptDocument(payment, company, customer) : null),
    [payment, company, customer],
  );

  const doDelete = useMutation({
    mutationFn: () => deletePayment(paymentId),
    onSuccess: () => {
      invalidateAfterPosting(queryClient);
      toast.success('Payment reversed', {
        description: 'The invoices it settled are open again.',
      });
      navigate('/payments', { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not reverse payment', { description: e.message }),
  });

  if (isLoading) return <DetailPageSkeleton />;

  if (isError || !payment || !doc) {
    return (
      <PageMessage
        tone={isError ? 'error' : 'notFound'}
        title={isError ? 'This payment could not be loaded' : 'Payment not found'}
        description={error instanceof Error ? error.message : 'It may have been reversed.'}
        onRetry={isError ? () => refetch() : undefined}
        backTo="/payments"
        backLabel="Back to payments"
      />
    );
  }

  return (
    <DetailLayout
      header={
        <PageHeader
          back={{ to: '/payments', label: 'Payments' }}
          title={doc.number}
          status={
            payment.unapplied > 0 ? (
              <StatusBadge status="partial" label="Advance held" />
            ) : (
              <StatusBadge status="paid" label="Applied" />
            )
          }
          meta={[
            <Link
              key="customer"
              to={`/customers/${payment.customerId}`}
              className="text-label-md text-text-primary hover:text-primary hover:underline"
            >
              {doc.party?.name || 'Customer'}
            </Link>,
            payment.paymentDate ? `Received ${docDate(payment.paymentDate)}` : null,
            paymentMethodLabel(payment.paymentMethod),
          ]}
          actions={
            <>
              {payment.unapplied > 0 && applyCap.allowed && (
                <Button onClick={() => setApplyOpen(true)}>
                  <ReceiptText className="size-4" />
                  {applyCap.submitLabel('Apply to invoices')}
                </Button>
              )}
              <DocumentActions
                document={doc.share}
                getPdf={() => documentPdfBlob(doc)}
                cacheKey={[payment.id, payment.amount, payment.allocated, company.name, company.logo, customer?.id].join('|')}
              />
              <MoreActionsMenu
                actions={[
                  { label: 'View customer', icon: Users, to: `/customers/${payment.customerId}` },
                  {
                    // Admin only. DELETE /payments/:id is @Roles('admin') with no
                    // approval path, so staff cannot reverse a payment or request it.
                    label: 'Reverse payment',
                    icon: RotateCcw,
                    destructive: true,
                    onSelect: () => setDeleteOpen(true),
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
            label="Amount received"
            amount={payment.amount}
            tone="success"
            note={payment.unapplied > 0 ? `${formatMoney(payment.unapplied)} held as customer advance` : undefined}
            noteTone="warning"
            progress={{
              value: payment.allocated,
              total: payment.amount,
              label: 'Applied',
              tone: 'primary',
              caption: `${formatMoney(payment.allocated)} applied to invoices`,
            }}
          />

          <PartyCard
            title="Customer"
            to={`/customers/${payment.customerId}`}
            party={doc.party}
            loading={!customer}
          />

          <RailSection title="Applied to">
            {payment.applications.length === 0 ? (
              <p className="text-body-sm text-text-tertiary">
                Nothing was applied — the whole amount is held as a customer advance.
              </p>
            ) : (
              <ul className="-mx-sm flex flex-col">
                {payment.applications.map((a) => (
                  <li key={`${a.invoiceId}-${a.appliedOn}`}>
                    <Link
                      to={`/invoices/${a.invoiceId}`}
                      className="flex items-center justify-between gap-sm rounded-md px-sm py-xs hover:bg-surface-hover"
                    >
                      <span className="inline-flex min-w-0 items-center gap-xs text-label-md text-text-primary">
                        <FileText className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                        <span className="truncate">{a.invoiceNumber || a.invoiceId.slice(0, 8)}</span>
                      </span>
                      <span className="flex flex-col items-end">
                        <span className="text-label-md text-text-primary tabular">{formatMoney(a.amountApplied)}</span>
                        {a.appliedOn && (
                          <span className="text-caption text-text-tertiary">Applied {docDate(a.appliedOn)}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </RailSection>

          <RailSection title="Details">
            <KeyValueList
              items={[
                { label: 'Method', value: paymentMethodLabel(payment.paymentMethod) },
                { label: 'Reference', value: payment.reference || '—' },
                { label: 'Date', value: docDate(payment.paymentDate) || '—' },
              ]}
            />
          </RailSection>
        </>
      }
    >
      <DocumentPaper doc={doc} />

      <ApplyAdvanceDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        customerId={payment.customerId}
        payment={{ id: payment.id, label: doc.number, unapplied: payment.unapplied }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Reverse this payment?"
        description="Every invoice it settled reopens, the customer's balance is restored and a reversing journal entry is posted. This cannot be undone, and it is refused if the payment sits inside a completed bank reconciliation."
        confirmLabel="Reverse payment"
        destructive
        busy={doDelete.isPending}
        onConfirm={() => doDelete.mutate()}
      />
    </DetailLayout>
  );
}
