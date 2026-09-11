import { describe, expect, it } from 'vitest';

import {
  DELIVERY_STATUSES,
  LEGAL_TRANSITIONS,
  completionActions,
  completionUnits,
  creditMemoReversalFields,
  deliveryPayload,
  deliveryValue,
  draftTotals,
  emptyDeliveryForm,
  generateRiderPassword,
  hasDeliveryErrors,
  isDispatched,
  isRiderOnline,
  mapsLink,
  operatorActions,
  parseZones,
  reviewerLabel,
  riderAvailability,
  riderPayload,
  validateDelivery,
  validateRider,
  type DeliveryForm,
  type RiderForm,
  type StockInfo,
} from '@/models/delivery';
import {
  mapCompletion,
  mapDelivery,
  mapMonitorData,
  mapRider,
} from '@/serializers/deliverySerializer';

const stock = new Map<string, StockInfo>([
  ['rice', { name: 'Basmati 5kg', quantityOnHand: 10 }],
  ['oil', { name: 'Cooking oil', quantityOnHand: 3 }],
]);

const form = (over: Partial<DeliveryForm> = {}): DeliveryForm => ({
  ...emptyDeliveryForm(),
  customerId: 'cust-1',
  lines: [{ key: 'a', itemId: 'rice', quantity: '4', unitPrice: '1000', taxRate: '17' }],
  ...over,
});

const rider = (over: Partial<RiderForm> = {}): RiderForm => ({
  name: 'Imran Khan',
  username: 'imran.khan',
  password: 'Rider1234',
  phone: '',
  email: '',
  vehicleType: '',
  vehicleNumber: '',
  zones: '',
  maxLoad: '',
  ...over,
});

describe('status machine', () => {
  it('never offers the office "delivered" — the sale goes through approval', () => {
    for (const s of DELIVERY_STATUSES) {
      expect(operatorActions(s)).not.toContain('delivered');
    }
  });

  it('offers only what the server allows from each state', () => {
    expect(operatorActions('unassigned')).toEqual(['cancelled']);
    expect(operatorActions('pending')).toEqual(['cancelled', 'failed']);
    expect(operatorActions('arrived')).toEqual(['cancelled', 'failed', 'returned']);
  });

  it('offers nothing once a delivery has ended', () => {
    for (const s of ['delivered', 'failed', 'returned', 'cancelled'] as const) {
      expect(LEGAL_TRANSITIONS[s]).toEqual([]);
      expect(operatorActions(s)).toEqual([]);
    }
  });

  it('reads dispatch from the ledger status', () => {
    expect(isDispatched({ ledgerStatus: 'in_transit' })).toBe(true);
    expect(isDispatched({ ledgerStatus: 'none' })).toBe(false);
  });
});

describe('create delivery', () => {
  it('is valid for a priced, in-stock line', () => {
    expect(hasDeliveryErrors(validateDelivery(form(), stock))).toBe(false);
  });

  it('needs a customer and at least one item', () => {
    const e = validateDelivery(form({ customerId: '', lines: [] }), stock);
    expect(e.customerId).toBeTruthy();
    expect(e.lines).toBeTruthy();
  });

  it('refuses fractional or zero quantities (whole units only)', () => {
    for (const quantity of ['1.5', '0', 'abc']) {
      const e = validateDelivery(
        form({ lines: [{ key: 'a', itemId: 'rice', quantity, unitPrice: '10', taxRate: '0' }] }),
        stock,
      );
      expect(e.line.a?.quantity).toBeTruthy();
    }
  });

  it('refuses more than is on hand, counting every line for the item', () => {
    const e = validateDelivery(
      form({ lines: [{ key: 'a', itemId: 'oil', quantity: '4', unitPrice: '10', taxRate: '0' }] }),
      stock,
    );
    expect(e.line.a?.quantity).toMatch(/Only 3 on hand/);
  });

  it('flags the same item twice', () => {
    const e = validateDelivery(
      form({
        lines: [
          { key: 'a', itemId: 'rice', quantity: '1', unitPrice: '10', taxRate: '0' },
          { key: 'b', itemId: 'rice', quantity: '1', unitPrice: '10', taxRate: '0' },
        ],
      }),
      stock,
    );
    expect(e.line.b?.itemId).toBeTruthy();
  });

  it('requires a price above zero — approval refuses a zero-value delivery later', () => {
    const e = validateDelivery(
      form({ lines: [{ key: 'a', itemId: 'rice', quantity: '1', unitPrice: '0', taxRate: '0' }] }),
      stock,
    );
    expect(e.line.a?.unitPrice).toBeTruthy();
  });

  it('builds the DTO with integer quantities, numeric prices and no prePaid', () => {
    const body = deliveryPayload(
      form({ personnelId: 'rider-1', notes: '  gate 2  ' }),
      'Madina Wholesale',
      stock,
    );
    expect(body).toEqual({
      customerId: 'cust-1',
      customerName: 'Madina Wholesale',
      priority: 'normal',
      notes: 'gate 2',
      personnelId: 'rider-1',
      items: [{ itemId: 'rice', itemName: 'Basmati 5kg', orderedQty: 4, unitPrice: 1000, taxRate: 17 }],
    });
    expect(body).not.toHaveProperty('prePaid');
  });

  it('omits the rider when creating unassigned', () => {
    expect(deliveryPayload(form(), 'X', stock)).not.toHaveProperty('personnelId');
  });

  it('totals the draft with tax', () => {
    expect(draftTotals(form().lines)).toEqual({ subtotal: 4000, tax: 680, total: 4680 });
  });

  it('values a saved delivery the same way', () => {
    expect(deliveryValue([{ orderedQty: 4, unitPrice: 1000, taxRate: 17 }]).toNumber()).toBe(4680);
  });
});

