// ═══════════════════════════════════════════════════════
// FinMatrix Web — Inventory Network (lookup only)
// ═══════════════════════════════════════════════════════
// Module 19 builds the inventory screens. All that exists here is the list
// call the invoice line editor needs to offer an item picker — linking a line
// to an `itemId` is what makes the server post COGS and decrement stock, so an
// invoice raised without it behaves differently from one raised on the phone.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import { toNumber } from '@/utils/money';

export interface InventoryItemOption {
  id: string;
  sku: string;
  name: string;
  sellingPrice: number;
  /**
   * What the item COSTS, a separate column from what it sells for. A purchase
   * order is priced at this; putting the selling price on a PO line would
   * quietly order stock at retail.
   */
  unitCost: number;
  quantityOnHand: number;
}

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});

const mapItem = (raw: unknown): InventoryItemOption => {
  const r = asRaw(raw);
  return {
    id: String(r.id ?? r.itemId ?? ''),
    sku: String(r.sku ?? ''),
    name: String(r.name ?? ''),
    sellingPrice: toNumber((r.sellingPrice ?? r.unitPrice ?? r.price) as never),
    unitCost: toNumber((r.unitCost ?? r.costPrice) as never),
    quantityOnHand: toNumber((r.quantityOnHand ?? r.quantity) as never),
  };
};

/**
 * Items for the picker.
 *
 * The default page size of 50 truncates the dropdown in any real warehouse —
 * the app raised it for the same reason — so this asks for the server's
 * maximum of 200.
 *
 * Callers must gate on `useFeature('inventory')`: the whole `/inventory`
 * controller is `@RequiresFeature('inventory')`, so a `small_business` or
 * `large_org` company gets a guaranteed 403 here.
 */
export const getInventoryItems = async (params?: {
  search?: string;
  limit?: number;
}): Promise<InventoryItemOption[]> => {
  try {
    const response = await api.get('/inventory/items', {
      params: { limit: 200, ...params },
    });
    const data = unwrapEnvelope(response.data);
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(asRaw(data).data)
        ? (asRaw(data).data as unknown[])
        : Array.isArray(asRaw(data).items)
          ? (asRaw(data).items as unknown[])
          : [];
    return rows.map(mapItem).filter((i) => i.id);
  } catch (e) {
    throw toApiError(e);
  }
};
