import type { QueryClient } from '@tanstack/react-query';

/**
 * Everything a stock change can make stale.
 *
 * An adjustment or opening balance posts a journal entry, so the reports, the
 * chart of accounts balances and the dashboard move with it — not just the
 * item. `approvals` covers a staff request landing in My Requests and the
 * sidebar badge.
 */
const KEYS = ['inventory', 'reports', 'dashboard', 'accounts', 'journal-entries', 'approvals'];

export const invalidateInventory = (queryClient: QueryClient) => {
  for (const key of KEYS) queryClient.invalidateQueries({ queryKey: [key] });
};
