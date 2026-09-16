import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Banknote,
  Check,
  CreditCard,
  FileText,
  Info,
  Package,
  Plus,
  Scale,
  User,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { DateField } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { ACCT_OPENING_BALANCE_EQUITY, type Account } from '@/models/account';
import { isoToday } from '@/models/document';
import { useCapability } from '@/hooks/useCapability';
import { getPostableAccounts } from '@/networks/accounting/accountNetwork';
import { createJournalEntry } from '@/networks/accounting/journalEntryNetwork';
import type { JournalLineWritePayload } from '@/serializers/journalEntrySerializer';
import { Decimal, formatMoney, toDecimal } from '@/utils/money';
import { invalidateAfterPosting } from '@/features/documents/invalidateAfterPosting';

/**
 * Which side of the entry a row belongs to, in the user's own language.
 *
 * This is the whole trick of the screen: nobody setting up a warehouse thinks
 * "debit Cash, credit Opening Balance Equity". They think "I have this much in
 * the bank, and I owe this much to suppliers". `own` becomes debits and `owe`
 * becomes credits, and that mapping exists in exactly one place — `buildLines`.
 */
type Side = 'own' | 'owe';

interface Row {
  id: string;
  accountId: string;
  amount: string;
}

let seq = 0;
const blankRow = (accountId = ''): Row => {
  seq += 1;
  return { id: `ob_${seq}`, accountId, amount: '' };
};

/**
 * One-click shortcuts into the seeded chart. Each names candidate account
 * numbers in preference order, so a company whose chart has been edited gets a
 * working chip rather than a dead end.
 */
const QUICK_ADD: Record<
  Side,
  { codes: string[]; label: string; icon: ReactNode }[]
> = {
  own: [
    { codes: ['1000'], label: 'Cash', icon: <Banknote className="size-4" /> },
    { codes: ['1010'], label: 'Bank', icon: <CreditCard className="size-4" /> },
    { codes: ['1200'], label: 'Stock', icon: <Package className="size-4" /> },
  ],
  owe: [
    // 3900 first: Opening Balance Equity is where an opening entry's capital
    // belongs, and it is what the auto-plug uses — keep the two consistent.
    {
      codes: [ACCT_OPENING_BALANCE_EQUITY, '3000'],
      label: 'My own money',
      icon: <User className="size-4" />,
    },
    {
      codes: ['2000'],
      label: 'Money I owe',
      icon: <FileText className="size-4" />,
    },
  ],
};

const SIDE_COPY: Record<Side, { title: string; blurb: string; amountLabel: string }> = {
  own: {
    title: 'What the business owns',
    blurb:
      'Cash, money in the bank, stock on the shelves, and anything customers still owe you.',
    amountLabel: 'Value',
  },
  owe: {
    title: 'What it owes, and what you put in',
    blurb:
      'Suppliers you still have to pay, loans, and the money you put into the business yourself.',
    amountLabel: 'Amount',
  },
};

