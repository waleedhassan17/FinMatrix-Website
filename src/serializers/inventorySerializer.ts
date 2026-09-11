// ═══════════════════════════════════════════════════════
// FinMatrix Web — Inventory serializer
// ═══════════════════════════════════════════════════════
// Every quantity and amount arrives as a decimal STRING ("12.0000") — Postgres
// numeric through TypeORM. Read them through toNumber, never Number(), so an
// absent field is 0 rather than NaN.

import type { InventoryItem, StockMovement } from '@/models/inventory';
import { toNumber } from '@/utils/money';

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown): number => toNumber(v as never);

export const mapInventoryItem = (raw: unknown): InventoryItem => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    sku: str(r.sku),
    name: str(r.name),
    description: str(r.description),
    category: str(r.category),
    unitOfMeasure: str(r.unitOfMeasure),
    unitCost: num(r.unitCost),
    sellingPrice: num(r.sellingPrice),
    quantityOnHand: num(r.quantityOnHand),
    quantityOnOrder: num(r.quantityOnOrder),
    quantityCommitted: num(r.quantityCommitted),
    reorderPoint: num(r.reorderPoint),
    reorderQuantity: num(r.reorderQuantity),
    minStock: num(r.minStock),
    maxStock: num(r.maxStock),
    barcodeData: str(r.barcodeData),
    // Default true: a missing flag must not hide an item from every list.
    isActive: r.isActive !== false,
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
};

export const mapStockMovement = (raw: unknown): StockMovement => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    itemId: str(r.itemId),
    date: str(r.date).slice(0, 10),
    type: str(r.type),
    reference: str(r.reference),
    description: str(r.description),
    quantityChange: num(r.quantityChange),
    balanceAfter: num(r.balanceAfter),
    sourceType: str(r.sourceType),
    sourceId: str(r.sourceId),
    createdAt: str(r.createdAt),
  };
};

/**
 * Rows out of a paged list response.
 *
 * The service returns `{data, total, page, limit}`, but the response envelope
 * keeps only `data` from any payload that has one — so after unwrapping, this
 * is usually the bare array. Both shapes are accepted.
 */
export const listRows = (body: unknown): unknown[] => {
  if (Array.isArray(body)) return body;
  const r = asRaw(body);
  if (Array.isArray(r.data)) return r.data;
  if (Array.isArray(r.items)) return r.items;
  return [];
};
