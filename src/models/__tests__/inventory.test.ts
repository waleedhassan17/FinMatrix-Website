import { describe, expect, it } from 'vitest';

import {
  adjustmentImpact,
  adjustmentPayload,
  canSetOpeningStock,
  emptyItemForm,
  formatQtyChange,
  inventoryTotals,
  isReversibleAdjustment,
  isUnitCostLocked,
  itemPayload,
  itemValue,
  movementLabel,
  movementLink,
  stockStatus,
  validateAdjustment,
  validateItemForm,
  validateOpeningStock,
  type AdjustmentForm,
  type InventoryItem,
  type ItemForm,
} from '@/models/inventory';
import {
  listRows,
  mapInventoryItem,
  mapStockMovement,
} from '@/serializers/inventorySerializer';

const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'item-1',
  sku: 'RICE-5KG',
  name: 'Basmati 5kg',
  description: '',
  category: 'Groceries',
  unitOfMeasure: 'bag',
  unitCost: 800,
  sellingPrice: 1000,
  quantityOnHand: 50,
  quantityOnOrder: 0,
  quantityCommitted: 0,
  reorderPoint: 10,
  reorderQuantity: 40,
  minStock: 0,
  maxStock: 0,
  barcodeData: '',
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

const form = (over: Partial<ItemForm> = {}): ItemForm => ({
  ...emptyItemForm(),
  sku: 'RICE-5KG',
  name: 'Basmati 5kg',
  unitCost: '800',
  sellingPrice: '1000',
  ...over,
});

const adj = (over: Partial<AdjustmentForm> = {}): AdjustmentForm => ({
  newQty: '45',
  reason: 'damage',
  date: '2026-09-10',
  notes: '',
  ...over,
});

describe('stockStatus', () => {
  it('is out at zero or below', () => {
    expect(stockStatus(item({ quantityOnHand: 0 }))).toBe('out');
  });

  it('is low AT the reorder point, matching the server’s lowStock filter', () => {
    expect(stockStatus(item({ quantityOnHand: 10, reorderPoint: 10 }))).toBe('low');
    expect(stockStatus(item({ quantityOnHand: 11, reorderPoint: 10 }))).toBe('ok');
  });

  it('is never low without a reorder point', () => {
    expect(stockStatus(item({ quantityOnHand: 1, reorderPoint: 0 }))).toBe('ok');
  });
});

describe('valuation', () => {
  it('is on hand × weighted-average cost, exactly', () => {
    expect(itemValue(item({ quantityOnHand: 3, unitCost: 0.1 })).toString()).toBe('0.3');
  });

  it('totals value across inactive items but counts low/out among active only', () => {
    const t = inventoryTotals([
      item({ id: 'a', quantityOnHand: 5, unitCost: 100, reorderPoint: 10 }),
      item({ id: 'b', quantityOnHand: 0 }),
      item({ id: 'c', quantityOnHand: 2, unitCost: 50, isActive: false }),
    ]);
    expect(t).toEqual({ count: 2, value: 600, low: 1, out: 1 });
  });
});

describe('item form', () => {
  it('requires SKU and name', () => {
    const e = validateItemForm(form({ sku: ' ', name: '' }));
    expect(e.sku).toBeTruthy();
    expect(e.name).toBeTruthy();
  });

  it('rejects malformed numbers and max below min', () => {
    const e = validateItemForm(form({ sellingPrice: '12.345', minStock: '10', maxStock: '5' }));
    expect(e.sellingPrice).toBeTruthy();
    expect(e.maxStock).toBeTruthy();
  });

  it('accepts pasted thousands separators', () => {
    expect(validateItemForm(form({ unitCost: '1,250.50' }))).toEqual({});
    expect(itemPayload(form({ unitCost: '1,250.50' })).unitCost).toBe('1250.5');
  });

  it('omits unitCost while it is locked, so an edit cannot trip UNIT_COST_LOCKED', () => {
    expect(itemPayload(form(), { costLocked: true })).not.toHaveProperty('unitCost');
    expect(itemPayload(form())).toHaveProperty('unitCost', '800');
  });

  it('omits a blank category on create (the DTO’s @Length(1,100)) but sends it on edit', () => {
    expect(itemPayload(form())).not.toHaveProperty('category');
    expect(itemPayload(form(), { editing: true })).toHaveProperty('category', '');
  });

  it('sends blank numbers as 0 and never a quantity', () => {
    const body = itemPayload(form());
    expect(body.reorderPoint).toBe('0');
    expect(body).not.toHaveProperty('quantityOnHand');
  });

  it('locks the cost only while stock is on hand', () => {
    expect(isUnitCostLocked(item({ quantityOnHand: 1 }))).toBe(true);
    expect(isUnitCostLocked(item({ quantityOnHand: 0 }))).toBe(false);
    expect(isUnitCostLocked(undefined)).toBe(false);
  });
});

