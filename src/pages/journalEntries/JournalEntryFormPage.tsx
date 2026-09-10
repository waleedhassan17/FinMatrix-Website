import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Info, Plus, Scale } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { DateField, Textarea } from '@/components/ui/Field';
import { SummaryPanel, SummaryRow } from '@/components/ui/SummaryPanel';
import { JournalLineRow } from '@/features/journalEntries/JournalLineRow';
import { useCapability } from '@/hooks/useCapability';
import { isoToday } from '@/models/document';
import {
  emptyJournalForm,
  freshJournalLine,
  journalTotals,
  validateJournalDraft,
  validateJournalPost,
  type JournalFormData,
  type JournalFormLine,
} from '@/models/journalEntry';
import { getPostableAccounts } from '@/networks/accounting/accountNetwork';
import { createJournalEntry } from '@/networks/accounting/journalEntryNetwork';
import { journalFormToPayload } from '@/serializers/journalEntrySerializer';
import { formatMoney } from '@/utils/money';

export default function JournalEntryFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const cap = useCapability('journal.post');

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', 'postable'],
    queryFn: getPostableAccounts,
  });

  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: `${a.accountNumber} · ${a.name}`,
      })),
    [accounts],
  );

  const [form, setForm] = useState<JournalFormData>(() => emptyJournalForm(isoToday()));
  const [error, setError] = useState('');
  // One key per mount: a retry replays the stored response rather than posting
  // the same figures to the ledger twice.
  const idempotencyKey = useRef(crypto.randomUUID());

  const totals = useMemo(() => journalTotals(form.lines), [form.lines]);

  const patch = (p: Partial<JournalFormData>) => setForm((f) => ({ ...f, ...p }));

  const patchLine = (id: string, p: Partial<JournalFormLine>) =>
    setForm((f) => ({
      ...f,
      lines: f.lines.map((line) => (line.id === id ? { ...line, ...p } : line)),
    }));

  const save = useMutation({
    mutationFn: (status: 'draft' | 'posted') =>
      createJournalEntry(
        journalFormToPayload(form, { status }),
        idempotencyKey.current,
      ),
    onSuccess: (result, status) => {
      if (result.pending) {
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        toast.success('Sent for approval', {
          description: 'Nothing reaches the ledger until the owner approves it.',
        });
        navigate('/my-requests', { replace: true });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      // A posted entry moves account balances, so every chart reader is stale.
      if (status === 'posted') {
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }
      toast.success(status === 'posted' ? 'Entry posted' : 'Draft saved', {
        description: result.entry.reference || undefined,
      });
      navigate(`/journal-entries/${result.entry.id}`, { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not save the entry', { description: e.message }),
  });

  const submit = (status: 'draft' | 'posted') => {
    if (!form.date) {
      setError('A date is required.');
      return;
    }
    // A draft may be unbalanced — that is what a draft is for, and the server
    // only checks the balance when posting. The line SHAPE is checked either way.
    const message =
      status === 'posted'
        ? validateJournalPost(form.lines)
        : validateJournalDraft(form.lines);
    setError(message);
    if (!message) save.mutate(status);
  };

  /**
   * Typing a debit clears the credit, and the reverse. The server throws when a
   * line has both sides, and the DB CHECK refuses it underneath — so the editor
   * cannot let the user build one.
   */
  const setDebit = (line: JournalFormLine, debit: string) => {
    patchLine(line.id, { debit, credit: debit === '' ? line.credit : '' });
    setError('');
  };

  const setCredit = (line: JournalFormLine, credit: string) => {
    patchLine(line.id, { credit, debit: credit === '' ? line.debit : '' });
    setError('');
  };

  const busy = save.isPending;
  const balanced = totals.balanced && totals.debits.greaterThan(0);
  const difference = totals.difference;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/journal-entries">
          <ArrowLeft className="size-4" />
          Journal entries
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">New journal entry</h1>
        <p className="text-body-sm text-text-secondary">
          Every entry moves money between accounts in equal measure — what you
          debit one side, you credit the other.
        </p>
      </div>

      {cap.needsApproval && (
        <div className="flex items-start gap-sm rounded-md border border-warning-light bg-warning-lighter p-md">
          <Info className="mt-[2px] size-4 shrink-0 text-warning" />
          <p className="text-body-sm text-text-primary">
            A journal entry writes the ledger directly, so yours goes to the owner
            for approval. Nothing posts until they approve it.
          </p>
        </div>
      )}

      <Card className="p-lg">
        <SectionHeader title="Entry details" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <DateField
            label="Date *"
            value={form.date}
            onChange={(date) => {
              patch({ date });
              setError('');
            }}
          />
        </div>

        <Textarea
          label="Memo"
          value={form.memo}
          onChange={(e) => patch({ memo: e.target.value })}
          placeholder="Why this entry exists — the thing you will want to know in a year."
          containerClassName="mt-md"
          rows={2}
        />

        <p className="mt-sm text-caption text-text-tertiary">
          The reference number is assigned when you save.
        </p>
      </Card>

      <Card className="p-lg">
        <SectionHeader
          title="Lines"
          right={
            <Button
              variant="text"
              size="sm"
              onClick={() => patch({ lines: [...form.lines, freshJournalLine()] })}
            >
              <Plus className="size-4" />
              Add line
            </Button>
          }
        />

        <div className="mt-md flex flex-col gap-sm">
          {form.lines.map((line, index) => (
            <JournalLineRow
              key={line.id}
              index={index}
              accountId={line.accountId}
              description={line.description}
              debit={line.debit}
              credit={line.credit}
              accountOptions={accountOptions}
              onAccountChange={(accountId) => {
                patchLine(line.id, { accountId });
                setError('');
              }}
              onDescriptionChange={(description) =>
                patchLine(line.id, { description })
              }
              onDebitChange={(debit) => setDebit(line, debit)}
              onCreditChange={(credit) => setCredit(line, credit)}
              onDelete={() =>
                patch({ lines: form.lines.filter((l) => l.id !== line.id) })
              }
              // Two lines is the floor the server enforces, so the last two
              // rows cannot be removed.
              canDelete={form.lines.length > 2}
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-md text-body-sm text-danger">
            {error}
          </p>
        )}
      </Card>

      <SummaryPanel
        title="Balance"
        icon={<Scale className="size-4" />}
        total={{ label: 'Difference', value: difference.abs() }}
      >
        <SummaryRow label="Total debits" value={totals.debits} />
        <SummaryRow label="Total credits" value={totals.credits} />
      </SummaryPanel>

      {/* The live verdict, in words. A figure alone does not tell someone who
          does not think in debits which side they are short on. */}
      <div
        role="status"
        className={
          balanced
            ? 'flex items-center gap-sm rounded-md border border-success-light bg-success-lighter p-md'
            : 'flex items-center gap-sm rounded-md border border-border bg-surface-2 p-md'
        }
      >
        {balanced ? (
          <>
            <Check className="size-4 shrink-0 text-success" />
            <p className="text-body-sm text-text-primary">
              Balanced at {formatMoney(totals.debits)}. Ready to post.
            </p>
          </>
        ) : (
          <>
            <Scale className="size-4 shrink-0 text-text-secondary" />
            <p className="text-body-sm text-text-secondary">
              {totals.debits.isZero() && totals.credits.isZero()
                ? 'Enter an amount on each line — one side debited, the other credited.'
                : `${difference.greaterThan(0) ? 'Credits' : 'Debits'} are short by ${formatMoney(difference.abs())}. Debits and credits have to match before this can post.`}
            </p>
          </>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-sm pb-xl">
        <Button asChild variant="secondary" disabled={busy}>
          <Link to="/journal-entries">Cancel</Link>
        </Button>

        {/* A draft may be unbalanced; that is the point of one. */}
        <Button variant="secondary" onClick={() => submit('draft')} disabled={busy}>
          Save as draft
        </Button>

        <Button
          onClick={() => submit('posted')}
          // Blocked while out of balance rather than left clickable to fail: the
          // server answers UNBALANCED_ENTRY, and the difference is already shown.
          disabled={busy || !balanced}
        >
          {busy ? 'Saving…' : cap.submitLabel('Post to ledger')}
        </Button>
      </div>
    </div>
  );
}
