import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Scale, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useCapability } from '@/hooks/useCapability';
import {
  canPost,
  canVoid,
  isOpeningBalanceEntry,
  isReversal,
} from '@/models/journalEntry';
import {
  getJournalEntryById,
  postJournalEntry,
  voidJournalEntry,
  type JournalWriteResult,
} from '@/networks/accounting/journalEntryNetwork';
import { formatMoney } from '@/utils/money';

export default function JournalEntryDetailPage() {
  const { journalEntryId = '' } = useParams<{ journalEntryId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const cap = useCapability('journal.post');
  /**
   * Voiding is governed by a DIFFERENT capability from posting, and the
   * controller proves it: a staff void files an approval of type `'void'`, not
   * `'journal'`. Both are `request` for staff, so neither button is hidden —
   * they are relabelled. The app checks neither and shows staff an enabled
   * "Post to Ledger" that silently files a request instead.
   */
  const voidCap = useCapability('transaction.void');

  const [postOpen, setPostOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  const {
    data: entry,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['journal-entries', journalEntryId],
    queryFn: () => getJournalEntryById(journalEntryId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    // Posting, or voiding a posted entry, moves account balances.
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const settle = (
    result: JournalWriteResult,
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

  const post = useMutation({
    mutationFn: () => postJournalEntry(journalEntryId),
    onSuccess: (r) =>
      settle(
        r,
        'Entry posted to the ledger',
        'Nothing posts until the owner approves.',
        () => setPostOpen(false),
      ),
    onError: (e: Error) =>
      toast.error('Could not post the entry', { description: e.message }),
  });

  const doVoid = useMutation({
    mutationFn: (reason: string) => voidJournalEntry(journalEntryId, reason),
    onSuccess: (r) =>
      settle(
        r,
        'Entry voided',
        'Nothing is reversed until the owner approves.',
        () => setVoidOpen(false),
      ),
    onError: (e: Error) =>
      toast.error('Could not void the entry', { description: e.message }),
  });

  if (isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading entry…</p>;
  }

  if (isError || !entry) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Journal entry not found</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          {error instanceof Error ? error.message : 'It may have been deleted.'}
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/journal-entries">Back to journal entries</Link>
        </Button>
      </Card>
    );
  }

  const busy = post.isPending || doVoid.isPending;
  const balanced = entry.totalDebits === entry.totalCredits;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/journal-entries">
          <ArrowLeft className="size-4" />
          Journal entries
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <div className="flex flex-wrap items-center gap-sm">
            <h1 className="text-h2 text-text-primary">
              {entry.reference || 'Journal entry'}
            </h1>
            <StatusBadge status={entry.status} />
            {isOpeningBalanceEntry(entry) && (
              <span className="rounded-full bg-primary-tint px-sm py-xxs text-caption text-primary">
                Opening balance
              </span>
            )}
            {isReversal(entry) && (
              <span className="rounded-full bg-neutral-100 px-sm py-xxs text-caption text-text-secondary">
                Reversal
              </span>
            )}
          </div>
          <p className="mt-xxs text-body-sm text-text-secondary">{entry.date}</p>
        </div>

        <div className="flex flex-wrap gap-xs">
          {/* Staff CAN call /post — the server files an approval request rather
              than refusing — so the button shows with the label saying so. */}
          {canPost(entry) && cap.allowed && (
            <Button onClick={() => setPostOpen(true)} disabled={busy}>
              <Send className="size-4" />
              {cap.submitLabel('Post to ledger')}
            </Button>
          )}

          {canVoid(entry) && voidCap.allowed && (
            <Button variant="danger" onClick={() => setVoidOpen(true)} disabled={busy}>
              <Ban className="size-4" />
              {voidCap.submitLabel('Void')}
            </Button>
          )}
        </div>
      </div>

      {entry.status === 'draft' && (
        <p className="rounded-md bg-surface-2 p-md text-body-sm text-text-secondary">
          <strong className="text-text-primary">This is a draft. </strong>
          Nothing has reached the ledger and no balance has moved. A draft may be
          out of balance; posting it cannot be.
        </p>
      )}

      {entry.status === 'void' && entry.voidReason && (
        <p className="rounded-md border border-border bg-surface-2 p-md text-body-sm text-text-secondary">
          <strong className="text-text-primary">Voided. </strong>
          {entry.voidReason}
        </p>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-md py-sm text-left text-overline text-text-secondary">
                  Account
                </th>
                <th className="px-md py-sm text-left text-overline text-text-secondary">
                  Description
                </th>
                <th className="px-md py-sm text-right text-overline text-text-secondary">
                  Debit
                </th>
                <th className="px-md py-sm text-right text-overline text-text-secondary">
                  Credit
                </th>
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((line) => (
                <tr key={line.id} className="border-b border-border-light">
                  <td className="px-md py-sm">
                    <span className="block text-label-md text-text-primary">
                      {line.accountNumber
                        ? `${line.accountNumber} · ${line.accountName}`
                        : line.accountName || '—'}
                    </span>
                  </td>
                  <td className="px-md py-sm text-body-sm text-text-secondary">
                    {line.description || '—'}
                  </td>
                  <td className="px-md py-sm text-right tabular text-body-sm text-text-primary">
                    {line.debit > 0 ? formatMoney(line.debit) : '—'}
                  </td>
                  <td className="px-md py-sm text-right tabular text-body-sm text-text-primary">
                    {line.credit > 0 ? formatMoney(line.credit) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2">
                <td className="px-md py-sm text-label-lg text-text-primary" colSpan={2}>
                  Totals
                </td>
                <td className="px-md py-sm text-right tabular text-label-lg text-text-primary">
                  {formatMoney(entry.totalDebits)}
                </td>
                <td className="px-md py-sm text-right tabular text-label-lg text-text-primary">
                  {formatMoney(entry.totalCredits)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* A draft can legitimately be out of balance, so this says so rather than
          reading as an error. */}
      {!balanced && (
        <div className="flex items-center gap-sm rounded-md border border-warning-light bg-warning-lighter p-md">
          <Scale className="size-4 shrink-0 text-warning" />
          <p className="text-body-sm text-text-primary">
            Debits and credits do not match — out by{' '}
            {formatMoney(Math.abs(entry.totalDebits - entry.totalCredits))}. This
            has to be corrected before the entry can post.
          </p>
        </div>
      )}

      {entry.memo && (
        <Card className="p-lg">
          <p className="text-caption text-text-secondary">Memo</p>
          <p className="mt-xxs text-body-md text-text-primary">{entry.memo}</p>
        </Card>
      )}

      <ConfirmDialog
        open={postOpen}
        onOpenChange={setPostOpen}
        title="Post this entry to the ledger?"
        description="Account balances move immediately and the entry can no longer be changed. A mistake after this point is corrected by voiding it, which books a reversing entry."
        confirmLabel={cap.submitLabel('Post to ledger')}
        busy={post.isPending}
        onConfirm={() => post.mutate()}
      />

      <ConfirmDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title="Void this entry?"
        description={
          entry.status === 'posted'
            ? 'A posted entry is not erased. A second entry is booked with every debit and credit swapped, so both stay in the ledger and the history is auditable.'
            : 'The draft is marked void. Nothing was posted, so no balance moves.'
        }
        confirmLabel={voidCap.submitLabel('Void entry')}
        destructive
        reason={{
          label: 'Reason',
          placeholder: 'Why is this being voided?',
          minLength: 3,
        }}
        busy={doVoid.isPending}
        onConfirm={(reason) => doVoid.mutate(reason ?? '')}
      />
    </div>
  );
}
