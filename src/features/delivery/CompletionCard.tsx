import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, FileMinus, Undo2, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BillPhotoButton } from '@/features/delivery/BillPhotoButton';
import { invalidateDeliveries } from '@/features/delivery/invalidateDeliveries';
import { useRole } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import {
  PAID_STATUS_LABELS,
  REVIEW_REASON_MIN,
  cashCountError,
  completionActions,
  completionSettlement,
  completionUnits,
  formatWhen,
  reviewerLabel,
  type Completion,
} from '@/models/delivery';
import {
  approveCompletion,
  rejectCompletion,
  undoCompletion,
} from '@/networks/delivery/completionsNetwork';
import { formatMoney, toDecimal } from '@/utils/money';

const STATUS_LABEL: Record<Completion['status'], string> = {
  pending: 'Awaiting sign-off',
  approved: 'Approved',
  rejected: 'Rejected',
};

type Dialog = 'approve' | 'reject' | 'undo' | null;

/**
 * One rider's completion: what was delivered, what came back, the signed bill,
 * and — the point of the screen — who may sign it off.
 *
 * The capability split lives in `completionActions`, not here:
 *   owner   Approve (recognises the sale) · Reject
 *   staff   "Waiting for Admin Approval" where Approve would be · Reject
 * The waiting state is a statement, not a disabled button: a greyed-out
 * Approve reads as "try again later", which is wrong — someone else signs this.
 *
 * Once approved, a posted sale is corrected with a credit memo prefilled from
 * the delivery (the server refuses to undo it); only a delivery that never
 * posted a sale can be undone.
 */
