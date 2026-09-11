import type { QueryClient } from '@tanstack/react-query';

/**
 * Everything a payroll change can make stale. Processing a run posts a journal
 * entry, so the ledger, reports, balances and dashboard move with it.
 */
const KEYS = ['payroll', 'employees', 'journal-entries', 'reports', 'dashboard', 'accounts'];

export const invalidatePayroll = (queryClient: QueryClient) => {
  for (const key of KEYS) queryClient.invalidateQueries({ queryKey: [key] });
};
