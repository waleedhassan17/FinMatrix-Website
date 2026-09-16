import type { QueryClient } from '@tanstack/react-query';

/**
 * Everything a posting can make stale.
 *
 * A receipt, bill, invoice, goods receipt or credit writes journal entries, so
 * the General Ledger, the statements, account balances and the dashboard move
 * with it — not only the document's own list. Posting pages used to refresh
 * just their own module, so a ledger opened within the 30-second cache window
 * (or left open in another tab) kept showing the books as they were: QA's
 * "entries are not updating".
 */
const KEYS = [
  'payments',
  'invoices',
  'bills',
  'customers',
  'vendors',
  'purchase-orders',
  'sales-orders',
  'estimates',
  'credit-memos',
  'vendor-credits',
  'inventory',
  'deliveries',
  'journal-entries',
  'reports',
  'accounts',
  'dashboard',
  'approvals',
  'search',
];

export const invalidateAfterPosting = (queryClient: QueryClient) => {
  for (const key of KEYS) queryClient.invalidateQueries({ queryKey: [key] });
};
