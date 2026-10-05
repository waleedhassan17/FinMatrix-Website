import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Landmark, Lock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { BackButton, CancelButton } from '@/components/layout/BackLink';
import { useLeaveForm } from '@/features/shell/navHistory';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { Textarea } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAccountNumber } from '@/hooks/useAccountNumber';
import { cn } from '@/lib/cn';
import {
  ACCOUNT_TYPE_HINTS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_ORDER,
  ACCOUNT_TYPE_SINGULAR,
  accountToFormData,
  describeAccountKind,
  emptyAccountForm,
  normalBalanceFor,
  parentOptionsFor,
  subTypeOptions,
  suggestedMoneyKind,
  validateAccountForm,
  type AccountFormData,
  type AccountType,
  type MoneyKind,
} from '@/models/account';
import {
  createAccount,
  getAccountById,
  getAccounts,
  updateAccount,
} from '@/networks/accounting/accountNetwork';
import { formatMoney, toDecimal } from '@/utils/money';

const TYPE_OPTIONS = ACCOUNT_TYPE_ORDER.map((t) => ({
  value: t,
  label: ACCOUNT_TYPE_SINGULAR[t],
}));

/** `?preset=bank` / `?preset=cash`: a new account that starts as one. */
const presetKind = (value: string | null): MoneyKind | null =>
  value === 'bank' ? 'Bank' : value === 'cash' ? 'Cash' : null;

