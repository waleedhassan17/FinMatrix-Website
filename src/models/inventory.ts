// ═══════════════════════════════════════════════════════
// FinMatrix Web — Inventory model
// ═══════════════════════════════════════════════════════
// Pure: types, validation and the arithmetic the inventory screens show.
//
// Two server rules shape everything here, and both are easy to get wrong from
// the outside:
//
//   1. Unit cost is an OUTPUT. The only costing method is weighted average, and
//      every receipt recomputes it. While stock is on hand the server refuses
//      an edit (UNIT_COST_LOCKED) — typing a new cost would move the valuation
//      report without moving GL 1200.
//   2. An item is created with NO quantity. Stock arrives through opening stock
//      (Dr 1200 / Cr 3900, once), a purchase-order receipt, or an adjustment —
//      each of which posts. A quantity field on the form would mint an asset
//      with no journal entry.

import { isoToday } from '@/models/document';
import { Decimal, toDecimal, type MoneyInput } from '@/utils/money';

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  unitOfMeasure: string;
  unitCost: number;
  sellingPrice: number;
  quantityOnHand: number;
  quantityOnOrder: number;
  quantityCommitted: number;
  reorderPoint: number;
  reorderQuantity: number;
  minStock: number;
  maxStock: number;
  barcodeData: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  itemId: string;
  date: string;
  /** adjustment | delivery | receipt | transfer | sale | return */
  type: string;
  reference: string;
  description: string;
  quantityChange: number;
  balanceAfter: number;
  /** What wrote the row — `purchase_order`, `inventory_adjustment`, … */
  sourceType: string;
  sourceId: string;
  createdAt: string;
}

// ─── Stock status and value ─────────────────────────────

export type StockStatus = 'ok' | 'low' | 'out';

export const STOCK_STATUS_DISPLAY: Record<StockStatus, { label: string; badge: string }> = {
  ok: { label: 'In stock', badge: 'active' },
  low: { label: 'Low stock', badge: 'pending' },
  out: { label: 'Out of stock', badge: 'failed' },
};

/**
 * Low means AT or below the reorder point — the server's own `lowStock` filter
 * is `quantityOnHand <= reorderPoint`. An item with no reorder point set is
 * never "low", only in or out of stock.
 */
export const stockStatus = (
  item: Pick<InventoryItem, 'quantityOnHand' | 'reorderPoint'>,
): StockStatus => {
  const qty = toDecimal(item.quantityOnHand);
  if (qty.lessThanOrEqualTo(0)) return 'out';
  const point = toDecimal(item.reorderPoint);
  if (point.greaterThan(0) && qty.lessThanOrEqualTo(point)) return 'low';
  return 'ok';
};

/** On hand × weighted-average cost — the figure the Inventory Valuation report uses. */
export const itemValue = (item: Pick<InventoryItem, 'quantityOnHand' | 'unitCost'>): Decimal =>
  toDecimal(item.quantityOnHand).times(toDecimal(item.unitCost));

export interface InventoryTotals {
  count: number;
  value: number;
  low: number;
  out: number;
}

/**
 * Headline figures for the list.
 *
 * Value covers EVERY item, inactive ones included: deactivating an item hides
 * it from pickers but its stock is still on the balance sheet. The low and out
 * counts cover active items only — nobody reorders something they retired.
 */
export const inventoryTotals = (items: InventoryItem[]): InventoryTotals => {
  let value = new Decimal(0);
  let low = 0;
  let out = 0;
  for (const item of items) {
    value = value.plus(itemValue(item));
    if (!item.isActive) continue;
    const status = stockStatus(item);
    if (status === 'low') low += 1;
    if (status === 'out') out += 1;
  }
  return {
    count: items.filter((i) => i.isActive).length,
    value: value.toDecimalPlaces(2).toNumber(),
    low,
    out,
  };
};

const qtyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

/** Quantities are decimal(18,4) on the server; show what is there, no more. */
export const formatQty = (value: MoneyInput): string =>
  qtyFormat.format(toDecimal(value).toNumber());

/** Signed, for a movement: `+12`, `−3`. */
export const formatQtyChange = (value: MoneyInput): string => {
  const d = toDecimal(value);
  if (d.isZero()) return '0';
  return `${d.isNegative() ? '−' : '+'}${formatQty(d.abs())}`;
};

// ─── Adjustment reasons ─────────────────────────────────