describe('adjustment', () => {
  it('needs a target that differs from what is on hand', () => {
    expect(validateAdjustment(adj({ newQty: '50' }), 50, '2026-09-11').newQty).toMatch(/already/);
    expect(validateAdjustment(adj({ newQty: '-1' }), 50, '2026-09-11').newQty).toBeTruthy();
  });

  it('requires a reason and refuses a future date', () => {
    const e = validateAdjustment(adj({ reason: '', date: '2026-09-12' }), 50, '2026-09-11');
    expect(e.reason).toBeTruthy();
    expect(e.date).toMatch(/future/);
  });

  it('is valid for a write-down dated today', () => {
    expect(validateAdjustment(adj(), 50, '2026-09-11')).toEqual({});
  });

  it('sends exactly the DTO fields — absolute newQty, no referenceNum', () => {
    expect(adjustmentPayload('item-1', adj({ notes: '  two bags split  ' }))).toEqual({
      itemId: 'item-1',
      newQty: '45',
      reason: 'damage',
      date: '2026-09-10',
      notes: 'two bags split',
    });
    expect(adjustmentPayload('item-1', adj())).not.toHaveProperty('notes');
  });

  it('values the variance at the average cost', () => {
    const impact = adjustmentImpact(item({ quantityOnHand: 50, unitCost: 800 }), '45');
    expect(impact?.variance.toNumber()).toBe(-5);
    expect(impact?.value.toNumber()).toBe(-4000);
    expect(adjustmentImpact(item(), 'abc')).toBeNull();
  });

  it('formats signed changes', () => {
    expect(formatQtyChange(12)).toBe('+12');
    expect(formatQtyChange(-3.5)).toBe('−3.5');
    expect(formatQtyChange(0)).toBe('0');
  });
});

describe('opening stock', () => {
  it('is available only with no stock and no history', () => {
    expect(canSetOpeningStock(item({ quantityOnHand: 0 }), 0)).toBe(true);
    expect(canSetOpeningStock(item({ quantityOnHand: 0 }), 1)).toBe(false);
    expect(canSetOpeningStock(item({ quantityOnHand: 5 }), 0)).toBe(false);
  });

  it('needs a positive quantity and a unit cost (UNIT_COST_REQUIRED)', () => {
    expect(validateOpeningStock({ quantity: '0', asOfDate: '2026-09-01' }, 800).quantity).toBeTruthy();
    expect(validateOpeningStock({ quantity: '10', asOfDate: '2026-09-01' }, 0).unitCost).toBeTruthy();
    expect(validateOpeningStock({ quantity: '10', asOfDate: '2026-09-01' }, 800)).toEqual({});
  });
});

describe('movements', () => {
  it('labels by what wrote the row, not just its type', () => {
    expect(movementLabel({ type: 'receipt', sourceType: 'purchase_order' })).toBe(
      'Purchase order receipt',
    );
    expect(movementLabel({ type: 'adjustment', sourceType: 'opening_stock' })).toBe('Opening stock');
    expect(movementLabel({ type: 'sale', sourceType: '' })).toBe('Sale');
  });

  it('drills through to the source document', () => {
    expect(movementLink({ sourceType: 'purchase_order', sourceId: 'po-1' })).toBe(
      '/purchase-orders/po-1',
    );
    expect(movementLink({ sourceType: 'invoice_void', sourceId: 'inv-1' })).toBe('/invoices/inv-1');
    expect(movementLink({ sourceType: 'delivery_dispatch', sourceId: 'd-1' })).toBe('/deliveries/d-1');
    expect(movementLink({ sourceType: 'inventory_adjustment', sourceId: 'a-1' })).toBeNull();
    expect(movementLink({ sourceType: 'purchase_order', sourceId: '' })).toBeNull();
  });

  it('offers reversal on a posted adjustment only — never on a reversal', () => {
    expect(isReversibleAdjustment({ sourceType: 'inventory_adjustment' })).toBe(true);
    expect(isReversibleAdjustment({ sourceType: 'inventory_adjustment_void' })).toBe(false);
    expect(isReversibleAdjustment({ sourceType: 'opening_stock' })).toBe(false);
  });
});

describe('inventory serializer', () => {
  it('reads decimal strings and defaults a missing active flag to true', () => {
    const i = mapInventoryItem({
      id: 'x',
      sku: 'S',
      name: 'N',
      unitCost: '812.5000',
      quantityOnHand: '12.0000',
      reorderPoint: null,
    });
    expect(i.unitCost).toBe(812.5);
    expect(i.quantityOnHand).toBe(12);
    expect(i.reorderPoint).toBe(0);
    expect(i.isActive).toBe(true);
    expect(mapInventoryItem({ isActive: false }).isActive).toBe(false);
  });

  it('reads a movement and trims its date', () => {
    const m = mapStockMovement({
      id: 'm',
      date: '2026-09-10T00:00:00.000Z',
      type: 'receipt',
      quantityChange: '-3.0000',
      balanceAfter: '47.0000',
      sourceType: 'purchase_order',
      sourceId: 'po-1',
    });
    expect(m.date).toBe('2026-09-10');
    expect(m.quantityChange).toBe(-3);
    expect(m.balanceAfter).toBe(47);
  });

  it('accepts both the stripped envelope (bare array) and the paged object', () => {
    expect(listRows([{ id: 1 }])).toHaveLength(1);
    expect(listRows({ data: [{ id: 1 }, { id: 2 }], total: 2 })).toHaveLength(2);
    expect(listRows(null)).toEqual([]);
  });
});
