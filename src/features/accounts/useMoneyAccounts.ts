import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  isMoneyAccount,
  misfiledMoneyAccounts,
  type Account,
} from '@/models/account';
import { getAccounts } from '@/networks/accounting/accountNetwork';

export interface MoneyAccounts {
  /** Every active account — the chart the two lists below are drawn from. */
  accounts: Account[];
  /** Active cash and bank accounts, by number: what money can move through. */
  money: Account[];
  /** Accounts named like a bank or cash account but not set up as one. */
  misfiled: Account[];
  /** 1000 Cash — where refunds, tax and payroll went before there was a choice. */
  cash: Account | null;
  isLoading: boolean;
}

/**
 * The company's cash and bank accounts, for every screen that moves money.
 *
 * One read of the whole active chart rather than of the assets alone: the
 * accounts that are NOT money matter too, because a bank account saved by
 * mistake as an expense is exactly the one somebody comes looking for.
 * Keyed under `accounts`, so creating or editing an account refreshes it.
 */
export function useMoneyAccounts(): MoneyAccounts {
  const query = useQuery({
    queryKey: ['accounts', 'money'],
    queryFn: () => getAccounts({ isActive: true }),
  });

  return useMemo(() => {
    const accounts = query.data ?? [];
    const money = accounts
      .filter(isMoneyAccount)
      .sort((a, b) =>
        a.accountNumber.localeCompare(b.accountNumber, undefined, { numeric: true }),
      );
    return {
      accounts,
      money,
      misfiled: misfiledMoneyAccounts(accounts),
      cash: money.find((a) => a.accountNumber === '1000') ?? null,
      isLoading: query.isLoading,
    };
  }, [query.data, query.isLoading]);
}
