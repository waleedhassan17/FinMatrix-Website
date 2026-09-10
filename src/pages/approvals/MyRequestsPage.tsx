import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Inbox } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import {
  APPROVAL_TYPE_EFFECTS,
  APPROVAL_TYPE_LABELS,
  cancelApproval,
  fetchApprovals,
  type ApprovalFilter,
} from '@/networks/approvals/approvalsNetwork';

const FILTERS: [ApprovalFilter, string][] = [
  ['pending', 'Awaiting'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['all', 'All'],
];

/**
 * What a staff member has asked the owner to approve.
 *
 * Same endpoint as the owner's inbox — the server scopes it to the caller —
 * but with no decide actions anywhere, because `approvals.decide` is `false`
 * for staff. The only thing you can do to your own request is withdraw it.
 *
 * The owner's inbox and the approval-review view are Module 18.
 */
export default function MyRequestsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ApprovalFilter>('pending');
  const [cancelId, setCancelId] = useState<string | null>(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['approvals', 'mine', filter],
    queryFn: () => fetchApprovals({ status: filter }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelApproval(id),
    onSuccess: () => {
      setCancelId(null);
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      toast.success('Request withdrawn', {
        description: 'Nothing was posted.',
      });
    },
    onError: (e: Error) =>
      toast.error('Could not withdraw request', { description: e.message }),
  });

  return (
    <div className="flex flex-col gap-lg">
      <div>
        <h1 className="text-h2 text-text-primary">My requests</h1>
        <p className="text-body-sm text-text-secondary">
          Everything you have sent to the owner for approval.
        </p>
      </div>

      <div className="flex flex-wrap gap-xxs">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={cn(
              'rounded-full px-sm py-xxs text-label-md transition-colors',
              value === filter
                ? 'bg-primary text-text-inverse'
                : 'bg-neutral-100 text-text-secondary hover:bg-neutral-200',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Card className="p-lg">
          <div className="space-y-xs">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-neutral-100" />
            ))}
          </div>
        </Card>
      ) : requests.length === 0 ? (
        <Card className="p-xxl text-center">
          <Inbox className="mx-auto size-8 text-text-tertiary" />
          <p className="mt-md text-body-md text-text-secondary">
            {filter === 'pending'
              ? 'Nothing is waiting on the owner.'
              : 'No requests here.'}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-md">
          {requests.map((req) => {
            // 'approving' is a transient claim taken while the server replays
            // the payload. The list folds it under pending so a row never
            // disappears mid-dispatch.
            const isPending = req.status === 'pending' || req.status === 'approving';
            return (
              <Card key={req.id} className="p-lg">
                <div className="flex flex-wrap items-start justify-between gap-md">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-sm">
                      <span className="text-label-lg text-text-primary">
                        {APPROVAL_TYPE_LABELS[req.type] ?? req.type}
                      </span>
                      <StatusBadge
                        status={req.status === 'approving' ? 'pending' : req.status}
                        label={
                          req.status === 'pending' || req.status === 'approving'
                            ? 'Awaiting owner'
                            : req.status === 'cancelled'
                              ? 'Withdrawn'
                              : undefined
                        }
                      />
                    </div>

                    <p className="mt-xxs text-body-sm text-text-primary">
                      {req.summary}
                    </p>

                    {/* State the ledger effect plainly — the point of the queue
                        is that somebody understands what approving does. */}
                    <p className="mt-xxs text-caption text-text-tertiary">
                      {APPROVAL_TYPE_EFFECTS[req.type] ?? ''}
                    </p>

                    <p className="mt-xs flex items-center gap-xs text-caption text-text-tertiary">
                      <Clock className="size-3" />
                      Submitted {req.createdAt.slice(0, 10)}
                    </p>

                    {req.status === 'rejected' && req.reviewerComment && (
                      <div className="mt-sm rounded-md bg-danger-lighter p-sm">
                        <p className="text-caption text-danger">
                          Owner&rsquo;s reason
                        </p>
                        <p className="mt-xxs text-body-sm text-text-primary">
                          {req.reviewerComment}
                        </p>
                      </div>
                    )}

                    {/* A failed dispatch returns the request to pending and
                        records why — the user needs that, not a silent retry. */}
                    {isPending && req.lastError && (
                      <div className="mt-sm rounded-md bg-warning-lighter p-sm">
                        <p className="text-caption text-warning">
                          Last attempt failed
                        </p>
                        <p className="mt-xxs text-body-sm text-text-primary">
                          {req.lastError}
                        </p>
                      </div>
                    )}
                  </div>

                  {isPending && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCancelId(req.id)}
                    >
                      Withdraw
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={cancelId !== null}
        onOpenChange={(o) => !o && setCancelId(null)}
        title="Withdraw this request?"
        description="The owner will no longer see it. Nothing has been posted, and nothing will be."
        confirmLabel="Withdraw request"
        busy={cancel.isPending}
        onConfirm={() => cancelId && cancel.mutate(cancelId)}
      />
    </div>
  );
}