export type AdjustmentReason =
  | 'physical_count'
  | 'damage'
  | 'theft'
  | 'correction'
  | 'obsolescence'
  | 'other';

/**
 * The reason is not a label: the server picks the offsetting account from it
 * (ADJUSTMENT_REASON_ACCOUNTS), so damage, theft and obsolescence land on
 * separate P&L lines. The form says which, before anyone submits.
 */
export const ADJUSTMENT_REASONS: ReadonlyArray<{
  value: AdjustmentReason;
  label: string;
  account: string;
}> = [
  { value: 'physical_count', label: 'Physical count', account: '5430 · Inventory Count Variance' },
  { value: 'damage', label: 'Damaged', account: '5400 · Inventory Shrinkage – Damage' },
  { value: 'theft', label: 'Theft or loss', account: '5410 · Inventory Shrinkage – Theft' },
  {
    value: 'obsolescence',
    label: 'Obsolete or expired',
    account: '5420 · Inventory Shrinkage – Obsolescence',
  },
  { value: 'correction', label: 'Data-entry correction', account: '5430 · Inventory Count Variance' },
  { value: 'other', label: 'Other', account: '5430 · Inventory Count Variance' },
];

export const adjustmentReasonLabel = (reason: string): string =>
  ADJUSTMENT_REASONS.find((r) => r.value === reason)?.label ?? reason;

// ─── Validation helpers ─────────────────────────────────

const QTY = /^\d+(\.\d{1,4})?$/;
const COST = /^\d+(\.\d{1,4})?$/;
const PRICE = /^\d+(\.\d{1,2})?$/;

/** Strip thousands separators and spaces — people paste `1,250.00`. */
const clean = (v: string): string => v.replace(/[,\s]/g, '');

/** Canonical numeric string for the API's @IsNumberString, or null if not a number. */
const normalize = (v: string, pattern: RegExp): string | null => {
  const c = clean(v);
  return pattern.test(c) ? toDecimal(c).toString() : null;
};

// ─── Item form ──────────────────────────────────────────

export interface ItemForm {
  sku: string;
  name: string;
  description: string;
  category: string;
  unitOfMeasure: string;
  unitCost: string;
  sellingPrice: string;
  reorderPoint: string;
  reorderQuantity: string;
  minStock: string;
  maxStock: string;
}

export const emptyItemForm = (): ItemForm => ({
  sku: '',
  name: '',
  description: '',
  category: '',
  unitOfMeasure: '',
  unitCost: '',
  sellingPrice: '',
  reorderPoint: '',
  reorderQuantity: '',
  minStock: '',
  maxStock: '',
});

const numText = (n: number): string => (n ? String(n) : '');

export const itemToForm = (item: InventoryItem): ItemForm => ({
  sku: item.sku,
  name: item.name,
  description: item.description,
  category: item.category,
  unitOfMeasure: item.unitOfMeasure,
  unitCost: numText(item.unitCost),
  sellingPrice: numText(item.sellingPrice),
  reorderPoint: numText(item.reorderPoint),
  reorderQuantity: numText(item.reorderQuantity),
  minStock: numText(item.minStock),
  maxStock: numText(item.maxStock),
});

/** True when the server will refuse a unit-cost change (UNIT_COST_LOCKED). */
export const isUnitCostLocked = (item: Pick<InventoryItem, 'quantityOnHand'> | null | undefined) =>
  !!item && toDecimal(item.quantityOnHand).greaterThan(0);

type ItemErrors = Partial<Record<keyof ItemForm, string>>;

