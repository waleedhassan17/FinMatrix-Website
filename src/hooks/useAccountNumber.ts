import { useMemo } from 'react';

import {
  accountNumberRangeText,
  isAccountNumberInRange,
  suggestAccountNumbers,
  type Account,
  type AccountType,
} from '@/models/account';

export interface UseAccountNumberResult {
  /** The number to prefill. Empty when the sub-type has not been chosen yet. */
  suggested: string;
  /** A few free numbers to offer as chips, the suggestion included. */
  options: string[];
  /** "Expenses run from 5000–7999" — shown as a hint under the field. */
  rangeText: string;
  /** Why the typed number is wrong, or '' if it is fine. Empty input is fine. */
  rangeError: string;
  /** Whether this number is already on another account. */
  isDuplicate: boolean;
}

/**
 * Suggest an account number, and explain a bad one.
 *
 * The app has a hook of this name that nothing imports, and its account form
 * instead auto-assigns a number into a locked field — so a user who wants 6150
 * to sit beside their existing 6100 cannot have it. Here the number is
 * **suggested and editable**, with the convention stated as a hint and a
 * violation named inline.
 *
 * Worth being clear about what this enforces: the server checks only that the
 * number is at least two characters and unique in the company. The
 * 1000/2000/3000/4000/5000 banding is the client's convention to keep, and the
 * reason to keep it is that nothing downstream will ever complain — a 1500
 * expense account simply sorts into the middle of the assets on every report
 * ordered by number, for as long as the company exists.
 */
export function useAccountNumber(
  type: AccountType,
  subType: string,
  accountNumber: string,
  accounts: readonly Account[],
  /** On edit, the account being changed — excluded from the duplicate check. */
  editingId = '',
): UseAccountNumberResult {
  const options = useMemo(
    () => (subType ? suggestAccountNumbers(type, subType, accounts, 4) : []),
    [type, subType, accounts],
  );

  const typed = accountNumber.trim();

  const rangeError = useMemo(() => {
    if (typed === '') return '';
    if (!/^\d+$/.test(typed)) return 'Use digits only';
    if (!isAccountNumberInRange(typed, type)) {
      return `Outside the usual range — ${accountNumberRangeText(type)}`;
    }
    return '';
  }, [typed, type]);

  const isDuplicate = useMemo(
    () =>
      typed !== '' &&
      accounts.some((a) => a.accountNumber === typed && a.id !== editingId),
    [typed, accounts, editingId],
  );

  return {
    suggested: options[0] ?? '',
    options,
    rangeText: `${accountNumberRangeText(type)}`,
    rangeError,
    isDuplicate,
  };
}

export default useAccountNumber;