export default function AccountFormPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const [searchParams] = useSearchParams();
  const isEditing = Boolean(accountId);
  const leave = useLeaveForm();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<AccountFormData>(() => {
    // "New bank account" lands here already an asset of kind Bank, so there is
    // no type to get wrong. Otherwise it starts as an expense, the usual case.
    const preset = isEditing ? null : presetKind(searchParams.get('preset'));
    return preset
      ? { ...emptyAccountForm('asset'), subType: preset }
      : emptyAccountForm();
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** Whether the user has typed over the suggested number. */
  const [numberTouched, setNumberTouched] = useState(false);

  // The whole chart, for the duplicate check, the parent picker and the number
  // suggestion. Inactive accounts included: a deactivated account still owns its
  // number, and may still be a parent.
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', 'chart', 'all'],
    queryFn: () => getAccounts(),
  });

  const { data: existing, isLoading: loadingAccount } = useQuery({
    queryKey: ['accounts', accountId],
    queryFn: () => getAccountById(accountId!),
    enabled: isEditing,
  });

  useEffect(() => {
    if (existing?.account) {
      setForm(accountToFormData(existing.account));
      setNumberTouched(true);
    }
  }, [existing]);

  /**
   * Whether this account's type and number may still change. They may while
   * nothing refers to it — the server says so in `structure` — which is what
   * lets "Meezan Bank", saved by mistake as an Other Expense, be made the bank
   * account it was meant to be instead of abandoned.
   */
  const structureEditable = isEditing && (existing?.structure.editable ?? false);
  const structureLocked = isEditing && !structureEditable;
  const isSystem = isEditing && (existing?.account?.isSystemAccount ?? false);

  const number = useAccountNumber(
    form.type,
    form.subType,
    form.accountNumber,
    accounts,
    accountId ?? '',
  );

  // Prefill the number once a sub-type is chosen, and keep it in step while the
  // user has not taken it over. Auto-assigning into a LOCKED field is what the
  // app does, and it is the reason a user cannot put 6150 beside their 6100.
  useEffect(() => {
    if (structureLocked || numberTouched || !number.suggested) return;
    setForm((f) => ({ ...f, accountNumber: number.suggested }));
  }, [structureLocked, numberTouched, number.suggested]);

  const parentOptions = useMemo(
    () => [
      { value: '', label: 'No parent — a top-level account' },
      ...parentOptionsFor(accounts, form.type, accountId ?? ''),
    ],
    [accounts, form.type, accountId],
  );

  const patch = (p: Partial<AccountFormData>) => setForm((f) => ({ ...f, ...p }));

  /**
   * Changing the type invalidates the sub-type, the parent and the number — all
   * three are type-scoped, and the server would reject the stale sub-type with
   * INVALID_SUB_TYPE. Clearing them is honest; carrying them over is not.
   */
  const changeType = (type: AccountType) => {
    // On edit the old number sits in the old type's range, so it is
    // re-suggested for the new one rather than carried over.
    const renumber = isEditing || !numberTouched;
    setForm((f) => ({
      ...f,
      type,
      subType: '',
      parentId: '',
      accountNumber: renumber ? '' : f.accountNumber,
    }));
    if (renumber) setNumberTouched(false);
    setErrors({});
  };

  /** One click from "MEEZAN BANK" as an expense to an asset of kind Bank. */
  const makeMoneyAccount = (kind: MoneyKind) => {
    setForm((f) => ({
      ...f,
      type: 'asset',
      subType: kind,
      parentId: f.type === 'asset' ? f.parentId : '',
      accountNumber: f.type === 'asset' ? f.accountNumber : '',
    }));
    if (form.type !== 'asset') setNumberTouched(false);
    setErrors({});
  };

  // A name that reads like a bank or cash account on an account that is not
  // one: say so before it is saved, and offer the fix.
  const moneyKind = suggestedMoneyKind(form.name);
  const misfiled =
    moneyKind !== null && !(form.type === 'asset' && form.subType === moneyKind);

  const save = useMutation({
    mutationFn: () =>
      isEditing
        ? updateAccount(accountId!, form, existing?.account ?? undefined)
        : createAccount(form),
    onSuccess: (account) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      // A new account changes every picker that reads the chart, and an opening
      // balance posts a journal entry, which moves the dashboard.
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(isEditing ? 'Account updated' : 'Account created', {
        description: `${account.accountNumber} · ${account.name}`,
      });
      leave(`/accounts/${account.id}`);
    },
    onError: (e: Error) =>
      toast.error(
        isEditing ? 'Could not update account' : 'Could not create account',
        { description: e.message },
      ),
  });

  const submit = () => {
    const errs = validateAccountForm(form, accounts, {
      isEditing,
      editingId: accountId,
      structureEditable,
    });
    setErrors(errs);
    if (Object.keys(errs).length === 0) save.mutate();
  };

  if (isEditing && loadingAccount) {
    return <p className="text-body-sm text-text-secondary">Loading account…</p>;
  }

  const busy = save.isPending;
  const opening = toDecimal(form.openingBalance);
  const debitNormal = normalBalanceFor(form.type) === 'debit';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-lg">
      <BackButton fallback={{ to: isEditing ? `/accounts/${accountId}` : '/accounts', label: isEditing ? 'Account' : 'Chart of accounts' }} />

      <div>
        <h1 className="text-h2 text-text-primary">
          {isEditing ? 'Edit account' : 'New account'}
        </h1>
        <p className="text-body-sm text-text-secondary">
          {!isEditing
            ? 'Accounts are grouped by what they represent, and numbered by convention within each group.'
            : structureEditable
              ? 'Nothing refers to this account yet, so its type and number can still change.'
              : 'Its type and number are fixed — something already refers to this account.'}
        </p>
      </div>

      {misfiled && !structureLocked && (
        <div className="flex flex-wrap items-start gap-sm rounded-md border border-primary-light bg-primary-tint p-md">
          <Landmark className="mt-[2px] size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 text-body-sm text-text-primary">
            <p className="text-label-md">
              Is this a {moneyKind === 'Cash' ? 'cash' : 'bank'} account?
            </p>
            <p className="mt-xxs text-text-secondary">
              To pay from it and deposit into it, it has to be an Asset of kind{' '}
              {moneyKind}. Set up as {describeAccountKind(form)}, it will never appear
              where money is paid or received.
            </p>
          </div>
          <Button size="sm" onClick={() => moneyKind && makeMoneyAccount(moneyKind)}>
            Make it a {moneyKind === 'Cash' ? 'cash' : 'bank'} account
          </Button>
        </div>
      )}
      {misfiled && structureLocked && !isSystem && (
        <div className="flex items-start gap-sm rounded-md bg-surface-2 p-md">
          <Info className="mt-[2px] size-4 shrink-0 text-text-secondary" />
          <p className="text-body-sm text-text-secondary">
            This looks like a {moneyKind === 'Cash' ? 'cash' : 'bank'} account, but it is set up as{' '}
            {describeAccountKind(form)} and is already in use, so it can’t be changed. <Link to="/accounts/new?preset=bank" className="text-primary underline underline-offset-2">Create a bank account</Link>{' '}
            and move anything on this one across with a journal entry.
          </p>
        </div>
      )}

      <Card className="p-lg">
        <SectionHeader title="What kind of account" />

        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Select
            label="Type *"
            value={form.type}
            onChange={(v) => changeType(v as AccountType)}
            options={TYPE_OPTIONS}
            disabled={structureLocked}
            hint={
              structureLocked
                ? (existing?.structure.reason ?? 'Fixed — postings already reference it.')
                : ACCOUNT_TYPE_HINTS[form.type]
            }
          />

          <Select
            label="Kind *"
            value={form.subType}
            onChange={(subType) => {
              patch({ subType });
              setErrors((e) => ({ ...e, subType: '' }));
            }}
            options={subTypeOptions(form.type)}
            placeholder={`Choose a kind of ${ACCOUNT_TYPE_SINGULAR[form.type].toLowerCase()}…`}
            error={errors.subType}
            disabled={isSystem}
            hint={
              isSystem
                ? 'Fixed — automatic posting relies on it.'
                : form.type === 'asset' && (form.subType === 'Bank' || form.subType === 'Cash')
                  ? 'Offered wherever money is paid or received.'
                  : undefined
            }
          />
        </div>
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Number and name" />

        <div className="mt-md grid gap-md sm:grid-cols-[200px_1fr]">
          <Input
            label="Account number *"
            value={form.accountNumber}
            onChange={(e) => {
              setNumberTouched(true);
              patch({ accountNumber: e.target.value.replace(/[^0-9]/g, '') });
              setErrors((er) => ({ ...er, accountNumber: '' }));
            }}
            inputMode="numeric"
            disabled={structureLocked}
            className="tabular"
            error={errors.accountNumber}
            hint={
              structureLocked ? (
                <span className="flex items-center gap-xxs">
                  <Lock className="size-3" />
                  Fixed — in use
                </span>
              ) : (
                number.rangeError ||
                `${ACCOUNT_TYPE_LABELS[form.type]} run from ${number.rangeText}`
              )
            }
          />

          <Input
            label="Name *"
            value={form.name}
            onChange={(e) => {
              patch({ name: e.target.value });
              setErrors((er) => ({ ...er, name: '' }));
            }}
            placeholder="e.g. Packaging Materials"
            error={errors.name}
          />
        </div>

        {/* Free numbers to take in one click, rather than a locked field or a
            guess at what is already used. */}
        {!structureLocked && number.options.length > 0 && (
          <div className="mt-md flex flex-wrap items-center gap-xs">
            <span className="text-caption text-text-secondary">Free numbers:</span>
            {number.options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setNumberTouched(true);
                  patch({ accountNumber: option });
                  setErrors((er) => ({ ...er, accountNumber: '' }));
                }}
                className={cn(
                  'rounded-full border px-sm py-xxs text-label-md tabular transition-colors',
                  form.accountNumber === option
                    ? 'border-primary bg-primary-tint text-primary'
                    : 'border-border text-text-secondary hover:border-primary hover:text-primary',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Where it sits" />

        <Combobox
          label="Parent account"
          value={form.parentId}
          onChange={(parentId) => patch({ parentId })}
          options={parentOptions}
          placeholder="No parent — a top-level account"
          searchPlaceholder="Search accounts…"
          emptyText={`No other ${ACCOUNT_TYPE_LABELS[form.type].toLowerCase()} to nest under.`}
          error={errors.parentId}
          hint={`Only ${ACCOUNT_TYPE_LABELS[form.type].toLowerCase()} can be a parent, so the chart and the statements agree.`}
          containerClassName="mt-md"
        />

        <Textarea
          label="Description"
          value={form.description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="What belongs in this account — useful a year from now."
          containerClassName="mt-md"
        />
      </Card>

      {/* Create only. `update()` never reads openingBalance — the figure already
          posted its journal entry, and editing the field would not move it. */}
      {!isEditing && (
        <Card className="p-lg">
          <SectionHeader title="Opening balance" />

          <Input
            label="Opening balance"
            value={form.openingBalance}
            onChange={(e) => {
              patch({ openingBalance: e.target.value.replace(/[^0-9.-]/g, '') });
              setErrors((er) => ({ ...er, openingBalance: '' }));
            }}
            inputMode="decimal"
            placeholder="0.00"
            className="tabular"
            error={errors.openingBalance}
            containerClassName="mt-md max-w-64"
            hint="Leave blank if the account starts at nothing."
          />

          {!opening.isZero() && !errors.openingBalance && (
            <div className="mt-md flex items-start gap-sm rounded-md border border-primary-light bg-primary-tint p-md">
              <Info className="mt-[2px] size-4 shrink-0 text-primary" />
              <div className="text-body-sm text-text-primary">
                <p>
                  This posts a journal entry straight away:{' '}
                  <strong>
                    {debitNormal === opening.greaterThan(0) ? 'debit' : 'credit'}{' '}
                    {form.accountNumber || 'this account'}
                  </strong>{' '}
                  {formatMoney(opening.abs())}, against{' '}
                  <strong>Opening Balance Equity (3900)</strong>.
                </p>
                <p className="mt-xxs text-text-secondary">
                  A positive figure means the balance runs the normal way for
                  {' '}{ACCOUNT_TYPE_LABELS[form.type].toLowerCase()} — a{' '}
                  {debitNormal ? 'debit' : 'credit'}. The account and the entry
                  are saved together, so the books cannot end up one without the
                  other.
                </p>
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap justify-end gap-sm pb-xl">
        <CancelButton fallback={isEditing ? `/accounts/${accountId}` : '/accounts'} disabled={busy} />
        <Button onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : isEditing ? 'Save changes' : 'Create account'}
        </Button>
      </div>
    </div>
  );
}
