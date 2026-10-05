import { useQuery } from '@tanstack/react-query';

import type { Account } from '@/models/account';
import { getAccounts } from '@/networks/accounting/accountNetwork';

/**
 * The whole chart, inactive accounts included — for naming the account a past
 * payment, refund or payroll run went through, which may since have been
 * switched off. Shares its cache with the account form.
 */
export function useChartAccounts(): Account[] {
  const { data = [] } = useQuery({
    queryKey: ['accounts', 'chart', 'all'],
    queryFn: () => getAccounts(),
  });
  return data;
}