describe('completion capability split', () => {
  const c = (
    status: 'pending' | 'approved' | 'rejected',
    ledgerStatus = 'in_transit',
    reversalCreditMemoId: string | null = null,
  ) => ({ status, ledgerStatus, reversalCreditMemoId });
  const NONE = { approve: false, waiting: false, reject: false, undo: null, reverse: null };

  it('owner: Approve and Reject on a pending completion', () => {
    expect(completionActions('admin', c('pending'))).toEqual({ ...NONE, approve: true, reject: true });
  });

  it('staff: "Waiting for Admin Approval" instead of Approve, and may Reject', () => {
    expect(completionActions('staff', c('pending'))).toEqual({ ...NONE, waiting: true, reject: true });
  });

  it('a posted sale is reversed by credit memo — owner direct, staff by request', () => {
    expect(completionActions('admin', c('approved', 'committed'))).toEqual({ ...NONE, reverse: 'direct' });
    expect(completionActions('staff', c('approved', 'committed'))).toEqual({ ...NONE, reverse: 'request' });
  });

  it('never offers undo on a committed sale — the server refuses it (LEDGER_COMMITTED)', () => {
    expect(completionActions('admin', c('approved', 'committed')).undo).toBeNull();
  });

  it('undo only where no sale was committed: owner direct, staff by request', () => {
    expect(completionActions('admin', c('approved', 'none')).undo).toBe('direct');
    expect(completionActions('staff', c('approved', 'none')).undo).toBe('request');
    expect(completionActions('staff', c('approved', 'none')).reverse).toBeNull();
  });

  it('nothing further once a reversing credit memo exists', () => {
    expect(completionActions('admin', c('approved', 'committed', 'cm-1'))).toEqual(NONE);
  });

  it('a rejected completion has nothing left to do', () => {
    expect(completionActions('admin', c('rejected'))).toEqual(NONE);
  });

  it('riders and unknown roles get nothing here', () => {
    expect(completionActions('delivery', c('pending')).approve).toBe(false);
    expect(completionActions(null, c('pending')).reject).toBe(false);
  });

  it('builds the reversal fields: settle the invoice, or refund when prepaid', () => {
    const draft = {
      deliveryRequestId: 'r1',
      deliveryId: 'd1',
      deliveryReference: 'DEL-1',
      customerId: 'c1',
      customerName: 'X',
      originalInvoiceId: 'inv-1',
      invoiceNumber: 'INV-1',
      invoiceBalance: 1200,
      settlement: 'apply_to_invoice' as const,
      settlementAmount: 1200,
      date: '2026-09-11',
      reason: '',
      lines: [],
    };
    expect(creditMemoReversalFields(draft)).toEqual({
      originalInvoiceId: 'inv-1',
      applyToInvoiceId: 'inv-1',
      reversesDeliveryRequestId: 'r1',
    });
    expect(creditMemoReversalFields({ ...draft, settlement: 'refund_cash' })).toEqual({
      originalInvoiceId: 'inv-1',
      refundRemainderToCash: true,
      reversesDeliveryRequestId: 'r1',
    });
  });

  it('names the authority that signed it', () => {
    expect(reviewerLabel({ status: 'approved', reviewerRole: 'admin' })).toBe('Owner approved');
    expect(reviewerLabel({ status: 'rejected', reviewerRole: 'staff' })).toBe('Staff rejected');
  });

  it('counts delivered and returned units', () => {
    expect(
      completionUnits({
        changes: [
          { itemId: 'a', itemName: '', beforeQty: 0, deliveredQty: 3, returnedQty: 1 },
          { itemId: 'b', itemName: '', beforeQty: 0, deliveredQty: 2, returnedQty: 0 },
        ],
      }),
    ).toEqual({ delivered: 5, returned: 1 });
  });
});

