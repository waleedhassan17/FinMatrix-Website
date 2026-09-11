import type { QueryClient } from '@tanstack/react-query';

/**
 * Everything a delivery action can make stale.
 *
 * Assigning raises a sales order and moves stock to Goods in Transit;
 * approving a completion raises an invoice and posts the sale; rejecting and
 * cancelling restock. So the books, the stock and the documents all move —
 * not just the delivery list. `approvals` covers a staff undo request.
 */
const KEYS = [
  'deliveries',
  'delivery-personnel',
  'inventory',
  'sales-orders',
  'invoices',
  'credit-memos',
  'customers',
  'reports',
  'dashboard',
  'accounts',
  'journal-entries',
  'approvals',
];

export const invalidateDeliveries = (queryClient: QueryClient) => {
  for (const key of KEYS) queryClient.invalidateQueries({ queryKey: [key] });
};
