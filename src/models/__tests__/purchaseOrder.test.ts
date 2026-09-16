import { describe, expect, it } from 'vitest';

import {
  allowedTransitions,
  buildReceiptDrafts,
  hasAnyReceipt,
  isFullyReceived,
  isPOEditable,
  isReceivable,
  overReceivedDrafts,
  receiptDraftsToPayload,
  hasUnbilledReceipts,
  isRequisition,
  receivedPercent,
  remainingOf,
  unbilledValue,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type ReceiptDraft,
} from '@/models/purchaseOrder';

const line = (
  id: string,
  quantity: number,
  receivedQuantity: number,
  unitPrice = 100,
): PurchaseOrderLine => ({
  id,
  itemId: '',
  itemName: '',
  description: `Line ${id}`,
  quantity,
  unitPrice,
  taxRate: 0,
  amount: quantity * unitPrice,
  receivedQuantity,
  billedQuantity: 0,
  accountId: '',
});

const po = (lines: PurchaseOrderLine[]): PurchaseOrder => ({
  id: 'po1',
  companyId: 'c1',
  poNumber: 'PO-0001',
  vendorId: 'v1',
  vendorName: 'Acme Supplies',
  orderDate: '2026-09-01',
  expectedDate: '2026-09-15',
  status: 'sent',
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

const draft = (
  lineId: string,
  ordered: number,
  alreadyReceived: number,
  arriving: string,
): ReceiptDraft => ({
  lineId,
  description: `Line ${lineId}`,
  ordered,
  alreadyReceived,
  arriving,
  stock: true,
});

/**
 * The receiving arithmetic.
 *
 * `receivedQty` is CUMULATIVE on the wire — the server assigns the value, then
 * derives the stock movement from the difference against what was there. Send
 * today's delta instead and the *second* receipt computes a negative difference
 * and quietly claws stock back off the shelf, with nothing in the UI looking
 * wrong. These tests are the guard on that.
 */

describe('remainingOf', () => {
  it('is ordered minus received', () => {
    expect(remainingOf(line('a', 10, 4))).toBe(6);
  });

  it('never goes negative when over-received', () => {
    expect(remainingOf(line('a', 10, 12))).toBe(0);
  });
});

describe('buildReceiptDrafts', () => {
  it('defaults each line to receiving its remainder', () => {
    const drafts = buildReceiptDrafts([line('a', 10, 4), line('b', 5, 0)]);
    expect(drafts[0]).toMatchObject({
      lineId: 'a',
      ordered: 10,
      alreadyReceived: 4,
      arriving: '6',
    });
    expect(drafts[1]).toMatchObject({ lineId: 'b', arriving: '5' });
  });

  it('defaults a fully received line to nothing arriving', () => {
    expect(buildReceiptDrafts([line('a', 10, 10)])[0].arriving).toBe('0');
  });
});

describe('receiptDraftsToPayload', () => {
  it('sends the CUMULATIVE total, not the delta', () => {
    // The single most important assertion in this module: 3 already in,
    // 2 arriving today, so the wire carries 5.
    const payload = receiptDraftsToPayload([draft('a', 10, 3, '2')]);
    expect(payload).toEqual([{ lineId: 'a', receivedQty: '5' }]);
  });

  it('accumulates across a second receipt of the same line', () => {
    const first = receiptDraftsToPayload([draft('a', 10, 0, '3')]);
    expect(first[0].receivedQty).toBe('3');
    // The server has now assigned 3. A second delivery of 2 must send 5.
    const second = receiptDraftsToPayload([draft('a', 10, 3, '2')]);
    expect(second[0].receivedQty).toBe('5');
  });

  it('omits lines with nothing arriving rather than sending "0"', () => {
    // Sending "0" would RESET that line and reverse the stock already booked.
    const payload = receiptDraftsToPayload([
      draft('a', 10, 4, '0'),
      draft('b', 5, 0, '5'),
    ]);
    expect(payload).toEqual([{ lineId: 'b', receivedQty: '5' }]);
  });

  it('omits a line whose arriving field is blank', () => {
    expect(receiptDraftsToPayload([draft('a', 10, 4, '')])).toEqual([]);
  });

  it('keeps decimal quantities exact', () => {
    expect(receiptDraftsToPayload([draft('a', 10, 0.1, '0.2')])[0].receivedQty).toBe(
      '0.3',
    );
  });
});

describe('overReceivedDrafts', () => {
  it('flags a line whose cumulative total would exceed what was ordered', () => {
    // 8 already in plus 3 today is 11 against 10 ordered.
    const over = overReceivedDrafts([draft('a', 10, 8, '3')]);
    expect(over.map((d) => d.lineId)).toEqual(['a']);
  });

  it('allows receiving exactly the remainder', () => {
    expect(overReceivedDrafts([draft('a', 10, 8, '2')])).toEqual([]);
  });

  it('judges the cumulative figure, not today’s arrival alone', () => {
    // 2 arriving is well under 10 ordered — only the total gives it away.
    expect(overReceivedDrafts([draft('a', 10, 9, '2')])).toHaveLength(1);
  });
});

describe('isPOEditable', () => {
  it('allows a draft', () => {
    expect(isPOEditable('draft')).toBe(true);
  });

  // Stricter than the server, deliberately: PATCH deletes every line and
  // rebuilds it with receivedQty '0' while the stock and GRNI entry stay
  // posted, with no status guard of its own.
  it.each(['sent', 'partial', 'received', 'closed'] as const)(
    'refuses a %s order',
    (status) => {
      expect(isPOEditable(status)).toBe(false);
    },
  );
});

describe('isReceivable', () => {
  it.each(['sent', 'partial', 'received'] as const)('allows %s', (status) => {
    expect(isReceivable(status)).toBe(true);
  });

  it.each(['draft', 'closed'] as const)('refuses %s', (status) => {
    expect(isReceivable(status)).toBe(false);
  });
});

describe('allowedTransitions', () => {
  it('offers only sending from a draft', () => {
    expect(allowedTransitions('draft')).toEqual(['sent']);
  });

  it('offers back-to-requisition or closing once sent', () => {
    // The server allows sent → draft only while nothing is received; a sent
    // order has nothing received by definition.
    expect(allowedTransitions('sent')).toEqual(['draft', 'closed']);
  });

  // The server enforces NO transition rules — it assigns the column and
  // returns, `received → draft` included. Going backwards is excluded here
  // because stock and GRNI have already posted by then.
  it.each(['partial', 'received'] as const)(
    'never offers a way back from %s',
    (status) => {
      expect(allowedTransitions(status)).not.toContain('draft');
      expect(allowedTransitions(status)).not.toContain('sent');
    },
  );

  it('offers reopening from closed', () => {
    expect(allowedTransitions('closed')).toEqual(['sent']);
  });
});

describe('billing per receipt', () => {
  it('bills the server’s tax-inclusive unbilled value', () => {
    // 147 received of 150 at 1,245 with 17% tax: the bill carries the tax.
    const order = { ...po([line('a', 150, 147, 1245)]), unbilledValueGross: 214127.55 };
    expect(unbilledValue(order)).toBe(214127.55);
  });

  it('knows when received goods are still unbilled', () => {
    const partlyBilled = po([{ ...line('a', 150, 150), billedQuantity: 147 }]);
    expect(hasUnbilledReceipts(partlyBilled)).toBe(true);
    const allBilled = po([{ ...line('a', 150, 150), billedQuantity: 150 }]);
    expect(hasUnbilledReceipts(allBilled)).toBe(false);
  });

  it('treats a draft as a purchase requisition', () => {
    expect(isRequisition({ status: 'draft' })).toBe(true);
    expect(isRequisition({ status: 'sent' })).toBe(false);
  });
});

describe('receivedPercent', () => {
  it('reports partial progress', () => {
    expect(receivedPercent(line('a', 8, 2))).toBe(25);
  });

  it('clamps above 100 when over-received', () => {
    expect(receivedPercent(line('a', 10, 15))).toBe(100);
  });

  it('is zero for a zero-quantity line rather than NaN', () => {
    expect(receivedPercent(line('a', 0, 0))).toBe(0);
  });
});

describe('isFullyReceived / hasAnyReceipt', () => {
  it('is fully received only when every line is', () => {
    expect(isFullyReceived(po([line('a', 5, 5), line('b', 3, 3)]))).toBe(true);
    expect(isFullyReceived(po([line('a', 5, 5), line('b', 3, 1)]))).toBe(false);
  });

  it('is not fully received when there are no lines at all', () => {
    expect(isFullyReceived(po([]))).toBe(false);
  });

  it('detects a single part-received line', () => {
    expect(hasAnyReceipt(po([line('a', 5, 0), line('b', 3, 1)]))).toBe(true);
    expect(hasAnyReceipt(po([line('a', 5, 0)]))).toBe(false);
  });
});
