import { describe, expect, it } from 'vitest';

import type { ApprovalRequest } from '@/models/approval';
import {
  itemLineQuantities,
  onOrderForItem,
  pendingPORequestsForItem,
  poPrefillLine,
  purchaseOrdersForItem,
} from '@/models/itemPurchaseOrders';
import type { PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus } from '@/models/purchaseOrder';

const line = (itemId: string, quantity: number, receivedQuantity = 0): PurchaseOrderLine => ({
  id: `${itemId}-${quantity}-${receivedQuantity}`,
  itemId,
  itemName: '',
  description: '',
  quantity,
  unitPrice: 100,
  taxRate: 0,
  amount: quantity * 100,
  receivedQuantity,
  billedQuantity: 0,
  accountId: '',
});

const po = (id: string, status: PurchaseOrderStatus, lines: PurchaseOrderLine[]): PurchaseOrder => ({
  id,
  companyId: 'c1',
  poNumber: `PO-${id}`,
  vendorId: 'v1',
  vendorName: 'Habib Oil Mills',
  orderDate: '2026-09-01',
  expectedDate: '',
  status,
  lines,
  subtotal: 0,
  taxAmount: 0,
  total: 0,
  notes: '',
  billId: '',
  bills: [],
  receivedValueGross: 0,
  billedValueGross: 0,
  unbilledValueGross: 0,
  createdAt: '',
  updatedAt: '',
});

const request = (over: Partial<ApprovalRequest>): ApprovalRequest => ({
  id: 'r1',
  companyId: 'c1',
  type: 'po',
  status: 'pending',
  payload: { lines: [{ itemId: 'rice', orderedQty: '5' }] },
  summary: 'Purchase order · Rs 5,000',
  reason: null,
  requestedBy: 'u1',
  reviewedBy: null,
  reviewerRole: null,
  reviewedAt: null,
  reviewerComment: null,
  journalEntryId: null,
  resultId: null,
  lastError: null,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('purchaseOrdersForItem / itemLineQuantities', () => {
  const pos = [
    po('1', 'sent', [line('rice', 10), line('oil', 4), line('rice', 5, 2)]),
    po('2', 'sent', [line('oil', 8)]),
  ];

  it('keeps only orders with a line for the item', () => {
    expect(purchaseOrdersForItem(pos, 'rice').map((p) => p.id)).toEqual(['1']);
    expect(purchaseOrdersForItem(pos, '')).toEqual([]);
  });

  it("counts this item's lines, not the order's", () => {
    expect(itemLineQuantities(pos[0], 'rice')).toEqual({ ordered: 15, received: 2 });
    expect(itemLineQuantities(pos[1], 'rice')).toEqual({ ordered: 0, received: 0 });
  });
});

describe('onOrderForItem', () => {
  it('sums what is still to arrive on sent and partly received orders only', () => {
    const pos = [
      po('draft', 'draft', [line('rice', 50)]),
      po('sent', 'sent', [line('rice', 10)]),
      po('partial', 'partial', [line('rice', 20, 15)]),
      po('received', 'received', [line('rice', 7, 7)]),
      po('closed', 'closed', [line('rice', 30, 5)]),
    ];
    expect(onOrderForItem(pos, 'rice')).toEqual({ quantity: 15, orders: 2 });
  });

  it('never goes negative when more arrived than was ordered', () => {
    expect(onOrderForItem([po('over', 'partial', [line('rice', 5, 9)])], 'rice')).toEqual({ quantity: 0, orders: 0 });
  });
});

describe('pendingPORequestsForItem', () => {
  it('keeps pending PO requests that order the item', () => {
    const requests = [
      request({ id: 'mine' }),
      request({ id: 'approving', status: 'approving' }),
      request({ id: 'other-item', payload: { lines: [{ itemId: 'oil' }] } }),
      request({ id: 'no-lines', payload: {} }),
      request({ id: 'bad-lines', payload: { lines: 'rice' } }),
      request({ id: 'null-line', payload: { lines: [null] } }),
      request({ id: 'invoice', type: 'invoice' }),
    ];
    expect(pendingPORequestsForItem(requests, 'rice').map((r) => r.id)).toEqual(['mine']);
  });
});

describe('poPrefillLine', () => {
  const item = { id: 'rice', name: 'Basmati 5kg', description: '', unitCost: 260, reorderQuantity: 40 };

  it('seeds the item at cost and its reorder quantity', () => {
    expect(poPrefillLine(item)).toMatchObject({
      itemId: 'rice',
      description: 'Basmati 5kg',
      unitPrice: '260',
      quantity: '40',
      taxRate: '0',
    });
  });

  it('orders at least one, and prefers the description when there is one', () => {
    expect(poPrefillLine({ ...item, reorderQuantity: 0, description: 'Premium basmati, 5kg bag' })).toMatchObject({
      quantity: '1',
      description: 'Premium basmati, 5kg bag',
    });
  });
});
