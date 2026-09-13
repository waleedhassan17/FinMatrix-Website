import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, FileText, Link2, Store, Trash2 } from 'lucide-react';
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
import { vendorCreditDocument } from '@/features/documents/documentBuilders';
import { docDate } from '@/features/documents/documentModel';
import { DocumentPaper } from '@/features/documents/DocumentPaper';
import { documentPdfBlob } from '@/features/documents/documentPdf';
import { PartyCard } from '@/features/documents/PartyCard';
import { useDocumentCompany, useDocumentVendor } from '@/features/documents/useDocumentContext';
import { useVendorOptions } from '@/features/documents/useDocumentPickers';
import { DocumentActions } from '@/features/share/DocumentActions';
import { ApplyToBillDialog } from '@/features/vendorCredits/ApplyToBillDialog';
import { useAdminOnly, useCapability } from '@/hooks/useCapability';
import { canApply, canDelete, canVoid } from '@/models/vendorCredit';
import {
  applyVendorCredit,
  deleteVendorCredit,
  getVendorCreditById,
  voidVendorCredit,
  type VendorCreditWriteResult,
} from '@/networks/purchases/vendorCreditNetwork';
import { formatMoney } from '@/utils/money';

export default function VendorCreditDetailPage() {
  const { vendorCreditId = '' } = useParams<{ vendorCreditId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const cap = useCapability('vendorCredit.manage');
  const canRemove = useAdminOnly('vendorCredit.delete');
  const { byId: vendorsById } = useVendorOptions();

  const [applyOpen, setApplyOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const {
    data: credit,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['vendor-credits', vendorCreditId],
    queryFn: () => getVendorCreditById(vendorCreditId),
  });

  const company = useDocumentCompany();
  const vendor = useDocumentVendor(credit?.vendorId);

  /**
   * `GET /vendor-credits/:id` returns the bare entity — the server injects
   * `vendorName` on the LIST only and does not load the vendor relation here.
   * So the name comes from the vendor record or the picker cache, which is
   * already warm from the list, rather than showing an empty heading.
   */
  const vendorName =
    credit?.vendorName || vendor?.name || (credit ? vendorsById.get(credit.vendorId)?.name : '') || '';

  const doc = useMemo(
    () => (credit ? vendorCreditDocument({ ...credit, vendorName }, company, vendor) : null),
    [credit, vendorName, company, vendor],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['vendor-credits'] });
    // Applying a credit moves a bill's balance, so the AP lists are stale too.
    queryClient.invalidateQueries({ queryKey: ['bills'] });
    queryClient.invalidateQueries({ queryKey: ['vendors'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  /**
   * Create, apply and void are all maker-checker for staff, so each can come
   * back as a pending approval instead of a result — including the two that
   * return HTTP 200 rather than 201.
   */
  const settle = (
    result: VendorCreditWriteResult,
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
    mutationFn: ({ billId, amount }: { billId: string; amount: string }) =>
      applyVendorCredit(vendorCreditId, billId, amount),
    onSuccess: (r) =>
      settle(r, 'Credit applied', 'Nothing is applied until the owner approves.', () =>
        setApplyOpen(false),
      ),
    onError: (e: Error) =>
      toast.error('Could not apply credit', { description: e.message }),
  });

  const doVoid = useMutation({
    mutationFn: () => voidVendorCredit(vendorCreditId),
    onSuccess: (r) =>
      settle(
        r,
        'Vendor credit voided',
        'Nothing is reversed until the owner approves.',
        () => setVoidOpen(false),
      ),
    onError: (e: Error) =>
      toast.error('Could not void vendor credit', { description: e.message }),
  });

  const doDelete = useMutation({
    mutationFn: () => deleteVendorCredit(vendorCreditId),
    onSuccess: () => {
      invalidate();
      toast.success('Vendor credit deleted');
      navigate('/vendor-credits', { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not delete vendor credit', { description: e.message }),
  });

  if (isLoading) return <DetailPageSkeleton />;

  if (isError || !credit || !doc) {
    return (
      <PageMessage
        tone={isError ? 'error' : 'notFound'}
        title={isError ? 'This vendor credit could not be loaded' : 'Vendor credit not found'}
        description={error instanceof Error ? error.message : 'It may have been deleted.'}
        onRetry={isError ? () => refetch() : undefined}
        backTo="/vendor-credits"
        backLabel="Back to vendor credits"
      />
    );
  }

  const busy = apply.isPending || doVoid.isPending;
  const voided = credit.status === 'void';

  return (
    <DetailLayout
      header={
        <PageHeader
          back={{ to: '/vendor-credits', label: 'Vendor credits' }}
          title={credit.vendorCreditNumber || 'Vendor credit'}
          status={<StatusBadge status={credit.status} />}
          meta={[
            <Link
              key="vendor"
              to={`/vendors/${credit.vendorId}`}
              className="text-label-md text-text-primary hover:text-primary hover:underline"
            >
              {vendorName || 'Vendor'}
            </Link>,
            credit.date ? `Dated ${docDate(credit.date)}` : null,
          ]}
          actions={
            <>
              {canApply(credit) && (
                <Button size="sm" onClick={() => setApplyOpen(true)} disabled={busy}>
                  <Link2 className="size-4" />
                  {cap.submitLabel('Apply to bill')}
                </Button>
              )}

              <DocumentActions
                document={doc.share}
                getPdf={() => documentPdfBlob(doc)}
                cacheKey={[credit.id, credit.updatedAt, credit.status, company.name, company.logo, vendor?.id].join('|')}
              />

              <MoreActionsMenu
                actions={[
                  { label: 'View vendor', icon: Store, to: `/vendors/${credit.vendorId}` },
                  {
                    label: 'View original bill',
                    icon: FileText,
                    to: `/bills/${credit.originalBillId}`,
                    hidden: !credit.originalBillId,
                  },
                  {
                    // Disappears the moment any of the credit has been consumed —
                    // the server refuses with ALREADY_APPLIED.
                    label: cap.submitLabel('Void vendor credit'),
                    icon: Ban,
                    destructive: true,
                    onSelect: () => setVoidOpen(true),
                    hidden: !canVoid(credit),
                    disabled: busy,
                  },
                  {
                    label: 'Delete vendor credit',
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => setDeleteOpen(true),
                    hidden: !(canRemove && canDelete(credit)),
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
            amount={voided ? credit.total : credit.balance}
            tone={voided ? 'muted' : credit.balance > 0 ? 'success' : 'default'}
            progress={
              voided
                ? undefined
                : {
                    value: credit.amountApplied,
                    total: credit.total,
                    label: 'Applied',
                    tone: 'primary',
                    caption: `${formatMoney(credit.amountApplied)} of ${formatMoney(credit.total)} applied`,
                  }
            }
          />

          <PartyCard
            title="Vendor"
            to={`/vendors/${credit.vendorId}`}
            party={doc.party}
            loading={!vendor}
          />

          <RailSection title="Details">
            <KeyValueList
              items={[
                { label: 'Vendor credit #', value: credit.vendorCreditNumber || '—' },
                {
                  label: 'Original bill',
                  value: (
                    <Link to={`/bills/${credit.originalBillId}`} className="text-primary hover:underline">
                      View bill
                    </Link>
                  ),
                  hidden: !credit.originalBillId,
                },
                { label: 'Created', value: docDate(credit.createdAt), hidden: !credit.createdAt },
                { label: 'Last updated', value: docDate(credit.updatedAt), hidden: !credit.updatedAt },
              ]}
            />
          </RailSection>
        </>
      }
    >
      {cap.needsApproval && canApply(credit) && (
        <p className="rounded-md bg-primary-tint p-md text-body-sm text-text-primary">
          Applying or voiding a credit both go to the owner for approval. Nothing changes on this
          credit until they act.
        </p>
      )}

      <DocumentPaper doc={doc} />

      <ApplyToBillDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        vendorId={credit.vendorId}
        creditBalance={credit.balance}
        busy={apply.isPending}
        onSubmit={(billId, amount) => apply.mutate({ billId, amount })}
      />

      <ConfirmDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title="Void this vendor credit?"
        description="The credit is reversed, and any goods it put back on the shelf are pulled out of stock again. This fails if those goods have already been sold on."
        confirmLabel={cap.submitLabel('Void vendor credit')}
        destructive
        busy={doVoid.isPending}
        onConfirm={() => doVoid.mutate()}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this vendor credit?"
        description="The credit and its lines are removed permanently."
        confirmLabel="Delete permanently"
        destructive
        busy={doDelete.isPending}
        onConfirm={() => doDelete.mutate()}
      />
    </DetailLayout>
  );
}
