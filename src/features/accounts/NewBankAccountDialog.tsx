import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import {
  suggestAccountNumbers,
  validateAccountForm,
  type Account,
  type AccountFormData,
  type MoneyKind,
} from '@/models/account';
import { createAccount, getAccounts } from '@/networks/accounting/accountNetwork';

const KINDS: { kind: MoneyKind; label: string; hint: string; placeholder: string }[] = [
  {
    kind: 'Bank',
    label: 'Bank account',
    hint: 'A current or savings account — MCB, Allied, Meezan.',
    placeholder: 'e.g. MCB Current Account',
  },
  {
    kind: 'Cash',
    label: 'Cash account',
    hint: 'Notes held on the premises — petty cash, a till.',
    placeholder: 'e.g. Petty Cash',
  },
];

/**
 * Add a bank (or cash) account without leaving the screen that needs it.
 *
 * Peachtree's account lookup has a New button for the same reason: the moment
 * you find the bank missing is the moment you are halfway through paying from
 * it, with the bills ticked, the amount typed and the proof attached. This
 * makes the account and hands it back, so the payment carries on.
 *
 * It is the New Account form narrowed to the one case that matters here — an
 * asset of kind Bank or Cash, numbered beside the accounts like it (1020 after
 * 1010) — so there is no type to get wrong.
 *
 * Mount it with a fresh `key` each time it opens: its fields start empty from
 * their initial state rather than being reset by an effect.
 */
export function NewBankAccountDialog({
  open,
  onOpenChange,
  onCreated,
  defaultKind = 'Bank',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (account: Account) => void;
  defaultKind?: MoneyKind;
}) {
  const queryClient = useQueryClient();
  // The whole chart, inactive included: a switched-off account still owns its number.
  const { data: chart = [] } = useQuery({
    queryKey: ['accounts', 'chart', 'all'],
    queryFn: () => getAccounts(),
    enabled: open,
  });

  const [kind, setKind] = useState<MoneyKind>(defaultKind);
  const [name, setName] = useState('');
  /** A number the user typed or picked; null while following the suggestion. */
  const [chosenNumber, setChosenNumber] = useState<string | null>(null);
  const [opening, setOpening] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const suggestions = useMemo(
    () => suggestAccountNumbers('asset', kind, chart, 4),
    [kind, chart],
  );
  // The suggestion, until the user types or picks a number of their own.
  const number = chosenNumber ?? suggestions[0] ?? '';
  const setNumber = (value: string) => {
    setChosenNumber(value);
    setErrors((er) => ({ ...er, accountNumber: '' }));
  };

  const form: AccountFormData = {
    accountNumber: number,
    name,
    type: 'asset',
    subType: kind,
    parentId: '',
    description: '',
    openingBalance: opening,
    isActive: true,
  };

  const save = useMutation({
    mutationFn: () => createAccount(form),
    onSuccess: (account) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      // An opening balance posts a journal entry, which moves the dashboard.
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(kind === 'Bank' ? 'Bank account added' : 'Cash account added', {
        description: `${account.accountNumber} · ${account.name}`,
      });
      onCreated(account);
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast.error('Could not add the account', { description: e.message }),
  });

  const submit = () => {
    const errs = validateAccountForm(form, chart, { isEditing: false });
    setErrors(errs);
    if (Object.keys(errs).length === 0) save.mutate();
  };

  const busy = save.isPending;
  const current = KINDS.find((k) => k.kind === kind) ?? KINDS[0];

  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-overlay" />
        <AlertDialog.Content
          className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[30rem] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-surface p-xl shadow-lg"
          onEscapeKeyDown={(e) => busy && e.preventDefault()}
        >
          <AlertDialog.Title className="text-h4 text-text-primary">
            New {kind === 'Bank' ? 'bank' : 'cash'} account
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-xs text-body-md text-text-secondary">
            Added to your Chart of Accounts as an asset, and offered wherever
            money is paid or received.
          </AlertDialog.Description>

          <div
            role="group"
            aria-label="Kind of account"
            className="mt-lg grid grid-cols-2 gap-xs"
          >
            {KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                aria-pressed={kind === k.kind}
                onClick={() => {
                  setKind(k.kind);
                  setErrors({});
                }}
                disabled={busy}
                className={cn(
                  'rounded-md border px-md py-sm text-left transition-colors',
                  kind === k.kind
                    ? 'border-primary bg-primary-tint text-primary'
                    : 'border-border text-text-primary hover:border-primary',
                )}
              >
                <span className="block text-label-md">{k.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-xxs text-caption text-text-tertiary">{current.hint}</p>

          <div className="mt-lg flex flex-col gap-md">
            <Input
              label="Name *"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrors((er) => ({ ...er, name: '' }));
              }}
              placeholder={current.placeholder}
              error={errors.name}
              disabled={busy}
              autoFocus
            />

            <div>
              <Input
                label="Account number *"
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                className="tabular"
                error={errors.accountNumber}
                hint={
                  kind === 'Bank'
                    ? 'Suggested beside 1010 Business Checking — any free number from 1000–1999 works.'
                    : 'Suggested beside 1000 Cash — any free number from 1000–1999 works.'
                }
                disabled={busy}
              />
              {suggestions.length > 1 && (
                <div className="mt-xs flex flex-wrap items-center gap-xs">
                  <span className="text-caption text-text-secondary">Free numbers:</span>
                  {suggestions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setNumber(option)}
                      disabled={busy}
                      className={cn(
                        'rounded-full border px-sm py-xxs text-label-md tabular transition-colors',
                        number === option
                          ? 'border-primary bg-primary-tint text-primary'
                          : 'border-border text-text-secondary hover:border-primary hover:text-primary',
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Input
              label="Opening balance"
              value={opening}
              onChange={(e) => {
                setOpening(e.target.value.replace(/[^0-9.-]/g, ''));
                setErrors((er) => ({ ...er, openingBalance: '' }));
              }}
              inputMode="decimal"
              placeholder="0.00"
              className="tabular"
              error={errors.openingBalance}
              hint="What it holds today, per its statement. Posts against Opening Balance Equity (3900). Leave blank to start at zero."
              disabled={busy}
            />
          </div>

          <div className="mt-xl flex justify-end gap-sm">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={busy}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button onClick={submit} disabled={busy}>
              {busy ? 'Adding…' : 'Add account'}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export default NewBankAccountDialog;
