import { AlertCircle, Plus } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { NewBankAccountDialog } from '@/features/accounts/NewBankAccountDialog';
import { useMoneyAccounts } from '@/features/accounts/useMoneyAccounts';
import { useCapability } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { describeAccountKind, suggestedMoneyKind } from '@/models/account';
import { formatMoney } from '@/utils/money';

export interface MoneyAccountPickerProps {
  label: string;
  /** The chosen account's id; '' for none (or for Automatic, when offered). */
  value: string;
  onChange: (accountId: string) => void;
  error?: string;
  /** Under the field. Defaults to the chosen account's balance. */
  hint?: ReactNode;
  /**
   * A first option meaning "let the server choose" (value ''), as receipts
   * offer: Cash for a cash payment, Business Checking otherwise.
   */
  automaticLabel?: string;
  /**
   * Fill in 1000 Cash while nothing is chosen. For refunds, tax and payroll,
   * which always paid from Cash: the default stays, but it is now visible.
   */
  defaultToCash?: boolean;
  /** The "New bank account" row. Off inside a dialog: no dialog on a dialog. */
  allowCreate?: boolean;
  disabled?: boolean;
  containerClassName?: string;
}

/**
 * Which cash or bank account money moves through — Peachtree's Cash Account.
 *
 * Every active account of kind Cash or Bank is offered, with what it holds, so
 * a company with MCB, Allied and Meezan accounts picks the one the money
 * really went through. Exactly the accounts the server accepts: an expense or
 * an inactive bank is never offered and then refused.
 *
 * Two ways out when the account wanted is not in the list:
 *   - "New bank account" at the foot of the list makes one and selects it,
 *     without leaving the form (owners only — the chart is theirs);
 *   - an account named like a bank but set up as something else — "MEEZAN
 *     BANK" saved as an Other Expense — is named under the field with why it
 *     is missing, and a link to put it right.
 */
export function MoneyAccountPicker({
  label,
  value,
  onChange,
  error,
  hint,
  automaticLabel,
  defaultToCash,
  allowCreate = true,
  disabled,
  containerClassName,
}: MoneyAccountPickerProps) {
  const { money, misfiled, cash } = useMoneyAccounts();
  const canManage = useCapability('chartOfAccounts.manage').allowed;
  const [creating, setCreating] = useState(false);
  // A fresh dialog each time it opens, so it starts with empty fields.
  const [createKey, setCreateKey] = useState(0);

  useEffect(() => {
    if (defaultToCash && !value && cash) onChange(cash.id);
  }, [defaultToCash, value, cash, onChange]);

  const options = useMemo<ComboboxOption[]>(
    () => [
      ...(automaticLabel ? [{ value: '', label: automaticLabel }] : []),
      ...money.map((a) => ({
        value: a.id,
        label: `${a.accountNumber} · ${a.name}`,
        meta: formatMoney(a.balance),
      })),
    ],
    [automaticLabel, money],
  );

  const selected = money.find((a) => a.id === value);

  return (
    <div className={cn('flex flex-col gap-xs', containerClassName)}>
      <Combobox
        label={label}
        value={value}
        onChange={onChange}
        options={options}
        placeholder="Choose an account…"
        searchPlaceholder="Search cash and bank accounts…"
        emptyText="No cash or bank account matches."
        error={error}
        hint={hint ?? (selected ? `Balance ${formatMoney(selected.balance)}` : undefined)}
        disabled={disabled}
        footerAction={
          allowCreate && canManage && !disabled
            ? {
                label: 'New bank account',
                icon: <Plus className="size-4" />,
                onSelect: () => {
                  setCreateKey((k) => k + 1);
                  setCreating(true);
                },
              }
            : undefined
        }
      />

      {/* Inside a dialog (no create action) one short line, not a list to fix
          from the middle of confirming something. */}
      {misfiled.length > 0 && !allowCreate && (
        <p className="flex items-start gap-xs text-caption text-text-secondary">
          <AlertCircle className="mt-[2px] size-3.5 shrink-0 text-warning" />
          <span>
            {misfiled.length === 1
              ? `${misfiled[0].name} isn’t set up as a bank or cash account, so it isn’t listed.`
              : `${misfiled.length} accounts named like banks aren’t set up as bank or cash accounts, so they aren’t listed.`}{' '}
            {canManage ? (
              <Link to="/accounts" className="text-primary underline underline-offset-2">
                Chart of Accounts
              </Link>
            ) : (
              'Ask the owner to fix it in the Chart of Accounts.'
            )}
          </span>
        </p>
      )}

      {misfiled.length > 0 && allowCreate && (
        <ul className="flex flex-col gap-xxs" aria-label="Accounts that cannot be used here">
          {misfiled.slice(0, 3).map((a) => {
            const kind = suggestedMoneyKind(a.name) === 'Cash' ? 'cash' : 'bank';
            return (
              <li
                key={a.id}
                className="flex items-start gap-xs text-caption text-text-secondary"
              >
                <AlertCircle className="mt-[2px] size-3.5 shrink-0 text-warning" />
                <span>
                  <strong className="font-medium text-text-primary">
                    {a.accountNumber} · {a.name}
                  </strong>{' '}
                  is set up as {describeAccountKind(a)}, so money can’t move
                  through it.{' '}
                  {canManage ? (
                    <Link
                      to={`/accounts/${a.id}/edit`}
                      className="text-primary underline underline-offset-2"
                    >
                      Make it a {kind} account
                    </Link>
                  ) : (
                    `Ask the owner to make it a ${kind} account in the Chart of Accounts.`
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {canManage && allowCreate && (
        <NewBankAccountDialog
          key={createKey}
          open={creating}
          onOpenChange={setCreating}
          onCreated={(account) => onChange(account.id)}
        />
      )}
    </div>
  );
}

export default MoneyAccountPicker;