describe('riders', () => {
  it('validates the sign-in the server will accept', () => {
    expect(validateRider(rider())).toEqual({});
    expect(validateRider(rider({ username: 'imran@x' })).username).toBeTruthy();
    expect(validateRider(rider({ username: 'ab' })).username).toBeTruthy();
    expect(validateRider(rider({ password: 'short' })).password).toBeTruthy();
    expect(validateRider(rider({ phone: '123' })).phone).toBeTruthy();
  });

  it('lowercases the username and splits zones', () => {
    const body = riderPayload(rider({ username: ' Imran.Khan ', zones: 'Gulberg, DHA , ', phone: '0312-4890176' }));
    expect(body.username).toBe('imran.khan');
    expect(body.zones).toEqual(['Gulberg', 'DHA']);
    expect(body.phone).toBe('03124890176');
    expect(body).not.toHaveProperty('email');
  });

  it('parses zones', () => {
    expect(parseZones(' a, ,b ')).toEqual(['a', 'b']);
  });

  it('generates a password with an upper, a lower and a digit, and no look-alikes', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateRiderPassword();
      expect(p).toHaveLength(10);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/\d/);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });

  it('reads availability and online state', () => {
    expect(riderAvailability({ status: 'active', isAvailable: true })).toBe('available');
    expect(riderAvailability({ status: 'active', isAvailable: false })).toBe('busy');
    expect(riderAvailability({ status: 'on_leave', isAvailable: true })).toBe('on_leave');
    const now = Date.parse('2026-09-11T10:00:00Z');
    expect(isRiderOnline({ locationUpdatedAt: '2026-09-11T09:59:00Z' }, now)).toBe(true);
    expect(isRiderOnline({ locationUpdatedAt: '2026-09-11T09:50:00Z' }, now)).toBe(false);
    expect(isRiderOnline({ locationUpdatedAt: null }, now)).toBe(false);
  });
});

describe('maps link', () => {
  it('prefers coordinates, falls back to the address', () => {
    expect(mapsLink({ lat: 31.5, lng: 74.3 })).toContain('query=31.5,74.3');
    expect(mapsLink({ lat: null, lng: null }, 'Main Blvd, Lahore')).toContain('Main%20Blvd');
    expect(mapsLink(null)).toBeNull();
  });
});

describe('delivery serializer', () => {
  it('reads a delivery, its lines and the list-only aliases', () => {
    const d = mapDelivery({
      id: 'd1',
      referenceNo: 'DEL-1',
      assignedTo: 'rider-1',
      scheduledDate: '2026-09-12',
      status: 'pending',
      ledgerStatus: 'in_transit',
      destLat: 31.5,
      destLng: '74.3',
      items: [{ id: 'l1', itemId: 'rice', orderedQty: '4.0000', unitPrice: '1000.00', taxRate: '17' }],
    });
    expect(d.personnelId).toBe('rider-1');
    expect(d.preferredDate).toBe('2026-09-12');
    expect(d.destLng).toBe(74.3);
    expect(d.lines[0]).toMatchObject({ orderedQty: 4, unitPrice: 1000, taxRate: 17 });
    expect(mapDelivery({}).personnelId).toBeNull();
  });

  it('reads a completion with its sale amount and proof', () => {
    const c = mapCompletion({
      id: 'r1',
      status: 'pending',
      saleAmount: '4680.00',
      paidStatus: 'paid',
      changes: [{ itemId: 'rice', itemName: 'Rice', beforeQty: 6, deliveredQty: 4, returnedQty: 0 }],
      proof: { signedBy: 'Ali', billPhotoUri: 'x' },
    });
    expect(c.saleAmount).toBe(4680);
    expect(c.paidStatus).toBe('paid');
    expect(c.proof.signedBy).toBe('Ali');
    expect(mapCompletion({ status: 'weird' }).status).toBe('pending');
  });

  it('reads a rider, defaulting an unknown status to active', () => {
    const r = mapRider({ userId: 'u', currentLoad: '2', maxLoad: '10', zones: ['A'], isAvailable: true });
    expect(r).toMatchObject({ currentLoad: 2, maxLoad: 10, zones: ['A'], status: 'active' });
  });

  it('reads the monitor summary and markers', () => {
    const m = mapMonitorData({
      summary: { total: 5, unassigned: 1, pending: 2, inTransit: 1, delivered: 1, failed: 0 },
      markers: [{ deliveryId: 'd1', status: 'in_transit', personnel: { isOnline: true, lat: 1, lng: 2 } }],
      locatedPersonnel: 1,
    });
    expect(m.summary.pending).toBe(2);
    expect(m.markers[0].rider?.isOnline).toBe(true);
    expect(m.markers[0].destination).toBeNull();
  });
});