/** Lengths are the DTO's @Length bounds; formats are its @IsNumberString. */
export const validateItemForm = (form: ItemForm): ItemErrors => {
  const e: ItemErrors = {};
  const sku = form.sku.trim();
  if (!sku) e.sku = 'SKU is required.';
  else if (sku.length > 64) e.sku = 'SKU must be 64 characters or fewer.';

  const name = form.name.trim();
  if (!name) e.name = 'Name is required.';
  else if (name.length > 200) e.name = 'Name must be 200 characters or fewer.';

  if (form.category.trim().length > 100) e.category = 'Category must be 100 characters or fewer.';
  if (form.unitOfMeasure.trim().length > 32) e.unitOfMeasure = 'Unit must be 32 characters or fewer.';

  const checks: Array<[keyof ItemForm, RegExp, string]> = [
    ['unitCost', COST, 'Enter a cost like 250 or 250.5 (up to 4 decimals).'],
    ['sellingPrice', PRICE, 'Enter a price like 400 or 399.99.'],
    ['reorderPoint', QTY, 'Enter a quantity (0 or more).'],
    ['reorderQuantity', QTY, 'Enter a quantity (0 or more).'],
    ['minStock', QTY, 'Enter a quantity (0 or more).'],
    ['maxStock', QTY, 'Enter a quantity (0 or more).'],
  ];
  for (const [field, pattern, message] of checks) {
    const v = form[field].trim();
    if (v && normalize(v, pattern) === null) e[field] = message;
  }

  const min = normalize(form.minStock, QTY);
  const max = normalize(form.maxStock, QTY);
  if (!e.minStock && !e.maxStock && min && max && toDecimal(max).greaterThan(0)) {
    if (toDecimal(max).lessThan(toDecimal(min))) {
      e.maxStock = 'Maximum stock cannot be below the minimum.';
    }
  }
  return e;
};

/**
 * The create/update body.
 *
 * Blank numbers go as '0' so an edit can clear a reorder point. `unitCost` is
 * left out entirely when the item holds stock — sending the unchanged value is
 * harmless, but sending an edited one is a guaranteed UNIT_COST_LOCKED, and
 * the form shows it read-only anyway.
 *
 * Category is omitted when blank on create because the DTO's @Length(1, 100)
 * rejects an empty string there.
 */
export const itemPayload = (
  form: ItemForm,
  opts: { costLocked?: boolean; editing?: boolean } = {},
): Record<string, string> => {
  const num = (v: string, pattern: RegExp) => normalize(v, pattern) ?? '0';
  const body: Record<string, string> = {
    sku: form.sku.trim(),
    name: form.name.trim(),
    sellingPrice: num(form.sellingPrice, PRICE),
    reorderPoint: num(form.reorderPoint, QTY),
    reorderQuantity: num(form.reorderQuantity, QTY),
    minStock: num(form.minStock, QTY),
    maxStock: num(form.maxStock, QTY),
  };
  if (!opts.costLocked) body.unitCost = num(form.unitCost, COST);

  const description = form.description.trim();
  const category = form.category.trim();
  const unit = form.unitOfMeasure.trim();
  if (description || opts.editing) body.description = description;
  if (category || opts.editing) body.category = category;
  if (unit) body.unitOfMeasure = unit;
  return body;
};

// ─── Adjustment ─────────────────────────────────────────

export interface AdjustmentForm {
  /** The ABSOLUTE quantity the item should read afterwards — not a delta. */
  newQty: string;
  reason: AdjustmentReason | '';
  date: string;
  notes: string;
}

export const emptyAdjustmentForm = (): AdjustmentForm => ({
  newQty: '',
  reason: '',
  date: isoToday(),
  notes: '',
});

type AdjustmentErrors = Partial<Record<keyof AdjustmentForm, string>>;

export const validateAdjustment = (
  form: AdjustmentForm,
  current: number,
  today: string = isoToday(),
): AdjustmentErrors => {
  const e: AdjustmentErrors = {};
  const target = normalize(form.newQty, QTY);
  if (!form.newQty.trim()) e.newQty = 'Enter the quantity the item should have.';
  else if (target === null) e.newQty = 'Enter a quantity of 0 or more (up to 4 decimals).';
  else if (toDecimal(target).equals(toDecimal(current))) {
    e.newQty = 'That is already the quantity on hand — nothing to adjust.';
  }
  if (!form.reason) e.reason = 'Choose a reason — it decides which account the difference posts to.';
  if (!form.date) e.date = 'Choose the date to record it on.';
  // The server refuses a future-dated adjustment (assertNotFutureDate).
  else if (form.date > today) e.date = 'An adjustment cannot be dated in the future.';
  return e;
};

/**
 * Exactly the DTO's fields. `referenceNum` is deliberately absent: the DTO
 * validates it as a UUID and the service never stores it.
 */
export const adjustmentPayload = (itemId: string, form: AdjustmentForm) => {
  const body: {
    itemId: string;
    newQty: string;
    reason: AdjustmentReason;
    date?: string;
    notes?: string;
  } = {
    itemId,
    newQty: normalize(form.newQty, QTY) ?? '0',
    reason: form.reason as AdjustmentReason,
  };
  if (form.date) body.date = form.date;
  const notes = form.notes.trim();
  if (notes) body.notes = notes;
  return body;
};

