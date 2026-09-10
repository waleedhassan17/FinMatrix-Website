import { describe, expect, it } from 'vitest';

import { isExpired } from '@/models/estimate';
import type { EstimateFormData } from '@/models/estimate';
import type { SalesOrderFormData } from '@/models/salesOrder';
import {
  estimateFormToPayload,
  estimateFormToUpdatePayload,
  estimateListSerializer,
} from '@/serializers/estimateSerializer';
import {
  salesOrderFormToPayload,
  salesOrderFormToUpdatePayload,
  salesOrderListSerializer,
} from '@/serializers/salesOrderSerializer';

const lines = [
  {
    id: 'line_1',
    itemId: 'item-1',
    description: ' Widget ',
    quantity: '2',
    unitPrice: '150.5',
    taxRate: '17',
  },
  {
    id: 'line_2',
    itemId: '',
    description: 'Delivery',
    quantity: '1',
    unitPrice: '500',
    taxRate: '0',
  },
];

const estimateForm: EstimateFormData = {
  customerId: 'cus-1',
  customerName: 'Acme',
  estimateDate: '2026-09-10',
  expiryDate: '2026-10-10',
  discountType: 'percent',
  discountValue: '10',
  notes: '  ',
  lines,
};

const salesOrderForm: SalesOrderFormData = {
  customerId: 'cus-1',
  customerName: 'Acme',
  orderDate: '2026-09-10',
  expectedDate: '2026-09-20',
  discountType: 'none',
  discountValue: '0',
  notes: 'Ship in two batches',
  lines,
};

describe('estimateFormToPayload', () => {
  it('never sends estimateNumber — the server assigns EST-<year>-NNNN', () => {
    expect(estimateFormToPayload(estimateForm)).not.toHaveProperty('estimateNumber');
  });

  it('sends money as strings and omits a blank itemId', () => {
    const p = estimateFormToPayload(estimateForm);
    expect(typeof p.discountValue).toBe('string');
    expect(p.lines[0].itemId).toBe('item-1');
    // '' is not a UUID and fails @IsUUID — the key must be absent.
    expect(p.lines[1]).not.toHaveProperty('itemId');
    for (const l of p.lines) {
      expect(typeof l.quantity).toBe('string');
      expect(typeof l.unitPrice).toBe('string');
      expect(typeof l.taxRate).toBe('string');
    }
  });

  it('omits expiryDate rather than sending an empty string', () => {
    expect(estimateFormToPayload(estimateForm).expiryDate).toBe('2026-10-10');
    expect(
      estimateFormToPayload({ ...estimateForm, expiryDate: '' }),
    ).not.toHaveProperty('expiryDate');
  });

  it('includes status only when given, and only draft or sent', () => {
    expect(estimateFormToPayload(estimateForm, 'sent').status).toBe('sent');
    expect(estimateFormToPayload(estimateForm, 'draft').status).toBe('draft');
    expect(estimateFormToPayload(estimateForm)).not.toHaveProperty('status');
  });

  it('drops a whitespace-only note', () => {
    expect(estimateFormToPayload(estimateForm).notes).toBeUndefined();
  });
});

describe('estimateFormToUpdatePayload', () => {
  it('omits customerId and status — UpdateEstimateDto has neither', () => {
    // Both would be silently stripped by whitelist:true, so sending them would
    // look like it worked while changing nothing.
    const p = estimateFormToUpdatePayload(estimateForm);
    expect(p).not.toHaveProperty('customerId');
    expect(p).not.toHaveProperty('status');
    expect(p.estimateDate).toBe('2026-09-10');
  });
});

describe('salesOrderFormToPayload', () => {
  it('never sends orderNumber or status', () => {
    const p = salesOrderFormToPayload(salesOrderForm);
    expect(p).not.toHaveProperty('orderNumber');
    // CreateSalesOrderDto has no status field — the server forces 'open'.
    expect(p).not.toHaveProperty('status');
  });

  it('uses orderDate and expectedDate, not the estimate field names', () => {
    const p = salesOrderFormToPayload(salesOrderForm);
    expect(p.orderDate).toBe('2026-09-10');
    expect(p.expectedDate).toBe('2026-09-20');
    expect(p).not.toHaveProperty('estimateDate');
  });
});

describe('salesOrderFormToUpdatePayload', () => {
  it('omits lines by default', () => {
    // Sending lines deletes and reinserts them, resetting every
    // quantityFulfilled to zero. The default has to be the safe one.
    const p = salesOrderFormToUpdatePayload(salesOrderForm);
    expect(p).not.toHaveProperty('lines');
    expect(p).not.toHaveProperty('customerId');
    expect(p.notes).toBe('Ship in two batches');
  });

  it('includes lines only when explicitly asked', () => {
    const p = salesOrderFormToUpdatePayload(salesOrderForm, true);
    expect(p.lines).toHaveLength(2);
  });
});

describe('list serializers', () => {
  it('read estimates from a bare array', () => {
    // GET /estimates loses its pagination and summary to the envelope.
    const rows = estimateListSerializer([
      {
        id: 'e1',
        estimateNumber: 'EST-2026-0001',
        total: '1170.0000',
        customer: { name: 'Acme' },
        invoiceDate: undefined,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(1170);
    expect(rows[0].customerName).toBe('Acme');
    // Absent expiry is null, not '' — the absence is meaningful.
    expect(rows[0].expiryDate).toBeNull();
  });

  it('read sales orders from a bare array, defaulting status to open', () => {
    const rows = salesOrderListSerializer([
      { id: 's1', orderNumber: 'SO-2026-0001', total: '500.0000' },
    ]);
    expect(rows[0].status).toBe('open');
    expect(rows[0].invoiceId).toBeNull();
  });

  it('map the fulfilled quantity on a sales order line', () => {
    const rows = salesOrderListSerializer([
      {
        id: 's1',
        lines: [{ id: 'l1', quantity: '10.0000', quantityFulfilled: '4.0000' }],
      },
    ]);
    expect(rows[0].lines[0].quantity).toBe(10);
    expect(rows[0].lines[0].quantityFulfilled).toBe(4);
  });
});

describe('isExpired', () => {
  // The server never sets the `expired` status — no cron, no sweep — so it is
  // derived here for display only.
  const past = '2020-01-01';
  const future = '2999-01-01';

  it('is true past the expiry date on a live quote', () => {
    expect(isExpired({ expiryDate: past, status: 'sent' })).toBe(true);
  });

  it('is false before it', () => {
    expect(isExpired({ expiryDate: future, status: 'sent' })).toBe(false);
  });

  it('is false when no expiry was set', () => {
    expect(isExpired({ expiryDate: null, status: 'sent' })).toBe(false);
  });

  it('is false for a settled quote — it already went somewhere', () => {
    expect(isExpired({ expiryDate: past, status: 'converted' })).toBe(false);
    expect(isExpired({ expiryDate: past, status: 'declined' })).toBe(false);
  });
});
