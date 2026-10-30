import { useInfiniteQuery } from '@tanstack/react-query';

import type { ReportRange } from '@/models/reportPeriod';
import { getAccountRegister } from '@/networks/reports/accountRegisterNetwork';
import type { AccountRegister } from '@/serializers/reportInvestigateSerializers';

export const REGISTER_PAGE = 50;

/**
 * How a statement line is compared with the register behind it.
 *
 *   closing  — the line is a balance (balance sheet, closing trial balance):
 *              it should equal the register's closing balance.
 *   movement — the line is a period's activity (P&L, movement trial balance):
 *              it should equal closing − opening.
 */
export type TieBasis = 'closing' | 'movement';

const CREDIT_NORMAL = new Set(['revenue', 'liability', 'equity']);

/**
 * Does the register tie — internally (opening + Σ entries = closing) and to
 * the line it was opened from? Both are comparisons of server figures to the
 * paisa; nothing is re-added here.
 */
export const registerTies = (
  register: Pick<AccountRegister, 'account' | 'openingBalance' | 'periodDebit' | 'periodCredit' | 'closingBalance'> &
    Partial<Pick<AccountRegister, 'periodNet'>>,
  lineAmount: number | null,
  basis: TieBasis,
): { internal: boolean; toLine: boolean | null } => {
  // The server's signed movement when it sends one; otherwise its debits and
  // credits read on the account's normal side.
  const creditNormal = CREDIT_NORMAL.has(register.account.accountType);
  const period =
    register.periodNet ??
    (creditNormal ? register.periodCredit - register.periodDebit : register.periodDebit - register.periodCredit);
  const internal = Math.abs(register.openingBalance + period - register.closingBalance) < 0.005;
  if (lineAmount === null) return { internal, toLine: null };
  const compared = basis === 'closing' ? register.closingBalance : register.closingBalance - register.openingBalance;
  return { internal, toLine: Math.abs(compared - lineAmount) < 0.005 };
};

export const registerQueryKey = (accountCode: string, range: ReportRange) =>
  ['reports', 'register', accountCode, range.startDate, range.endDate] as const;

export function useAccountRegister(accountCode: string, range: ReportRange) {
  return useInfiniteQuery({
    queryKey: registerQueryKey(accountCode, range),
    queryFn: ({ pageParam }) => getAccountRegister(accountCode, range, pageParam, REGISTER_PAGE),
    initialPageParam: 1,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.entries.length, 0);
      return loaded < last.total ? all.length + 1 : undefined;
    },
  });
}