/**
 * What the adjustment will do, for the live panel: the unit change and its
 * value at the current average cost. Null while the target is not a number.
 */
export const adjustmentImpact = (
  item: Pick<InventoryItem, 'quantityOnHand' | 'unitCost'>,
  newQty: string,
): { variance: Decimal; value: Decimal } | null => {
  const target = normalize(newQty, QTY);
  if (target === null) return null;
  const variance = toDecimal(target).minus(toDecimal(item.quantityOnHand));
  return { variance, value: variance.times(toDecimal(item.unitCost)).toDecimalPlaces(2) };
};

// ─── Opening stock ──────────────────────────────────────

export interface OpeningStockForm {
  quantity: string;
  asOfDate: string;
}

/**
 * The server posts opening stock at the item's unit cost, and refuses when
 * there is none (UNIT_COST_REQUIRED) — stock with no cost has no value.
 */
export const validateOpeningStock = (
  form: OpeningStockForm,
  unitCost: number,
): Partial<Record<keyof OpeningStockForm | 'unitCost', string>> => {
  const e: Partial<Record<keyof OpeningStockForm | 'unitCost', string>> = {};
  const qty = normalize(form.quantity, QTY);
  if (qty === null || !toDecimal(qty).greaterThan(0)) e.quantity = 'Enter a quantity above 0.';
  if (!form.asOfDate) e.asOfDate = 'Choose the date the stock was held on.';
  if (!(unitCost > 0)) e.unitCost = 'Set a unit cost on the item first.';
  return e;
};

export const openingStockPayload = (form: OpeningStockForm) => ({
  quantity: normalize(form.quantity, QTY) ?? '0',
  asOfDate: form.asOfDate,
});

/**
 * Opening stock is a one-time balance-sheet event: the server refuses once the
 * item has any stock or movement history (OPENING_STOCK_ALREADY_SET).
 */
export const canSetOpeningStock = (
  item: Pick<InventoryItem, 'quantityOnHand'>,
  movementCount: number,
): boolean => toDecimal(item.quantityOnHand).isZero() && movementCount === 0;

// ─── Movements ──────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  opening_stock: 'Opening stock',
  inventory_adjustment: 'Adjustment',
  inventory_adjustment_void: 'Adjustment reversed',
  physical_count: 'Physical count',
  purchase_order: 'Purchase order receipt',
  invoice: 'Invoice',
  invoice_void: 'Invoice voided',
  credit_memo: 'Credit memo',
  credit_memo_void: 'Credit memo voided',
  vendor_credit: 'Vendor credit',
  vendor_credit_void: 'Vendor credit voided',
  delivery_dispatch: 'Dispatched on a delivery',
  delivery_return: 'Returned from a delivery',
  inventory_approval: 'Delivery completion',
  stock_transfer: 'Stock transfer',
};

const TYPE_LABELS: Record<string, string> = {
  adjustment: 'Adjustment',
  delivery: 'Delivery',
  receipt: 'Receipt',
  transfer: 'Transfer',
  sale: 'Sale',
  return: 'Return',
};

export const movementLabel = (m: Pick<StockMovement, 'type' | 'sourceType'>): string =>
  SOURCE_LABELS[m.sourceType] ?? TYPE_LABELS[m.type] ?? m.type;

/**
 * Where a movement's source document lives, so the ledger can be drilled
 * through. Null when the source has no page of its own here.
 */
export const movementLink = (m: Pick<StockMovement, 'sourceType' | 'sourceId'>): string | null => {
  if (!m.sourceId) return null;
  switch (m.sourceType) {
    case 'purchase_order':
      return `/purchase-orders/${m.sourceId}`;
    case 'invoice':
    case 'invoice_void':
      return `/invoices/${m.sourceId}`;
    case 'credit_memo':
    case 'credit_memo_void':
      return `/credit-memos/${m.sourceId}`;
    case 'vendor_credit':
    case 'vendor_credit_void':
      return `/vendor-credits/${m.sourceId}`;
    case 'delivery_dispatch':
    case 'delivery_return':
      return `/deliveries/${m.sourceId}`;
    default:
      return null;
  }
};

/**
 * Only a posted adjustment can be reversed, and never a reversal — the server
 * refuses a second reversal of the same adjustment and says so.
 */
export const isReversibleAdjustment = (m: Pick<StockMovement, 'sourceType'>): boolean =>
  m.sourceType === 'inventory_adjustment';
