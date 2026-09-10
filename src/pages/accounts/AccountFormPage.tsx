import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Info, Lock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

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
  emptyAccountForm,
  normalBalanceFor,
  parentOptionsFor,
  subTypeOptions,
  validateAccountForm,
  type AccountFormData,
  type AccountType,
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

export default function AccountFormPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const isEditing = Boolean(accountId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<AccountFormData>(() => emptyAccountForm());
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
    if (isEditing || numberTouched || !number.suggested) return;
    setForm((f) => ({ ...f, accountNumber: number.suggested }));
  }, [isEditing, numberTouched, number.suggested]);

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
    setForm((f) => ({
      ...f,
      type,
      subType: '',
      parentId: '',
      accountNumber: numberTouched ? f.accountNumber : '',
    }));
    setErrors({});
  };

  const save = useMutation({
    mutationFn: () =>
      isEditing ? updateAccount(accountId!, form) : createAccount(form),
    onSuccess: (account) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      // A new account changes every picker that reads the chart, and an opening
      // balance posts a journal entry, which moves the dashboard.
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(isEditing ? 'Account updated' : 'Account created', {
        description: `${account.accountNumber} · ${account.name}`,
      });
      navigate(`/accounts/${account.id}`, { replace: true });
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
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to={isEditing ? `/accounts/${accountId}` : '/accounts'}>
          <ArrowLeft className="size-4" />
          {isEditing ? 'Account' : 'Chart of accounts'}
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">
          {isEditing ? 'Edit account' : 'New account'}
        </h1>
        <p className="text-body-sm text-text-secondary">
          {isEditing
            ? 'The account number and type are fixed once an account exists — postings already reference them.'
            : 'Accounts are grouped by what they represent, and numbered by convention within each group.'}
        </p>
      </div>

      <Card className="p-lg">
        <SectionHeader title="What kind of account" />

        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Select
            label="Type *"
            value={form.type}
            onChange={(v) => changeType(v as AccountType)}
            options={TYPE_OPTIONS}
            disabled={isEditing}
            hint={
              isEditing
                ? 'Fixed — postings already reference it.'
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
            disabled={isEditing}
            className="tabular"
            error={errors.accountNumber}
            hint={
              isEditing ? (
                <span className="flex items-center gap-xxs">
                  <Lock className="size-3" />
                  Fixed after creation
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
        {!isEditing && number.options.length > 0 && (
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
        <Button asChild variant="secondary" disabled={busy}>
          <Link to={isEditing ? `/accounts/${accountId}` : '/accounts'}>Cancel</Link>
        </Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : isEditing ? 'Save changes' : 'Create account'}
        </Button>
      </div>
    </div>
  );
}
