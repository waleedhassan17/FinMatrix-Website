import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, CloudOff, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DateField, Textarea } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useFeature } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { isoToday } from '@/models/document';
import {
  ISO_DATE,
  isBeforeLastStatement,
  reconciliationMath,
  sourceTypeLabel,
  splitSections,
  type ReconEntry,
  type SectionSummary,
} from '@/models/reconciliation';
import { formatReportDate } from '@/models/reportPeriod';
import {
  createReconciliation,
  getUnreconciled,
  markCleared,
} from '@/networks/accounting/reconciliationNetwork';
import { formatMoney } from '@/utils/money';

// ─── Draft: statement date and balance, per account, per browser ────────────
//
// The ticks are saved on the server (PATCH /reconciliations/mark); the two
// figures typed off the statement are not, so they are kept here. Every access is
// guarded — storage can be unavailable, and a draft is a convenience, not state
// anything depends on.

interface Draft {
  statementDate: string;
  statementBalance: string;
}

const draftKey = (accountId: string) => `@finmatrix/bankrec-draft/${accountId}`;

const readDraft = (accountId: string): Draft | null => {
  try {
    const raw = window.localStorage.getItem(draftKey(accountId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    return {
      statementDate: typeof d.statementDate === 'string' ? d.statementDate : isoToday(),
      statementBalance: typeof d.statementBalance === 'string' ? d.statementBalance : '',
    };
  } catch {
    return null;
  }
};

const writeDraft = (accountId: string, draft: Draft) => {
  try {
    window.localStorage.setItem(draftKey(accountId), JSON.stringify(draft));
  } catch {
    /* a draft that cannot be saved is not an error worth showing */
  }
};

const clearDraft = (accountId: string) => {
  try {
    window.localStorage.removeItem(draftKey(accountId));
  } catch {
    /* ignore */
  }
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** How long a tick waits for the next one before the batch is saved. */
const MARK_DEBOUNCE_MS = 700;

/**
 * Reconcile one account against one statement.
 *
 * Enter the statement date and ending balance, tick every transaction that
 * appears on the statement, and watch the difference. Finish is only possible
 * when the difference is exactly zero — the same test the server applies.
 */
export default function ReconcilePage() {
  const { accountId = '' } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const enabled = useFeature('bankReconciliation');

  const initialDraft = useMemo(() => readDraft(accountId), [accountId]);
  const [statementDate, setStatementDate] = useState(
    initialDraft?.statementDate ?? isoToday(),
  );
  const [statementBalance, setStatementBalance] = useState(
    initialDraft?.statementBalance ?? '',
  );
  const [notes, setNotes] = useState('');
  /** Ticks changed on this screen; everything else follows the server's flag. */
  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map());

  useEffect(() => {
    writeDraft(accountId, { statementDate, statementBalance });
  }, [accountId, statementDate, statementBalance]);

  const dateValid = ISO_DATE.test(statementDate);

  // Keyed on the statement date, so moving the date re-queries. The app loads
  // once and keeps the old rows after a date change — including rows dated after
  // the new statement, which the server then refuses to clear.
  const query = useQuery({
    queryKey: ['reconciliations', 'unreconciled', accountId, statementDate],
    queryFn: () => getUnreconciled(accountId, statementDate),
    enabled: enabled && accountId !== '' && dateValid,
    placeholderData: keepPreviousData,
  });

  const set = query.data;
  const entries = useMemo(() => set?.entries ?? [], [set]);

  const clearedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of entries) {
      const ticked = overrides.has(e.id) ? overrides.get(e.id) : e.cleared;
      if (ticked) ids.add(e.id);
    }
    return ids;
  }, [entries, overrides]);

  const math = reconciliationMath(set?.beginningBalance ?? 0, entries, clearedIds, statementBalance);
  const sections = splitSections(entries, clearedIds);
  const beforeLast = isBeforeLastStatement(statementDate, set?.lastStatementDate ?? null);

  // ─── Saving ticks (save-and-resume) ──────────────────────────────────────
  const pending = useRef(new Map<string, boolean>());
  const timer = useRef<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  /**
   * Send every queued tick. Awaited before Finish — the app flushes without
   * waiting, so an untick could still be in flight when the reconciliation is
   * stamped, and reappear pre-ticked next time. A failed batch is put back so the
   * next flush retries it.
   */
  const flush = useCallback(async () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current.size === 0) return;
    const marks = [...pending.current].map(([entryId, cleared]) => ({ entryId, cleared }));
    pending.current.clear();
    setSaveState('saving');
    try {
      await markCleared(accountId, marks);
      setSaveState('saved');
    } catch {
      for (const m of marks) {
        if (!pending.current.has(m.entryId)) pending.current.set(m.entryId, m.cleared);
      }
      setSaveState('error');
    }
  }, [accountId]);

  // Leaving the screen sends whatever is queued.
  useEffect(() => () => void flush(), [flush]);

  const setTicks = (rows: readonly ReconEntry[], value: boolean) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      for (const e of rows) next.set(e.id, value);
      return next;
    });
    for (const e of rows) pending.current.set(e.id, value);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), MARK_DEBOUNCE_MS);
  };

  const finish = useMutation({
    mutationFn: async () => {
      await flush();
      return createReconciliation({
        accountId,
        statementDate,
        statementEndingBalance: math.statementBalance ?? '0.00',
        // Only rows that are on the list now — never a tick for a row the new
        // statement date has pushed out.
        clearedEntryIds: entries.filter((e) => clearedIds.has(e.id)).map((e) => e.id),
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: (saved) => {
      clearDraft(accountId);
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
      toast.success('Reconciled', {
        description: `${saved.clearedCount} transaction${saved.clearedCount === 1 ? '' : 's'} cleared and locked.`,
      });
      navigate(`/reconciliations/${saved.id}`, { replace: true });
    },
    onError: (e: Error) => toast.error('Could not finish', { description: e.message }),
  });

  const canFinish =
    !!set && dateValid && !beforeLast && math.balanced && !finish.isPending;

  if (!enabled) {
    return (
      <Card className="mx-auto max-w-lg p-xxl text-center">
        <p className="text-body-md text-text-secondary">
          Bank reconciliation is not included in your company’s plan.
        </p>
      </Card>
    );
  }

  const statementEntered = statementBalance.trim() !== '';

  return (
    <div className="flex flex-col gap-lg pb-xxxl">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/reconciliations">
          <ArrowLeft className="size-4" />
          Bank reconciliation
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">
          Reconcile {set ? `${set.accountNumber} · ${set.accountName}` : 'account'}
        </h1>
        <p className="text-body-sm text-text-secondary">
          Tick every transaction that appears on the statement. When the cleared
          balance equals the statement’s ending balance, the difference reaches zero
          and you can finish.
        </p>
      </div>

      <Card className="grid gap-md p-lg sm:grid-cols-2">
        <DateField
          label="Statement date"
          value={statementDate}
          onChange={setStatementDate}
          max={isoToday()}
          error={
            beforeLast && set?.lastStatementDate
              ? `This account is reconciled through ${formatReportDate(set.lastStatementDate)}. The statement date can’t be earlier.`
              : undefined
          }
          hint={
            set?.lastStatementDate
              ? `Last reconciled through ${formatReportDate(set.lastStatementDate)}.`
              : 'Only transactions up to this date are listed.'
          }
        />
        <Input
          label="Statement ending balance"
          value={statementBalance}
          onChange={(e) => setStatementBalance(e.target.value)}
          inputMode="decimal"
          placeholder="e.g. 15,250.00"
          className="tabular"
          error={
            statementEntered && math.statementBalance === null
              ? 'Enter the balance as a number, up to two decimals.'
              : undefined
          }
          hint="Exactly as printed on the statement. Negative if overdrawn."
        />
      </Card>

      {set?.beginningMismatch != null && (
        <div className="flex items-start gap-sm rounded-md border border-warning-light bg-warning-lighter p-md">
          <AlertTriangle className="mt-[2px] size-4 shrink-0 text-warning" />
          <p className="text-body-sm text-text-primary">
            The beginning balance is off by{' '}
            <strong className="tabular">{formatMoney(set.beginningMismatch)}</strong> against
            the last statement’s ending balance. A reconciled transaction was changed
            outside the normal flow — find and correct it before trusting this
            reconciliation.
          </p>
        </div>
      )}

      {/* The three figures that decide everything, and the one that must reach zero. */}
      <Card className="grid gap-md p-lg sm:grid-cols-4">
        <Figure label="Beginning balance" value={set ? formatMoney(set.beginningBalance) : '—'} />
        <Figure
          label="Statement ending balance"
          value={math.statementBalance !== null ? formatMoney(math.statementBalance) : '—'}
        />
        <Figure label="Cleared balance" value={set ? formatMoney(math.clearedBalance) : '—'} />
        <div
          className={cn(
            'rounded-md p-sm',
            math.balanced ? 'bg-success-lighter' : 'bg-danger-lighter',
          )}
        >
          <p className="text-caption text-text-secondary">Difference</p>
          <p
            className={cn(
              'mt-xxs text-h3 tabular',
              math.balanced ? 'text-success' : 'text-danger',
            )}
          >
            {math.difference === null ? '—' : formatMoney(math.difference)}
          </p>
        </div>
      </Card>

      {query.error ? (
        <Card className="p-lg">
          <p className="text-body-sm text-danger">{query.error.message}</p>
        </Card>
      ) : query.isLoading ? (
        <Card className="p-lg">
          <div className="h-24 animate-pulse rounded-md bg-neutral-100" />
        </Card>
      ) : (
        <div
          className={cn(
            'flex flex-col gap-lg transition-opacity',
            query.isFetching && 'opacity-60',
          )}
        >
          <Section
            title="Deposits and credits"
            summary={sections.deposits}
            clearedIds={clearedIds}
            onToggle={(e) => setTicks([e], !clearedIds.has(e.id))}
            onSetAll={(v) => setTicks(sections.deposits.entries, v)}
          />
          <Section
            title="Payments and debits"
            summary={sections.payments}
            clearedIds={clearedIds}
            onToggle={(e) => setTicks([e], !clearedIds.has(e.id))}
            onSetAll={(v) => setTicks(sections.payments.entries, v)}
          />
        </div>
      )}

      <Card className="p-lg">
        <Textarea
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything worth recording about this statement — a bank fee still to be entered, say."
          rows={2}
        />
      </Card>

      {/* Sticky: the verdict and the button stay in view while ticking a long list. */}
      <div className="sticky bottom-md z-10">
        <Card className="flex flex-wrap items-center justify-between gap-md p-md shadow-md">
          <div className="flex items-center gap-sm">
            <SaveIndicator state={saveState} />
            <p className="text-body-sm text-text-secondary">
              {clearedIds.size} cleared ·{' '}
              {math.balanced ? (
                <span className="text-success">Difference is zero — ready to finish.</span>
              ) : math.difference === null ? (
                'Enter the statement ending balance.'
              ) : (
                <span className="text-danger">
                  Off by {formatMoney(Math.abs(math.difference))}.
                </span>
              )}
            </p>
          </div>
          <Button onClick={() => finish.mutate()} disabled={!canFinish}>
            {finish.isPending ? 'Finishing…' : 'Finish reconciliation'}
          </Button>
        </Card>
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-sm">
      <p className="text-caption text-text-secondary">{label}</p>
      <p className="mt-xxs text-h3 tabular text-text-primary">{value}</p>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'saving') {
    return <Loader2 className="size-4 animate-spin text-text-tertiary" aria-label="Saving ticks" />;
  }
  if (state === 'saved') {
    return (
      <span title="Ticks saved — you can leave and pick up later.">
        <Check className="size-4 text-success" aria-label="Ticks saved" />
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span title="Couldn’t save ticks just now. They are still on this screen, and Finish sends them regardless.">
        <CloudOff className="size-4 text-warning" aria-label="Ticks not saved" />
      </span>
    );
  }
  return null;
}

function Section({
  title,
  summary,
  clearedIds,
  onToggle,
  onSetAll,
}: {
  title: string;
  summary: SectionSummary;
  clearedIds: ReadonlySet<string>;
  onToggle: (e: ReconEntry) => void;
  onSetAll: (value: boolean) => void;
}) {
  const { entries, clearedCount, clearedTotal } = summary;
  const allTicked = entries.length > 0 && clearedCount === entries.length;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-sm border-b border-border-light px-lg py-md">
        <div>
          <h2 className="text-label-lg text-text-primary">{title}</h2>
          <p className="text-caption text-text-secondary">
            {clearedCount} of {entries.length} cleared ·{' '}
            <span className="tabular">{formatMoney(Math.abs(clearedTotal))}</span>
          </p>
        </div>
        {entries.length > 0 && (
          <Button variant="text" size="sm" onClick={() => onSetAll(!allTicked)}>
            {allTicked ? 'Untick all' : 'Tick all'}
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="p-lg text-center text-body-sm text-text-tertiary">
          Nothing unreconciled here up to the statement date.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="w-10 px-md py-sm" />
                <th className="px-md py-sm text-left text-overline text-text-secondary">Date</th>
                <th className="px-md py-sm text-left text-overline text-text-secondary">Reference</th>
                <th className="px-md py-sm text-left text-overline text-text-secondary">From</th>
                <th className="px-md py-sm text-right text-overline text-text-secondary">Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const ticked = clearedIds.has(e.id);
                return (
                  <tr
                    key={e.id}
                    onClick={() => onToggle(e)}
                    className={cn(
                      'cursor-pointer border-b border-border-light transition-colors last:border-0 hover:bg-surface-2',
                      ticked && 'bg-success-lighter',
                    )}
                  >
                    <td className="px-md py-sm">
                      <input
                        type="checkbox"
                        checked={ticked}
                        onChange={() => onToggle(e)}
                        onClick={(ev) => ev.stopPropagation()}
                        aria-label={`Cleared: ${e.reference || e.memo || 'transaction'} ${formatMoney(Math.abs(e.amount))}`}
                        className="size-4 accent-primary"
                      />
                    </td>
                    <td className="whitespace-nowrap px-md py-sm text-body-sm text-text-primary">
                      {formatReportDate(e.date)}
                    </td>
                    <td className="px-md py-sm">
                      <p className="text-body-sm text-text-primary">{e.reference || '—'}</p>
                      {e.memo && (
                        <p className="text-caption text-text-tertiary">{e.memo}</p>
                      )}
                    </td>
                    <td className="px-md py-sm text-body-sm text-text-secondary">
                      {sourceTypeLabel(e.sourceType)}
                    </td>
                    <td className="px-md py-sm text-right text-body-sm tabular text-text-primary">
                      {formatMoney(Math.abs(e.amount))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
