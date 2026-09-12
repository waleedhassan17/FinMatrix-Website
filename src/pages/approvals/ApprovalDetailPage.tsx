import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Info,
  MessageSquare,
  Undo2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Textarea } from '@/components/ui/Field';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ApprovalPreview } from '@/features/approvals/ApprovalPreview';
import { useRequesterNames } from '@/features/approvals/useRequesterNames';
import { useCapability } from '@/hooks/useCapability';
import {
  APPROVAL_TYPE_EFFECTS,
  APPROVAL_TYPE_LABELS,
  approvalAmount,
  canDecide,
  canWithdraw,
  invalidationKeysFor,
  resultLink,
  statusDisplay,
  type ApprovalRequest,
} from '@/models/approval';
import { formatReportDate } from '@/models/reportPeriod';
import {
  cancelApproval,
  decideApproval,
  fetchApprovalById,
} from '@/networks/approvals/approvalsNetwork';
import { selectUser } from '@/store/authSlice';
import { useAppSelector } from '@/store/store';
import { formatMoney } from '@/utils/money';

type Dialog = 'approve' | 'reject' | 'withdraw' | null;

const when = (ts: string | null): string => {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${formatReportDate(ts.slice(0, 10))}, ${time}`;
};

/**
 * One approval request, in full.
 *
 * Shared by `/approvals/:id` (the owner) and `/my-requests/:id` (the requester —
 * staff cannot reach `/approvals/*`). The actions follow the viewer, not the
 * route: the owner may approve or reject someone else's pending request; the
 * requester may withdraw their own.
 */
export default function ApprovalDetailPage() {
  const { approvalId = '' } = useParams<{ approvalId: string }>();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const user = useAppSelector(selectUser);
  const decideCap = useCapability('approvals.decide');
  const nameOf = useRequesterNames();

  const [dialog, setDialog] = useState<Dialog>(null);
  const [approveNote, setApproveNote] = useState('');

  const fromInbox = pathname.startsWith('/approvals');
  const back = fromInbox
    ? { to: '/approvals', label: 'Approvals' }
    : { to: '/my-requests', label: 'My requests' };

  const query = useQuery({
    queryKey: ['approvals', approvalId],
    queryFn: () => fetchApprovalById(approvalId),
    // A staff member watching their own request sees the decision land.
    refetchInterval: (q) =>
      q.state.data?.status === 'pending' || q.state.data?.status === 'approving' ? 20_000 : false,
  });

  const settle = (updated: ApprovalRequest) => {
    queryClient.setQueryData(['approvals', approvalId], updated);
    for (const key of invalidationKeysFor(updated.type)) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const decide = useMutation({
    mutationFn: (v: { decision: 'approve' | 'reject'; comment?: string }) =>
      decideApproval(approvalId, v.decision, v.comment),
    onSuccess: (updated) => {
      settle(updated);
      setDialog(null);
      setApproveNote('');
      if (updated.status === 'approved') {
        toast.success('Approved', {
          description: `The ${APPROVAL_TYPE_LABELS[updated.type].toLowerCase()} has been posted.`,
        });
      } else if (updated.status === 'rejected') {
        toast.success('Rejected', { description: 'The requester will see your reason.' });
      } else {
        toast.message(`This request is already ${statusDisplay(updated.status).label.toLowerCase()}.`);
      }
    },
    // The dialog stays open with the typed reason intact — the app closes it
    // first and loses the reason on failure. The row is re-read, because a failed
    // approval returns it to pending with the cause in `lastError`.
    onError: (e: Error) => {
      toast.error('Could not record the decision', { description: e.message });
      queryClient.invalidateQueries({ queryKey: ['approvals', approvalId] });
    },
  });

  const withdraw = useMutation({
    mutationFn: () => cancelApproval(approvalId),
    onSuccess: (updated) => {
      settle(updated);
      setDialog(null);
      toast.success('Request withdrawn', { description: 'Nothing was posted.' });
    },
    onError: (e: Error) => toast.error('Could not withdraw the request', { description: e.message }),
  });

  if (query.isLoading) {
    return (
      <Card className="p-lg">
        <div className="h-40 animate-pulse rounded-md bg-neutral-100" />
      </Card>
    );
  }

  if (query.error || !query.data) {
    return (
      <Card className="p-lg">
        <p className="text-body-sm text-danger">{query.error?.message ?? 'Request not found.'}</p>
        <Button asChild variant="secondary" className="mt-md">
          <Link to={back.to}>Back to {back.label.toLowerCase()}</Link>
        </Button>
      </Card>
    );
  }

  const request = query.data;
  const display = statusDisplay(request.status);
  const amount = approvalAmount(request);
  const result = resultLink(request);
  const mayDecide = canDecide(request, user?.id, decideCap.allowed);
  const mayWithdraw = canWithdraw(request, user?.id);
  const label = APPROVAL_TYPE_LABELS[request.type];
  const approveNoteTooShort = approveNote.trim().length > 0 && approveNote.trim().length < 3;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg pb-xxxl">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to={back.to}>
          <ArrowLeft className="size-4" />
          {back.label}
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-sm">
            <h1 className="text-h2 text-text-primary">{label}</h1>
            <StatusBadge status={display.badge} label={display.label} />
          </div>
          <p className="mt-xxs text-body-md text-text-primary">{request.summary}</p>
        </div>
        {amount !== null && (
          <div className="text-right">
            <p className="text-caption text-text-secondary">Amount</p>
            <p className="text-h2 tabular text-text-primary">{formatMoney(amount)}</p>
          </div>
        )}
      </div>

      <Card className="grid gap-md p-lg sm:grid-cols-3">
        {fromInbox && (
          <div>
            <p className="text-caption text-text-secondary">Requested by</p>
            <p className="mt-xxs text-body-md text-text-primary">{nameOf(request.requestedBy)}</p>
          </div>
        )}
        <div>
          <p className="text-caption text-text-secondary">Submitted</p>
          <p className="mt-xxs text-body-md text-text-primary">{when(request.createdAt)}</p>
        </div>
        <div>
          <p className="text-caption text-text-secondary">Decided</p>
          <p className="mt-xxs text-body-md text-text-primary">
            {request.status === 'cancelled' ? `Withdrawn ${when(request.reviewedAt)}` : when(request.reviewedAt)}
          </p>
        </div>
      </Card>

      <div className="flex items-start gap-sm rounded-md bg-surface-2 p-md">
        <Info className="mt-[2px] size-4 shrink-0 text-text-secondary" />
        <p className="text-body-sm text-text-secondary">
          {request.status === 'approved' ? 'Approving did this: ' : 'Approving will do this: '}
          <span className="text-text-primary">{APPROVAL_TYPE_EFFECTS[request.type]}</span>
          {request.status === 'pending' && ' Until then nothing has been posted.'}
        </p>
      </div>

      {request.status === 'approving' && (
        <div className="flex items-start gap-sm rounded-md border border-warning-light bg-warning-lighter p-md">
          <AlertTriangle className="mt-[2px] size-4 shrink-0 text-warning" />
          <p className="text-body-sm text-text-primary">
            This approval was interrupted while it was being posted, so it may already have
            gone through. Check the ledger for the entry before anything else — it can’t be
            decided again from here.
          </p>
        </div>
      )}

      {request.lastError && request.status === 'pending' && (
        <div className="flex items-start gap-sm rounded-md border border-warning-light bg-warning-lighter p-md">
          <AlertTriangle className="mt-[2px] size-4 shrink-0 text-warning" />
          <div>
            <p className="text-label-md text-text-primary">The last approval attempt failed</p>
            <p className="mt-xxs text-body-sm text-text-primary">{request.lastError}</p>
            <p className="mt-xxs text-caption text-text-secondary">
              Nothing was posted. Fix the cause and approve again, or reject it.
            </p>
          </div>
        </div>
      )}

      {request.reason && request.type !== 'delivery_undo' && (
        <Card className="p-lg">
          <p className="text-caption text-text-secondary">Reason given by the requester</p>
          <p className="mt-xxs whitespace-pre-wrap text-body-md text-text-primary">{request.reason}</p>
        </Card>
      )}

      {request.reviewerComment && (
        <div
          className={
            request.status === 'rejected'
              ? 'flex items-start gap-sm rounded-md border border-danger-light bg-danger-lighter p-md'
              : 'flex items-start gap-sm rounded-md bg-surface-2 p-md'
          }
        >
          <MessageSquare
            className={`mt-[2px] size-4 shrink-0 ${request.status === 'rejected' ? 'text-danger' : 'text-text-secondary'}`}
          />
          <div>
            <p className="text-label-md text-text-primary">
              {request.status === 'rejected' ? 'Why it was rejected' : 'Note from the owner'}
            </p>
            <p className="mt-xxs whitespace-pre-wrap text-body-sm text-text-primary">
              {request.reviewerComment}
            </p>
          </div>
        </div>
      )}

      {result && (
        <Button asChild variant="secondary" className="self-start">
          <Link to={result.to}>
            {result.label}
            <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      )}

      <ApprovalPreview request={request} />

      {(mayDecide || mayWithdraw) && (
        <div className="sticky bottom-md z-10">
          <Card className="flex flex-wrap items-center justify-between gap-md p-md shadow-md">
            <p className="text-body-sm text-text-secondary">
              {mayDecide
                ? `Requested by ${nameOf(request.requestedBy)}. Approving posts it now.`
                : 'Still waiting on the owner. You can withdraw it until they decide.'}
            </p>
            <div className="flex gap-sm">
              {mayDecide && (
                <>
                  <Button variant="secondary" onClick={() => setDialog('reject')}>
                    <X className="size-4" />
                    Reject
                  </Button>
                  <Button onClick={() => setDialog('approve')}>
                    <Check className="size-4" />
                    Approve
                  </Button>
                </>
              )}
              {mayWithdraw && (
                <Button variant="secondary" onClick={() => setDialog('withdraw')}>
                  <Undo2 className="size-4" />
                  Withdraw
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={dialog === 'approve'}
        onOpenChange={(o) => {
          if (!o) {
            setDialog(null);
            setApproveNote('');
          }
        }}
        title={`Approve this ${label.toLowerCase()}?`}
        description={
          <>
            {APPROVAL_TYPE_EFFECTS[request.type]}
            {amount !== null && <> Amount: <strong className="tabular">{formatMoney(amount)}</strong>.</>}{' '}
            It posts as soon as you approve, dated today.
          </>
        }
        confirmLabel="Approve and post"
        busy={decide.isPending}
        confirmDisabled={approveNoteTooShort}
        onConfirm={() => decide.mutate({ decision: 'approve', comment: approveNote })}
      >
        <Textarea
          label="Note to the requester (optional)"
          value={approveNote}
          onChange={(e) => setApproveNote(e.target.value)}
          rows={2}
          error={approveNoteTooShort ? 'A note needs at least 3 characters, or leave it blank.' : undefined}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'reject'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Reject this ${label.toLowerCase()}?`}
        description="Nothing is posted. The requester sees your reason and can submit it again, corrected."
        confirmLabel="Reject request"
        destructive
        busy={decide.isPending}
        reason={{
          label: 'Why are you rejecting it?',
          placeholder: 'e.g. Wrong customer — this should go to the Lahore branch account.',
          minLength: 3,
        }}
        onConfirm={(reason) => decide.mutate({ decision: 'reject', comment: reason })}
      />

      <ConfirmDialog
        open={dialog === 'withdraw'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Withdraw this request?"
        description="The owner will no longer see it. Nothing has been posted, and nothing will be."
        confirmLabel="Withdraw request"
        busy={withdraw.isPending}
        onConfirm={() => withdraw.mutate()}
      />
    </div>
  );
}
