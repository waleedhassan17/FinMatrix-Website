import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Banknote, Link2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DocumentView } from '@/features/documents/DocumentView';
import { ApplyCreditDialog } from '@/features/creditMemos/ApplyCreditDialog';
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

  const { data: memo, isLoading, isError, error } = useQuery({
    queryKey: ['credit-memos', creditMemoId],
    queryFn: () => getCreditMemoById(creditMemoId),
  });

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

  if (isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading credit memo…</p>;
  }

  if (isError || !memo) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Credit memo not found</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          {error instanceof Error ? error.message : 'It may have been deleted.'}
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/credit-memos">Back to credit memos</Link>
        </Button>
      </Card>
    );
  }

  const busy = apply.isPending || refund.isPending || doVoid.isPending;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/credit-memos">
          <ArrowLeft className="size-4" />
          Credit memos
        </Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-md">
        <div className="flex items-center gap-sm">
          <h1 className="text-h2 text-text-primary">
            {memo.creditMemoNumber || 'Credit memo'}
          </h1>
          <StatusBadge status={memo.status} />
        </div>

        <div className="flex flex-wrap gap-xs">
          {canApply(memo) && (
            <Button onClick={() => setApplyOpen(true)} disabled={busy}>
              <Link2 className="size-4" />
              {cap.submitLabel('Apply to invoice')}
            </Button>
          )}

          {canRefund(memo) && (
            <Button variant="secondary" onClick={() => setRefundOpen(true)} disabled={busy}>
              <Banknote className="size-4" />
              {cap.submitLabel('Refund remaining')}
            </Button>
          )}

          {/* Disappears the moment any of the credit has been consumed — the
              server refuses with ALREADY_APPLIED, so a disabled button would
              only invite the question. */}
          {canVoid(memo) && (
            <Button variant="danger" onClick={() => setVoidOpen(true)} disabled={busy}>
              <Ban className="size-4" />
              {cap.submitLabel('Void')}
            </Button>
          )}

          {canRemove && canDelete(memo) && (
            <Button variant="text" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {cap.needsApproval && canApply(memo) && (
        <p className="rounded-md bg-primary-tint p-md text-body-sm text-text-primary">
          Applying, refunding or voiding a credit all go to the owner for
          approval. Nothing changes on this memo until they act.
        </p>
      )}

      <Card className="p-lg">
        <div className="grid gap-lg sm:grid-cols-3">
          <Figure label="Credit total" value={formatMoney(memo.total)} />
          <Figure label="Applied" value={formatMoney(memo.amountApplied)} />
          <Figure
            label="Available"
            value={formatMoney(memo.balance)}
            tone={memo.balance > 0 ? 'success' : undefined}
          />
        </div>
      </Card>

      <DocumentView
        title="Credit memo"
        counterpartyLabel="Credit for"
        counterpartyName={memo.customerName}
        meta={[
          ['Credit memo #', memo.creditMemoNumber || '—'],
          ['Date', memo.date || '—'],
        ]}
        lines={memo.lines}
        subtotal={memo.subtotal}
        // Credit memos have no discount concept at all.
        discountType="none"
        discountValue={0}
        discountAmount={0}
        taxAmount={memo.taxAmount}
        total={memo.total}
        extraTotals={[
          { label: 'Applied', value: memo.amountApplied },
          {
            label: 'Available',
            value: memo.balance,
            strong: true,
            dividerBefore: true,
            tone: memo.balance > 0 ? 'success' : undefined,
          },
        ]}
        notes={memo.reason}
      />

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
            This pays <strong>{formatMoney(memo.balance)}</strong> — the whole
            remaining balance — back to the customer in cash. There is no partial
            refund, the money comes out of account 1000 Cash, and it posts dated
            today rather than the memo&rsquo;s date.
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
