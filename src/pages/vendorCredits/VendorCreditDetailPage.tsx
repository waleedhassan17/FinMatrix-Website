import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Link2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DocumentView } from '@/features/documents/DocumentView';
import { useVendorOptions } from '@/features/documents/useDocumentPickers';
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
  } = useQuery({
    queryKey: ['vendor-credits', vendorCreditId],
    queryFn: () => getVendorCreditById(vendorCreditId),
  });

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

  if (isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading vendor credit…</p>;
  }

  if (isError || !credit) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Vendor credit not found</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          {error instanceof Error ? error.message : 'It may have been deleted.'}
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/vendor-credits">Back to vendor credits</Link>
        </Button>
      </Card>
    );
  }

  const busy = apply.isPending || doVoid.isPending;

  /**
   * A credit line carries a net `amount` and its own `taxRate`; DocumentView
   * speaks DocumentLine. Rate is zeroed and the quantity column is hidden — the
   * same path bills take, since neither document has a unit rate to show.
   */
  const viewLines = credit.lines.map((line) => ({
    id: line.id,
    itemId: line.itemId,
    itemName: line.itemName,
    description: line.description,
    quantity: line.quantity,
    unitPrice: 0,
    taxRate: line.taxRate,
    amount: line.amount,
  }));

  /**
   * `GET /vendor-credits/:id` returns the bare entity — the server injects
   * `vendorName` on the LIST only and does not load the vendor relation here.
   * So the name comes from the picker cache, which is already warm from the
   * list, rather than showing an empty heading.
   */
  const vendorName =
    credit.vendorName || vendorsById.get(credit.vendorId)?.name || '—';

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/vendor-credits">
          <ArrowLeft className="size-4" />
          Vendor credits
        </Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-md">
        <div className="flex items-center gap-sm">
          <h1 className="text-h2 text-text-primary">
            {credit.vendorCreditNumber || 'Vendor credit'}
          </h1>
          <StatusBadge status={credit.status} />
        </div>

        <div className="flex flex-wrap gap-xs">
          {canApply(credit) && (
            <Button onClick={() => setApplyOpen(true)} disabled={busy}>
              <Link2 className="size-4" />
              {cap.submitLabel('Apply to bill')}
            </Button>
          )}

          {/* Disappears the moment any of the credit has been consumed — the
              server refuses with ALREADY_APPLIED, so a disabled button would
              only invite the question. */}
          {canVoid(credit) && (
            <Button variant="danger" onClick={() => setVoidOpen(true)} disabled={busy}>
              <Ban className="size-4" />
              {cap.submitLabel('Void')}
            </Button>
          )}

          {canRemove && canDelete(credit) && (
            <Button variant="text" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {cap.needsApproval && canApply(credit) && (
        <p className="rounded-md bg-primary-tint p-md text-body-sm text-text-primary">
          Applying or voiding a credit both go to the owner for approval. Nothing
          changes on this credit until they act.
        </p>
      )}

      <Card className="p-lg">
        <div className="grid gap-lg sm:grid-cols-3">
          <Figure label="Credit total" value={formatMoney(credit.total)} />
          <Figure label="Applied" value={formatMoney(credit.amountApplied)} />
          <Figure
            label="Available"
            value={formatMoney(credit.balance)}
            tone={credit.balance > 0 ? 'success' : undefined}
          />
        </div>
      </Card>

      <DocumentView
        title="Vendor credit"
        counterpartyLabel="Credit from"
        counterpartyName={vendorName}
        meta={[
          ['Vendor credit #', credit.vendorCreditNumber || '—'],
          ['Date', credit.date || '—'],
        ]}
        lines={viewLines}
        // total = subtotal + taxAmount. The tax is the input tax originally
        // claimed on the bill, credited back out of Sales Tax Recoverable —
        // real money the supplier owes, not a presentational figure.
        subtotal={credit.subtotal}
        discountType="none"
        discountValue={0}
        discountAmount={0}
        taxAmount={credit.taxAmount}
        total={credit.total}
        showQuantity={false}
        extraTotals={[
          { label: 'Applied', value: credit.amountApplied },
          {
            label: 'Available',
            value: credit.balance,
            strong: true,
            dividerBefore: true,
            tone: credit.balance > 0 ? 'success' : undefined,
          },
        ]}
        notes={credit.reason}
      />

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
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success';
}) {
  return (
    <div>
      <p className="text-caption text-text-secondary">{label}</p>
      <p
        className={`mt-xxs text-h3 tabular ${
          tone === 'success' ? 'text-success' : 'text-text-primary'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
