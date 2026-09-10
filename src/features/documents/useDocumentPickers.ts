import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useFeature } from '@/hooks/useCapability';
import type { Customer } from '@/models/customer';
import { getInventoryItems } from '@/networks/inventory/inventoryNetwork';
import { getCustomers } from '@/networks/sales/customerNetwork';
import { getVendors } from '@/networks/purchases/vendorNetwork';
import type { Vendor } from '@/models/vendor';

/**
 * The two pickers every sales document form needs.
 *
 * Shared so the option labels are identical across invoices, estimates and
 * sales orders — a customer that reads "Acme — Acme Traders" on one form and
 * "Acme" on another looks like two different records.
 */

export function useCustomerOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ['customers', 'picker'],
    queryFn: () => getCustomers({ limit: 200 }),
  });

  const customers = useMemo(() => data?.customers ?? [], [data]);

  const options = useMemo(
    () =>
      customers
        // Inactive customers stay out of pickers but keep their history.
        .filter((c) => c.isActive)
        .map((c) => ({
          value: c.id,
          label: c.company ? `${c.name} — ${c.company}` : c.name,
        })),
    [customers],
  );

  const byId = useMemo(
    () => new Map<string, Customer>(customers.map((c) => [c.id, c])),
    [customers],
  );

  return { options, byId, customers, isLoading };
}

export function useInventoryOptions() {
  // The whole /inventory controller is @RequiresFeature('inventory'), so
  // asking without the feature is a guaranteed 403.
  const enabled = useFeature('inventory');

  const { data: items } = useQuery({
    queryKey: ['inventory', 'items', 'picker'],
    queryFn: () => getInventoryItems(),
    enabled,
  });

  const options = useMemo(
    () => [
      { value: '', label: 'No item (free text)' },
      ...(items ?? []).map((i) => ({
        value: i.id,
        label: `${i.sku ? `${i.sku} — ` : ''}${i.name}`,
      })),
    ],
    [items],
  );

  return { options, items: items ?? [], enabled };
}

/**
 * The vendor picker, shared by the bill and purchase-order forms.
 *
 * The label is the company name alone — a vendor has no name/company pair to
 * join, unlike a customer.
 */
export function useVendorOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ['vendors', 'picker'],
    queryFn: () => getVendors({ limit: 200 }),
  });

  const vendors = useMemo(() => data?.vendors ?? [], [data]);

  const options = useMemo(
    () => vendors.filter((v) => v.isActive).map((v) => ({ value: v.id, label: v.name })),
    [vendors],
  );

  const byId = useMemo(
    () => new Map<string, Vendor>(vendors.map((v) => [v.id, v])),
    [vendors],
  );

  return { options, byId, vendors, isLoading };
}
