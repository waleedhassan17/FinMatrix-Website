import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Plus, Scale, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { DetailLayout, RailSection } from '@/components/layout/DetailLayout';
import { MoreActionsMenu, PageHeader } from '@/components/layout/PageHeader';
import { DetailPageSkeleton, PageMessage } from '@/components/layout/PageState';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { KeyValueList } from '@/components/ui/KeyValueList';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AmountSummary } from '@/features/documents/AmountSummary';
import { docDate } from '@/features/documents/documentModel';
import { journalEntryPdfBlob } from '@/features/documents/documentPdf';
import { journalEntryDocument } from '@/features/documents/receiptBuilders';
import { useDocumentCompany } from '@/features/documents/useDocumentContext';
import { DocumentActions } from '@/features/share/DocumentActions';
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
import { invalidateAfterPosting } from '@/features/documents/invalidateAfterPosting';

export default function JournalEntryDetailPage() {
  const { journalEntryId = '' } = useParams<{ journalEntryId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const cap = useCapability('journal.post');
  /**
   * Voiding is governed by a DIFFERENT capability from posting, and the
   * controller proves it: a staff void files an approval of type `'void'`, not
   * `'journal'`. Both are `request` for staff, so neither action is hidden —
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
    refetch,
  } = useQuery({
    queryKey: ['journal-entries', journalEntryId],
    queryFn: () => getJournalEntryById(journalEntryId),
  });

  const company = useDocumentCompany();
  const doc = useMemo(() => (entry ? journalEntryDocument(entry, company) : null), [entry, company]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    // Posting, or voiding a posted entry, moves account balances.
    invalidateAfterPosting(queryClient);
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

  if (isLoading) return <DetailPageSkeleton />;

  if (isError || !entry || !doc) {
    return (
      <PageMessage
        tone={isError ? 'error' : 'notFound'}
        title={isError ? 'This journal entry could not be loaded' : 'Journal entry not found'}
        description={error instanceof Error ? error.message : 'It may have been deleted.'}
        onRetry={isError ? () => refetch() : undefined}
        backTo="/journal-entries"
        backLabel="Back to journal entries"
      />
    );
  }

  const busy = post.isPending || doVoid.isPending;
  const balanced = entry.totalDebits === entry.totalCredits;
  const difference = Math.abs(entry.totalDebits - entry.totalCredits);

  return (
    <DetailLayout
      header={
        <PageHeader
          back={{ to: '/journal-entries', label: 'Journal entries' }}
          title={entry.reference || 'Journal entry'}
          status={
            <>
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
            </>
          }
          meta={[
            entry.date ? `Dated ${docDate(entry.date)}` : null,
            `${entry.lines.length} ${entry.lines.length === 1 ? 'line' : 'lines'}`,
          ]}
          actions={
            <>
              {/* Staff CAN call /post — the server files an approval request rather
                  than refusing — so the button shows with the label saying so. */}
              {canPost(entry) && cap.allowed && (
                <Button size="sm" onClick={() => setPostOpen(true)} disabled={busy}>
                  <Send className="size-4" />
                  {cap.submitLabel('Post to ledger')}
                </Button>
              )}
              <DocumentActions
                document={doc.share}
                getPdf={() => journalEntryPdfBlob(doc)}
                cacheKey={[entry.id, entry.updatedAt, entry.status, company.name, company.logo].join('|')}
              />
              <MoreActionsMenu
                actions={[
                  { label: 'New journal entry', icon: Plus, to: '/journal-entries/new' },
                  {
                    label: voidCap.submitLabel('Void entry'),
                    icon: Ban,
                    destructive: true,
                    onSelect: () => setVoidOpen(true),
                    hidden: !(canVoid(entry) && voidCap.allowed),
                    disabled: busy,
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
            label="Entry total"
            amount={entry.totalDebits}
            tone={entry.status === 'void' ? 'muted' : 'default'}
            note={balanced ? 'Debits equal credits' : `Out of balance by ${formatMoney(difference)}`}
            noteTone={balanced ? 'neutral' : 'danger'}
          />

          <RailSection title="Details">
            <KeyValueList
              items={[
                { label: 'Reference', value: entry.reference || '—' },
                { label: 'Date', value: docDate(entry.date) || '—' },
                { label: 'Posted', value: docDate(entry.postedAt), hidden: !entry.postedAt },
                {
                  label: 'Reverses',
                  value: (
                    <Link to={`/journal-entries/${entry.reversalOfId}`} className="text-primary hover:underline">
                      Original entry
                    </Link>
                  ),
                  hidden: !entry.reversalOfId,
                },
                { label: 'Created', value: docDate(entry.createdAt), hidden: !entry.createdAt },
              ]}
            />
          </RailSection>
        </>
      }
    >
      {entry.status === 'draft' && (
        <p className="rounded-md bg-surface-2 p-md text-body-sm text-text-secondary">
          <strong className="text-text-primary">This is a draft. </strong>
          Nothing has reached the ledger and no balance has moved. A draft may be out of balance;
          posting it cannot be.
        </p>
      )}

      {entry.status === 'void' && entry.voidReason && (
        <p className="rounded-md border border-border bg-surface-2 p-md text-body-sm text-text-secondary">
          <strong className="text-text-primary">Voided. </strong>
          {entry.voidReason}
        </p>
      )}

      <Card className="overflow-hidden p-0">
        <div className="h-1 bg-primary" aria-hidden="true" />
        <div className="flex flex-wrap items-end justify-between gap-md px-lg pt-lg">
          <div>
            <p className="text-overline text-text-tertiary">Journal entry</p>
            <p className="text-h3 text-text-primary">{entry.reference || '—'}</p>
          </div>
          <p className="text-body-sm text-text-secondary">{docDate(entry.date)}</p>
        </div>
        <div className="mt-md overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse">
            <thead>
              <tr className="bg-primary-50">
                <th className="px-lg py-xs text-left text-overline text-primary">Account</th>
                <th className="px-md py-xs text-left text-overline text-primary">Description</th>
                <th className="px-md py-xs text-right text-overline text-primary">Debit</th>
                <th className="px-lg py-xs text-right text-overline text-primary">Credit</th>
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((line) => (
                <tr key={line.id} className="border-b border-border-light">
                  <td className="px-lg py-sm">
                    <span className="block text-label-md text-text-primary">
                      {line.accountNumber
                        ? `${line.accountNumber} · ${line.accountName}`
                        : line.accountName || '—'}
                    </span>
                  </td>
                  <td className="px-md py-sm text-body-sm text-text-secondary">{line.description || '—'}</td>
                  <td className="px-md py-sm text-right text-body-sm text-text-primary tabular">
                    {line.debit > 0 ? formatMoney(line.debit) : ''}
                  </td>
                  <td className="px-lg py-sm text-right text-body-sm text-text-primary tabular">
                    {line.credit > 0 ? formatMoney(line.credit) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2">
                <td className="px-lg py-sm text-label-lg text-text-primary" colSpan={2}>
                  Totals
                </td>
                <td className="px-md py-sm text-right text-label-lg text-text-primary tabular">
                  {formatMoney(entry.totalDebits)}
                </td>
                <td className="px-lg py-sm text-right text-label-lg text-text-primary tabular">
                  {formatMoney(entry.totalCredits)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {entry.memo && (
          <div className="border-t border-border-light px-lg py-md">
            <p className="text-overline text-text-tertiary">Memo</p>
            <p className="mt-xxs text-body-sm text-text-secondary">{entry.memo}</p>
          </div>
        )}
      </Card>

      {/* A draft can legitimately be out of balance, so this says so rather than
          reading as an error. */}
      {!balanced && (
        <div className="flex items-center gap-sm rounded-md border border-warning-light bg-warning-lighter p-md">
          <Scale className="size-4 shrink-0 text-warning" />
          <p className="text-body-sm text-text-primary">
            Debits and credits do not match — out by {formatMoney(difference)}. This has to be
            corrected before the entry can post.
          </p>
        </div>
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
    </DetailLayout>
  );
}
