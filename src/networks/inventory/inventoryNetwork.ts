// ═══════════════════════════════════════════════════════
// FinMatrix Web — Inventory Network
// ═══════════════════════════════════════════════════════
// The whole `/inventory` controller is `@RequiresFeature('inventory')`, so a
// `small_business` or `large_org` company gets a guaranteed 403 here — callers
// gate on `useFeature('inventory')`.
//
// Roles, as the controller has them (not as a brief might):
//   list / get / create / update / movements   admin, staff — direct
//   adjust                                     admin direct; staff → approval
//   reverse an adjustment                      admin direct; staff → approval
//   toggle, opening stock                      admin ONLY

import {
  api,
  isPendingApproval,
  toApiError,
  unwrapEnvelope,
  type PendingApproval,
} from '@/networks/network/apiHelpers';
import type { InventoryItem, StockMovement } from '@/models/inventory';
import {
  listRows,
  mapInventoryItem,
  mapStockMovement,
} from '@/serializers/inventorySerializer';
import { toNumber } from '@/utils/money';

// ─── Picker ─────────────────────────────────────────────
// The invoice, PO and delivery line editors need only a handful of fields.
// Linking a line to an `itemId` is what makes the server post COGS and move
// stock, so a line raised without it behaves differently from one on the phone.

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
 * the app raised it for the same reason — so this asks for 200.
 */
export const getInventoryItems = async (params?: {
  search?: string;
  limit?: number;
}): Promise<InventoryItemOption[]> => {
  try {
    const response = await api.get('/inventory/items', {
      params: { limit: 200, ...params },
    });
    return listRows(unwrapEnvelope(response.data)).map(mapItem).filter((i) => i.id);
  } catch (e) {
    throw toApiError(e);
  }
};

// ─── Items ──────────────────────────────────────────────

/**
 * The paging totals are stripped by the response envelope (it keeps only
 * `data`), so a server-paged list could never say how many pages there are.
 * One generous fetch, paged on the client; `truncated` says when it was not
 * everything.
 */
export const ITEM_LIST_LIMIT = 500;

export const getItems = async (): Promise<{ rows: InventoryItem[]; truncated: boolean }> => {
  try {
    const response = await api.get('/inventory/items', {
      params: { page: 1, limit: ITEM_LIST_LIMIT },
    });
    const rows = listRows(unwrapEnvelope(response.data)).map(mapInventoryItem);
    return { rows, truncated: rows.length >= ITEM_LIST_LIMIT };
  } catch (e) {
    throw toApiError(e);
  }
};

export const getItem = async (id: string): Promise<InventoryItem> => {
  try {
    const response = await api.get(`/inventory/items/${id}`);
    return mapInventoryItem(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const createItem = async (body: Record<string, string>): Promise<InventoryItem> => {
  try {
    const response = await api.post('/inventory/items', body);
    return mapInventoryItem(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const updateItem = async (
  id: string,
  body: Record<string, string>,
): Promise<InventoryItem> => {
  try {
    const response = await api.patch(`/inventory/items/${id}`, body);
    return mapInventoryItem(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** Flips `isActive` server-side; no body. Owner only. */
export const toggleItem = async (id: string): Promise<InventoryItem> => {
  try {
    const response = await api.patch(`/inventory/items/${id}/toggle`);
    return mapInventoryItem(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Stock the company held before it started using FinMatrix. Posts Dr Inventory
 * 1200 / Cr Opening Balance Equity 3900 at the item's unit cost. One-time and
 * owner only.
 */
export const setOpeningStock = async (
  id: string,
  body: { quantity: string; asOfDate: string },
): Promise<void> => {
  try {
    await api.post(`/inventory/items/${id}/opening-stock`, body);
  } catch (e) {
    throw toApiError(e);
  }
};

// ─── Adjustments ────────────────────────────────────────

export type InventoryWriteResult =
  | { pending: false }
  | { pending: true; approval: PendingApproval };

/**
 * Set an item's quantity. The owner's posts at once (stock, a movement and the
 * journal entry); a staff member's comes back as a pending approval and posts
 * NOTHING until the owner signs it.
 */
export const adjustItem = async (
  id: string,
  body: { itemId: string; newQty: string; reason: string; date?: string; notes?: string },
): Promise<InventoryWriteResult> => {
  try {
    const response = await api.post(`/inventory/items/${id}/adjust`, body);
    const payload = unwrapEnvelope(response.data);
    return isPendingApproval(payload) ? { pending: true, approval: payload } : { pending: false };
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Unwind a posted adjustment at the cost it was booked at. A correction, so it
 * sits with the other voids: the owner reverses, staff ask.
 */
export const reverseAdjustment = async (adjustmentId: string): Promise<InventoryWriteResult> => {
  try {
    const response = await api.post(`/inventory/adjustments/${adjustmentId}/reverse`);
    const payload = unwrapEnvelope(response.data);
    return isPendingApproval(payload) ? { pending: true, approval: payload } : { pending: false };
  } catch (e) {
    throw toApiError(e);
  }
};

// ─── Movements ──────────────────────────────────────────

export const MOVEMENT_LIMIT = 200;

/** The item's stock ledger, newest first. */
export const getItemMovements = async (
  id: string,
): Promise<{ rows: StockMovement[]; truncated: boolean }> => {
  try {
    const response = await api.get(`/inventory/items/${id}/movements`, {
      params: { page: 1, limit: MOVEMENT_LIMIT },
    });
    const rows = listRows(unwrapEnvelope(response.data)).map(mapStockMovement);
    return { rows, truncated: rows.length >= MOVEMENT_LIMIT };
  } catch (e) {
    throw toApiError(e);
  }
};