export function CompletionCard({
  completion: c,
  riderName,
  reference,
  highlight = false,
  showDeliveryLink = true,
}: {
  completion: Completion;
  riderName?: string;
  /**
   * The delivery's own reference. Completions filed through the older JSON
   * route carry none of their own, and "Delivery" is no way to tell two apart.
   */
  reference?: string;
  highlight?: boolean;
  showDeliveryLink?: boolean;
}) {
  const role = useRole();
  const queryClient = useQueryClient();
  const actions = completionActions(role, c);
  const units = completionUnits(c);
  const [dialog, setDialog] = useState<Dialog>(null);
  // The owner's count of the cash the rider handed in; starts at the rider's figure.
  const [cashText, setCashText] = useState('');
  const collectsAtDoor = c.amountDue > 0.005;
  const cashError = collectsAtDoor ? cashCountError(cashText, c.amountDue) : undefined;
  const counted = collectsAtDoor && !cashError ? toDecimal(cashText.replace(/[,\s]/g, '')).toNumber() : undefined;
  const settled = completionSettlement(c, dialog === 'approve' ? counted : undefined);

  const done = () => {
    invalidateDeliveries(queryClient);
    setDialog(null);
  };

  const approve = useMutation({
    // The count goes to the server only when it differs from the rider's figure;
    // the server then records both on the audit trail.
    mutationFn: () =>
      approveCompletion(
        c.id,
        counted !== undefined && Math.abs(counted - c.amountCollected) > 0.005
          ? { amountCollected: counted.toFixed(2) }
          : {},
      ),
    onSuccess: () => {
      done();
      toast.success('Delivery approved', {
        description: `${formatMoney(c.saleAmount)} recognised as a sale.`,
      });
    },
    onError: (e: Error) => toast.error('Could not approve', { description: e.message }),
  });

  const reject = useMutation({
    mutationFn: (reason: string) => rejectCompletion(c.id, reason),
    onSuccess: () => {
      done();
      toast.success('Completion rejected', {
        description: 'The stock is back on the shelf. No sale was recorded.',
      });
    },
    onError: (e: Error) => toast.error('Could not reject', { description: e.message }),
  });

  const undo = useMutation({
    mutationFn: (reason?: string) => undoCompletion(c.id, reason),
    onSuccess: (result) => {
      done();
      if (result.pending) {
        toast.success('Sent for approval', {
          description: 'The owner decides whether to undo it. Nothing has changed yet.',
        });
        return;
      }
      toast.success('Delivery undone', { description: 'It is back to its pre-approval state.' });
    },
    onError: (e: Error) => toast.error('Could not undo', { description: e.message }),
  });

  // How the sale is settled, in words. A prepaid delivery used to read
  // "Collected in cash" here, because only the rider's flag was looked at.
  const settlementLine = (x: ReturnType<typeof completionSettlement>): string => {
    const parts: string[] = [];
    if (x.advance > 0) parts.push(`${formatMoney(x.advance)} paid in advance`);
    if (x.cash > 0) parts.push(`${formatMoney(x.cash)} collected in cash`);
    if (x.onAccount > 0) parts.push(`${formatMoney(x.onAccount)} on account`);
    return parts.length ? parts.join(' · ') : 'Nothing to settle';
  };
  const rider = c.personnelName || riderName || 'the rider';
  const title = c.deliveryReference || reference || 'Delivery';
  const undoIsRequest = actions.undo === 'request';

  return (
    <Card id={`completion-${c.id}`} className={cn('p-lg', highlight && 'ring-2 ring-primary')}>
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-sm">
            {showDeliveryLink && c.deliveryId ? (
              <Link
                to={`/deliveries/${c.deliveryId}`}
                className="text-label-lg text-primary hover:underline"
              >
                {title}
              </Link>
            ) : (
              <span className="text-label-lg text-text-primary">{title}</span>
            )}
            <StatusBadge status={c.status} label={STATUS_LABEL[c.status]} />
          </div>
          <p className="mt-xxs text-body-sm text-text-secondary">
            {[c.customerName, `Rider: ${rider}`, `Submitted ${formatWhen(c.submittedAt)}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="text-right">
          <p className="text-caption text-text-secondary">
            {c.status === 'pending' ? 'Sale on approval' : 'Sale value'}
          </p>
          <p className="text-h4 tabular text-text-primary">{formatMoney(c.saleAmount)}</p>
          <p className="text-caption text-text-tertiary">
            {c.status === 'pending' ? settlementLine(settled) : PAID_STATUS_LABELS[c.paidStatus]}
          </p>
        </div>
      </div>

      {/* ── Lines ─────────────────────────────────────────────────── */}
      <div className="mt-md overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border-light">
              <th className="py-xs text-left text-overline text-text-secondary">Item</th>
              <th className="py-xs text-right text-overline text-text-secondary">Delivered</th>
              <th className="py-xs text-right text-overline text-text-secondary">Returned</th>
            </tr>
          </thead>
          <tbody>
            {c.changes.map((ch) => (
              <tr key={ch.itemId} className="border-b border-border-light last:border-0">
                <td className="py-xs text-body-sm text-text-primary">{ch.itemName || ch.itemId}</td>
                <td className="py-xs text-right text-body-sm tabular text-text-primary">
                  {ch.deliveredQty}
                </td>
                <td
                  className={cn(
                    'py-xs text-right text-body-sm tabular',
                    ch.returnedQty > 0 ? 'text-warning' : 'text-text-tertiary',
                  )}
                >
                  {ch.returnedQty}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Proof ─────────────────────────────────────────────────── */}
      {(c.proof.signedBy || c.proof.billPhotoUri) && (
        <div className="mt-md flex flex-col gap-xs border-t border-border-light pt-sm">
          {c.proof.signedBy && (
            <p className="text-body-sm text-text-secondary">
              Signed by <span className="text-text-primary">{c.proof.signedBy}</span>
              {c.proof.billPhotoCapturedAt && ` · ${formatWhen(c.proof.billPhotoCapturedAt)}`}
            </p>
          )}
          {c.proof.billPhotoUri && <BillPhotoButton completionId={c.id} />}
        </div>
      )}

      {/* ── Pending: who may sign it ──────────────────────────────── */}
      {c.status === 'pending' && (actions.approve || actions.waiting || actions.reject) && (
        <div className="mt-md flex flex-wrap items-center gap-sm border-t border-border-light pt-md">
          {actions.approve && (
            <Button
              onClick={() => {
                setCashText(c.amountCollected.toFixed(2));
                setDialog('approve');
              }}
            >
              <Check className="size-4" />
              Approve
            </Button>
          )}
          {actions.waiting && (
            <div
              role="status"
              className="inline-flex items-center gap-xs rounded-md bg-warning-lighter px-md py-xs text-label-md text-warning"
            >
              <Clock className="size-4" />
              Waiting for Admin Approval
            </div>
          )}
          {actions.reject && (
            <Button variant="secondary" onClick={() => setDialog('reject')}>
              <X className="size-4" />
              Reject
            </Button>
          )}
        </div>
      )}

      {/* ── Reviewed ──────────────────────────────────────────────── */}
      {c.status !== 'pending' && (
        <div className="mt-md flex flex-wrap items-start justify-between gap-md border-t border-border-light pt-md">
          <div className="min-w-0">
            <p className="text-label-md text-text-primary">
              {reviewerLabel(c)}
              {c.reviewedAt && (
                <span className="text-body-sm text-text-secondary"> · {formatWhen(c.reviewedAt)}</span>
              )}
            </p>
            {c.reviewerComment && (
              <p className="mt-xxs text-body-sm text-text-secondary">“{c.reviewerComment}”</p>
            )}
            {c.reversalCreditMemoId && (
              <Link
                to={`/credit-memos/${c.reversalCreditMemoId}`}
                className="mt-xxs inline-block text-label-md text-primary hover:underline"
              >
                Reversed by credit memo
              </Link>
            )}
          </div>
          {actions.reverse && (
            <Button asChild variant="secondary" size="sm">
              <Link to={`/credit-memos/new?fromDelivery=${c.id}`}>
                <FileMinus className="size-4" />
                Reverse with credit memo
              </Link>
            </Button>
          )}
          {actions.undo && (
            <Button variant="secondary" size="sm" onClick={() => setDialog('undo')}>
              <Undo2 className="size-4" />
              {undoIsRequest ? 'Request undo' : 'Undo delivery'}
            </Button>
          )}
        </div>
      )}

      {/* ── Dialogs ───────────────────────────────────────────────── */}
      <ConfirmDialog
        open={dialog === 'approve'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Approve this delivery?"
        description={`This is the sale. It recognises ${formatMoney(
          c.saleAmount,
        )} — Dr Accounts Receivable / Cr Sales and tax — then Dr Cost of Goods Sold / Cr Goods in Transit for the ${
          units.delivered
        } delivered.${units.returned > 0 ? ` The ${units.returned} returned go back on the shelf.` : ''}`}
        confirmLabel="Approve and post the sale"
        busy={approve.isPending}
        confirmDisabled={!!cashError}
        onConfirm={() => approve.mutate()}
      >
        <div className="flex flex-col gap-sm">
          {collectsAtDoor ? (
            <Input
              label={`Cash handed in by ${rider}`}
              value={cashText}
              onChange={(e) => setCashText(e.target.value)}
              inputMode="decimal"
              className="tabular"
              error={cashError}
              hint={`${formatMoney(c.amountDue)} was due at the door. The rider reported ${formatMoney(
                c.amountCollected,
              )}. Change it if the count differs — both figures are kept.`}
            />
          ) : (
            <p className="text-body-sm text-text-secondary">
              Nothing was due at the door — the customer paid in advance. The rider collected no cash.
            </p>
          )}
          <dl className="grid grid-cols-[1fr_auto] gap-x-md gap-y-xxs rounded-md bg-surface-2 p-md text-body-sm">
            {settled.advance > 0 && (
              <>
                <dt className="text-text-secondary">Advance applied · Customer Advances (2400)</dt>
                <dd className="text-right tabular text-text-primary">{formatMoney(settled.advance)}</dd>
              </>
            )}
            <dt className="text-text-secondary">Cash received · Cash (1000)</dt>
            <dd className="text-right tabular text-text-primary">{formatMoney(settled.cash)}</dd>
            <dt className="text-text-secondary">Left in Accounts Receivable</dt>
            <dd className="text-right tabular text-text-primary">{formatMoney(settled.onAccount)}</dd>
            <dt className="text-label-md text-text-primary">Recorded as</dt>
            <dd className="text-right text-label-md text-text-primary">{PAID_STATUS_LABELS[settled.status]}</dd>
          </dl>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'reject'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Reject this completion?"
        description="The stock comes back to the shelf and Goods in Transit is reversed. No sale is recorded. Your reason is sent to the rider and kept as the audit note."
        confirmLabel="Reject"
        destructive
        busy={reject.isPending}
        reason={{
          label: 'Reason',
          placeholder: 'e.g. Customer refused — goods returned undamaged',
          minLength: REVIEW_REASON_MIN,
        }}
        onConfirm={(reason) => reason && reject.mutate(reason)}
      />

      <ConfirmDialog
        open={dialog === 'undo'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={undoIsRequest ? 'Ask the owner to undo this delivery?' : 'Undo this delivery?'}
        description={
          undoIsRequest
            ? 'Undoing an approved delivery is the owner’s call. Say why — they need the reason. Nothing changes until they approve.'
            : 'Returns the delivery to its pre-approval state. No sale was posted for it, so there is nothing to reverse in the books.'
        }
        confirmLabel={undoIsRequest ? 'Send for approval' : 'Undo delivery'}
        destructive={!undoIsRequest}
        busy={undo.isPending}
        reason={
          undoIsRequest
            ? { label: 'Why should it be undone?', minLength: REVIEW_REASON_MIN }
            : undefined
        }
        onConfirm={(reason) => undo.mutate(reason)}
      />
    </Card>
  );
}

export default CompletionCard;