export default function OpeningBalancePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const cap = useCapability('journal.post');

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['accounts', 'postable'],
    queryFn: getPostableAccounts,
  });

  const [date, setDate] = useState(isoToday());
  const [own, setOwn] = useState<Row[]>([blankRow()]);
  const [owe, setOwe] = useState<Row[]>([blankRow()]);
  const [error, setError] = useState('');
  const idempotencyKey = useRef(crypto.randomUUID());

  /** An opening balance is a balance-sheet statement; revenue and expense have no place in one. */
  const optionsFor = (side: Side) =>
    accounts
      .filter((a) =>
        side === 'own'
          ? a.type === 'asset'
          : a.type === 'liability' || a.type === 'equity',
      )
      .map((a) => ({ value: a.id, label: `${a.accountNumber} · ${a.name}` }));

  const rowsOf = (side: Side) => (side === 'own' ? own : owe);
  const setRows = (side: Side) => (side === 'own' ? setOwn : setOwe);

  const usable = (rows: Row[]) =>
    rows.filter((r) => r.accountId !== '' && toDecimal(r.amount).greaterThan(0));

  const sumOf = (rows: Row[]) =>
    rows.reduce<Decimal>((acc, r) => acc.plus(toDecimal(r.amount)), new Decimal(0));

  const ownTotal = useMemo(() => sumOf(own), [own]);
  const oweTotal = useMemo(() => sumOf(owe), [owe]);
  /** Positive means the `own` side is heavier, so the plug has to be a credit. */
  const difference = ownTotal.minus(oweTotal);
  const balanced = difference.isZero();
  const anyEntered = ownTotal.greaterThan(0) || oweTotal.greaterThan(0);

  /**
   * The account that absorbs whatever the two sides do not settle between them.
   * QuickBooks calls it Opening Balance Equity and plugs it silently; this plugs
   * it too, but shows the line first — see the preview below.
   */
  const plugAccount: Account | undefined = useMemo(
    () =>
      accounts.find((a) => a.accountNumber === ACCT_OPENING_BALANCE_EQUITY) ??
      accounts.find((a) => a.type === 'equity'),
    [accounts],
  );

  const needsPlug = anyEntered && !balanced;

  const patchRow = (side: Side, id: string, next: Partial<Row>) => {
    setRows(side)((rows) => rows.map((r) => (r.id === id ? { ...r, ...next } : r)));
    setError('');
  };

  const addRow = (side: Side, accountId = '') =>
    setRows(side)((rows) => [...rows, blankRow(accountId)]);

  const removeRow = (side: Side, id: string) =>
    setRows(side)((rows) => {
      const next = rows.filter((r) => r.id !== id);
      return next.length > 0 ? next : [blankRow()];
    });

  /**
   * Put a quick-add account into the first empty row, or add a row for it.
   * Walks the candidate numbers in order so an edited chart still works.
   */
  const quickAdd = (side: Side, codes: string[]) => {
    const account = codes
      .map((code) => accounts.find((a) => a.accountNumber === code))
      .find((a): a is Account => a !== undefined);
    if (!account) {
      toast.error('That account is not in your chart', {
        description: 'Pick one from the list instead.',
      });
      return;
    }

    const rows = rowsOf(side);
    if (rows.some((r) => r.accountId === account.id)) return;

    const empty = rows.find((r) => r.accountId === '');
    if (empty) patchRow(side, empty.id, { accountId: account.id });
    else addRow(side, account.id);
  };

  /**
   * The plain-English sides translated into debits and credits, plus the plug.
   * The ONLY place that mapping lives.
   */
  const buildLines = (): JournalLineWritePayload[] => {
    const lines: JournalLineWritePayload[] = [
      ...usable(own).map((r) => ({
        accountId: r.accountId,
        description: 'Opening balance',
        debit: toDecimal(r.amount).toDecimalPlaces(2).toFixed(2),
        credit: '0',
        lineOrder: 0,
      })),
      ...usable(owe).map((r) => ({
        accountId: r.accountId,
        description: 'Opening balance',
        debit: '0',
        credit: toDecimal(r.amount).toDecimalPlaces(2).toFixed(2),
        lineOrder: 0,
      })),
    ];

    if (needsPlug && plugAccount) {
      const gap = difference.abs().toDecimalPlaces(2).toFixed(2);
      lines.push(
        difference.greaterThan(0)
          ? {
              accountId: plugAccount.id,
              description: 'Opening balance — to balance',
              debit: '0',
              credit: gap,
              lineOrder: 0,
            }
          : {
              accountId: plugAccount.id,
              description: 'Opening balance — to balance',
              debit: gap,
              credit: '0',
              lineOrder: 0,
            },
      );
    }

    // Numbered last, over the lines actually sent, so no gap can appear.
    return lines.map((line, index) => ({ ...line, lineOrder: index }));
  };

  const save = useMutation({
    mutationFn: () =>
      createJournalEntry(
        {
          date,
          memo: 'Opening balances',
          status: 'posted',
          lines: buildLines(),
          // Stamps the entry `sourceType: 'opening_balance'`, which is what the
          // dashboard's setup checklist looks for to tick this step off.
          isOpeningBalance: true,
        },
        idempotencyKey.current,
      ),
    onSuccess: (result) => {
      // The app ignores `pending` here, so a staff member is told their opening
      // balances are set when the server only filed a request.
      if (result.pending) {
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        toast.success('Sent for approval', {
          description: 'Your opening balances post once the owner approves them.',
        });
        navigate('/my-requests', { replace: true });
        return;
      }
      invalidateAfterPosting(queryClient);
      toast.success('Opening balances posted', {
        description: result.entry.reference || undefined,
      });
      navigate(`/journal-entries/${result.entry.id}`, { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not post the opening balances', { description: e.message }),
  });

  const submit = () => {
    if (!date) {
      setError('A date is required.');
      return;
    }
    if (!anyEntered) {
      setError('Enter at least one figure before posting.');
      return;
    }
    if (needsPlug && !plugAccount) {
      setError(
        'The two sides do not match, and there is no equity account to put the difference in. Add one to the chart of accounts first.',
      );
      return;
    }
    // Both sides balanced but only one line total cannot happen — a single row
    // always leaves a difference, which the plug turns into a second line.
    if (buildLines().length < 2) {
      setError('An entry needs at least two lines.');
      return;
    }
    setError('');
    save.mutate();
  };

  const busy = save.isPending;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/journal-entries">
          <ArrowLeft className="size-4" />
          Journal entries
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">Opening balances</h1>
        <p className="mt-xxs max-w-2xl text-body-md text-text-secondary">
          Where the business stood the day you started using FinMatrix. Fill in
          what you have and what you owe — there is no need to work out debits and
          credits, and anything left over is balanced for you.
        </p>
      </div>

      {cap.needsApproval && (
        <div className="flex items-start gap-sm rounded-md border border-warning-light bg-warning-lighter p-md">
          <Info className="mt-[2px] size-4 shrink-0 text-warning" />
          <p className="text-body-sm text-text-primary">
            Opening balances write the ledger, so these go to the owner for
            approval. Nothing posts until they approve it.
          </p>
        </div>
      )}

      <Card className="p-lg">
        <DateField
          label="As at *"
          value={date}
          onChange={setDate}
          containerClassName="max-w-64"
          hint="The day these figures were true — usually the day you started."
        />
      </Card>

      {loadingAccounts ? (
        <p className="text-body-sm text-text-secondary">Loading your accounts…</p>
      ) : (
        <div className="grid gap-lg lg:grid-cols-2">
          {(['own', 'owe'] as Side[]).map((side) => {
            const copy = SIDE_COPY[side];
            const rows = rowsOf(side);
            const options = optionsFor(side);
            const total = side === 'own' ? ownTotal : oweTotal;

            return (
              <Card key={side} className="flex flex-col p-lg">
                <div
                  className={cn(
                    'mb-md border-l-[3px] pl-md',
                    side === 'own' ? 'border-success' : 'border-info',
                  )}
                >
                  <h2 className="text-h4 text-text-primary">{copy.title}</h2>
                  <p className="mt-xxs text-body-sm text-text-secondary">
                    {copy.blurb}
                  </p>
                </div>

                <div className="mb-md flex flex-wrap gap-xs">
                  {QUICK_ADD[side].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => quickAdd(side, chip.codes)}
                      className="flex items-center gap-xs rounded-full border border-border px-sm py-xxs text-label-md text-text-secondary transition-colors hover:border-primary hover:text-primary"
                    >
                      {chip.icon}
                      {chip.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-1 flex-col gap-sm">
                  {rows.map((row) => (
                    <div key={row.id} className="flex items-end gap-xs">
                      <Combobox
                        value={row.accountId}
                        onChange={(accountId) => patchRow(side, row.id, { accountId })}
                        options={options}
                        placeholder="Choose an account…"
                        searchPlaceholder="Search…"
                        emptyText="Nothing suitable in your chart."
                        compact
                        containerClassName="min-w-0 flex-1"
                      />

                      <label className="flex w-32 shrink-0 flex-col gap-xxs">
                        <span className="text-caption text-text-secondary">
                          {copy.amountLabel}
                        </span>
                        <input
                          value={row.amount}
                          onChange={(e) =>
                            patchRow(side, row.id, {
                              amount: e.target.value.replace(/[^0-9.]/g, ''),
                            })
                          }
                          inputMode="decimal"
                          placeholder="0.00"
                          aria-label={`${copy.title} amount`}
                          className="h-10 w-full rounded-md border border-border bg-surface px-sm text-right text-body-md tabular text-text-primary outline-none transition-colors focus:border-[1.5px] focus:border-primary placeholder:text-text-tertiary"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => removeRow(side, row.id)}
                        aria-label="Remove this row"
                        className="mb-[6px] flex size-7 shrink-0 items-center justify-center rounded-full bg-danger-lighter text-danger transition-colors hover:bg-danger-light"
                      >
                        <X className="size-[14px]" />
                      </button>
                    </div>
                  ))}
                </div>

                <Button
                  variant="text"
                  size="sm"
                  className="mt-sm self-start px-0"
                  onClick={() => addRow(side)}
                >
                  <Plus className="size-4" />
                  Add a row
                </Button>

                <div className="mt-md flex items-center justify-between border-t border-border-light pt-sm">
                  <span className="text-label-md text-text-secondary">Total</span>
                  <span className="text-h4 tabular text-text-primary">
                    {formatMoney(total)}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* The plug, shown BEFORE saving. QuickBooks does this silently; a figure
          appearing in an account the user never chose is exactly the kind of
          surprise that makes people distrust their own books. */}
      {anyEntered && (
        <Card className="p-lg">
          <div className="flex items-center gap-sm">
            {balanced ? (
              <Check className="size-4 shrink-0 text-success" />
            ) : (
              <Scale className="size-4 shrink-0 text-primary" />
            )}
            <h2 className="text-h4 text-text-primary">
              {balanced ? 'The two sides match' : 'What will be balanced for you'}
            </h2>
          </div>

          <dl className="mt-md grid gap-sm sm:grid-cols-3">
            <div>
              <dt className="text-caption text-text-secondary">Owns</dt>
              <dd className="text-h5 tabular text-text-primary">
                {formatMoney(ownTotal)}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">Owes and put in</dt>
              <dd className="text-h5 tabular text-text-primary">
                {formatMoney(oweTotal)}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">Difference</dt>
              <dd
                className={cn(
                  'text-h5 tabular',
                  balanced ? 'text-success' : 'text-primary',
                )}
              >
                {formatMoney(difference.abs())}
              </dd>
            </div>
          </dl>

          {needsPlug && plugAccount && (
            <p className="mt-md rounded-md bg-primary-tint p-md text-body-sm text-text-primary">
              A line for {formatMoney(difference.abs())} will be added to{' '}
              <strong>
                {plugAccount.accountNumber} · {plugAccount.name}
              </strong>{' '}
              as a {difference.greaterThan(0) ? 'credit' : 'debit'}, so the entry
              balances. That account is where the value you brought into the
              business sits until it is reclassified.
            </p>
          )}

          {needsPlug && !plugAccount && (
            <p className="mt-md rounded-md border border-danger-light bg-danger-lighter p-md text-body-sm text-text-primary">
              The two sides do not match and there is no equity account to put the
              difference in.{' '}
              <Link to="/accounts/new" className="text-primary underline">
                Add one to the chart of accounts
              </Link>{' '}
              first.
            </p>
          )}

          {balanced && (
            <p className="mt-md text-body-sm text-text-secondary">
              Nothing needs balancing — the two sides already agree.
            </p>
          )}
        </Card>
      )}

      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-sm pb-xl">
        <Button asChild variant="secondary" disabled={busy}>
          <Link to="/journal-entries">Cancel</Link>
        </Button>
        <Button onClick={submit} disabled={busy || !anyEntered}>
          {busy ? 'Posting…' : cap.submitLabel('Post opening balances')}
        </Button>
      </div>
    </div>
  );
}
