import { describe, expect, it } from 'vitest';

import type { BillFormData } from '@/models/bill';
import type { PurchaseOrderFormData } from '@/models/purchaseOrder';
import type { VendorFormData } from '@/models/vendor';
import {
  billFormToPayload,
  billListSerializer,
  billPaymentsSerializer,
  mapBill,
} from '@/serializers/billSerializer';
import {
  mapPurchaseOrder,
  purchaseOrderFormToPayload,
  purchaseOrderListSerializer,
} from '@/serializers/purchaseOrderSerializer';
import {
  vendorBillsSerializer,
  vendorFormToPayload,
  vendorListSerializer,
  vendorPaymentsSerializer,
} from '@/serializers/vendorSerializer';

// ═══════════════════════════════════════════════════════
// Vendors
// ═══════════════════════════════════════════════════════

const vendorForm = (over: Partial<VendorFormData> = {}): VendorFormData => ({
  name: 'Acme Supplies',
  contactPerson: 'A. Khan',
  email: 'ap@acme.example',
  phone: '0300 1234567',
  street: '12 Mall Road',
  city: 'Lahore',
  state: 'Punjab',
  zipCode: '54000',
  country: 'Pakistan',
  paymentTerms: 'net_30',
  taxId: 'NTN-1234567-8',
  defaultExpenseAccountId: '',
  notes: '',
  ...over,
});

describe('vendorFormToPayload', () => {
  it('sends companyName, never name', () => {
    // CreateVendorDto has one name field and it IS the company. Sending `name`
    // would be silently stripped and the vendor saved blank.
    const payload = vendorFormToPayload(vendorForm());
    expect(payload.companyName).toBe('Acme Supplies');
    expect(payload).not.toHaveProperty('name');
  });

  it('sends ONE flat address, with zipCode as postalCode', () => {
    const payload = vendorFormToPayload(vendorForm());
    expect(payload.address).toEqual({
      street: '12 Mall Road',
      city: 'Lahore',
      state: 'Punjab',
      postalCode: '54000',
      country: 'Pakistan',
    });
    expect(payload).not.toHaveProperty('billingAddress');
    expect(payload).not.toHaveProperty('shippingAddress');
  });

  it('translates payment terms into the API dialect', () => {
    expect(vendorFormToPayload(vendorForm()).paymentTerms).toBe('net30');
  });

  it('OMITS a blank default expense account rather than sending ""', () => {
    // The field is @IsUUID(); @IsOptional() skips only null and undefined, so
    // an empty string would reach the validator and 400 the whole request.
    //
    // Asserted through a JSON round-trip rather than with `in`, because that
    // is what actually goes on the wire: the serializer sets the key to
    // `undefined`, and JSON.stringify drops it. An `in` check would fail while
    // the request was perfectly correct.
    const wire = JSON.parse(JSON.stringify(vendorFormToPayload(vendorForm())));
    expect('defaultExpenseAccountId' in wire).toBe(false);
    expect(wire.defaultExpenseAccountId).toBeUndefined();
  });

  it('sends the default expense account when one is chosen', () => {
    const payload = vendorFormToPayload(
      vendorForm({ defaultExpenseAccountId: 'acct-uuid' }),
    );
    expect(payload.defaultExpenseAccountId).toBe('acct-uuid');
  });

  it('omits every blank optional string from the wire', () => {
    const wire = JSON.parse(
      JSON.stringify(
        vendorFormToPayload(
          vendorForm({ contactPerson: '', phone: '', taxId: '', notes: '' }),
        ),
      ),
    );
    for (const key of ['contactPerson', 'phone', 'taxId', 'notes']) {
      expect(key in wire).toBe(false);
    }
  });

  it('has no credit limit — a vendor has no such field', () => {
    expect(vendorFormToPayload(vendorForm())).not.toHaveProperty('creditLimit');
  });

  it('defaults the country rather than sending it blank', () => {
    expect(vendorFormToPayload(vendorForm({ country: '' })).address.country).toBe(
      'Pakistan',
    );
  });
});

describe('vendorListSerializer', () => {
  it('KEEPS its pagination — the response nests one level deeper', () => {
    // VendorsService.list returns { data: { data, pagination } }, so the
    // envelope lifts the outer `data` and the metadata survives. The opposite
    // of GET /bills below.
    const result = vendorListSerializer({
      data: [{ id: 'v1', companyName: 'Acme' }],
      pagination: { page: 2, limit: 25, total: 40, totalPages: 2 },
    });
    expect(result.vendors).toHaveLength(1);
    expect(result.vendors[0].name).toBe('Acme');
    expect(result.pagination).toEqual({
      page: 2,
      limit: 25,
      total: 40,
      totalPages: 2,
    });
  });

  it('falls back sanely when the metadata is absent', () => {
    const result = vendorListSerializer({ data: [{ id: 'v1' }] });
    expect(result.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 1,
      totalPages: 1,
    });
  });
});

describe('vendorBillsSerializer', () => {
  const today = new Date().toISOString().slice(0, 10);
  const past = '2020-01-01';

  it('RE-DERIVES overdue, which this route never applies itself', () => {
    // GET /vendors/:id/bills does not run the derivation that GET /bills does,
    // so without this the same bill reads `open` here and `overdue` there.
    const { rows } = vendorBillsSerializer({
      data: [
        { id: 'b1', billNumber: 'B-1', status: 'open', balanceDue: '500', dueDate: past },
      ],
    });
    expect(rows[0].status).toBe('overdue');
  });

  it('leaves a settled past-due bill alone', () => {
    const { rows } = vendorBillsSerializer({
      data: [{ id: 'b1', status: 'paid', balanceDue: '0', dueDate: past }],
    });
    expect(rows[0].status).toBe('paid');
  });

  it('leaves a bill due today alone', () => {
    const { rows } = vendorBillsSerializer({
      data: [{ id: 'b1', status: 'open', balanceDue: '500', dueDate: today }],
    });
    expect(rows[0].status).toBe('open');
  });
});

describe('vendorPaymentsSerializer', () => {
  it('reads totalAmount, which is what a vendor payment carries', () => {
    const { rows } = vendorPaymentsSerializer({
      data: [{ id: 'p1', totalAmount: '1200.50', paymentDate: '2026-09-01' }],
    });
    expect(rows[0].amount).toBe(1200.5);
  });
});

// ═══════════════════════════════════════════════════════
// Bills
// ═══════════════════════════════════════════════════════

const billForm = (over: Partial<BillFormData> = {}): BillFormData => ({
  vendorId: 'v1',
  vendorName: 'Acme',
  billNumber: 'INV-9911',
  issueDate: '2026-09-01',
  dueDate: '2026-10-01',
  lines: [
    {
      id: 'l1',
      accountId: 'acct-1',
      description: 'Packaging',
      amount: '250.5',
      taxRate: '17',
    },
  ],
  notes: 'Delivered short',
  ...over,
});

describe('billFormToPayload', () => {
  it('sends billDate, not issueDate', () => {
    const payload = billFormToPayload(billForm(), 'open');
    expect(payload.billDate).toBe('2026-09-01');
    expect(payload).not.toHaveProperty('issueDate');
  });

  it('sends memo, not notes', () => {
    const payload = billFormToPayload(billForm(), 'open');
    expect(payload.memo).toBe('Delivered short');
    expect(payload).not.toHaveProperty('notes');
  });

  it('sends amount per line, and no quantity or unit price', () => {
    // The DTO accepts quantity + unitPrice as an alternative, but neither is
    // persisted — a bill saved that way reads back as a bare amount. `amount`
    // is the only shape that round-trips.
    const [line] = billFormToPayload(billForm(), 'open').lines;
    expect(line).toEqual({
      accountId: 'acct-1',
      description: 'Packaging',
      amount: '250.5',
      taxRate: '17',
    });
    expect(line).not.toHaveProperty('quantity');
    expect(line).not.toHaveProperty('unitPrice');
  });

  it('sends line figures as STRINGS', () => {
    const [line] = billFormToPayload(billForm(), 'open').lines;
    expect(typeof line.amount).toBe('string');
    expect(typeof line.taxRate).toBe('string');
  });

  it('carries no discount field of any kind', () => {
    const payload = billFormToPayload(billForm(), 'open');
    expect(payload).not.toHaveProperty('discountType');
    expect(payload).not.toHaveProperty('discountValue');
    expect(payload).not.toHaveProperty('discountAmount');
  });

  it('omits a blank bill number rather than sending ""', () => {
    const payload = billFormToPayload(billForm({ billNumber: '  ' }), 'draft');
    expect('billNumber' in payload).toBe(false);
  });

  it('passes the requested status through', () => {
    expect(billFormToPayload(billForm(), 'draft').status).toBe('draft');
    expect(billFormToPayload(billForm(), 'open').status).toBe('open');
  });
});

describe('mapBill', () => {
  it('reads the wire names — billDate, memo, companyName', () => {
    const bill = mapBill({
      id: 'b1',
      billNumber: 'INV-1',
      billDate: '2026-09-01',
      dueDate: '2026-10-01',
      memo: 'A note',
      status: 'open',
      vendor: { companyName: 'Acme Supplies' },
      total: '100',
      balanceDue: '100',
      lines: [],
    });
    expect(bill.issueDate).toBe('2026-09-01');
    expect(bill.notes).toBe('A note');
    expect(bill.vendorName).toBe('Acme Supplies');
  });

  it('derives overdue on read, since the column never holds it', () => {
    const bill = mapBill({
      id: 'b1',
      status: 'open',
      dueDate: '2020-01-01',
      balanceDue: '500',
      lines: [],
    });
    expect(bill.status).toBe('overdue');
  });
});

describe('billListSerializer', () => {
  it('LOSES its pagination — the response is flat', () => {
    // GET /bills returns { data, pagination } at the top level, so the
    // envelope keeps only `data` and the metadata never reaches us. There is
    // nothing to recover, which is why the list is first-page-only.
    const bills = billListSerializer([{ id: 'b1', lines: [] }]);
    expect(bills).toHaveLength(1);
    expect(bills[0].id).toBe('b1');
  });

  it('handles the pre-envelope shape too', () => {
    expect(billListSerializer({ data: [{ id: 'b1', lines: [] }] })).toHaveLength(1);
  });
});

describe('billPaymentsSerializer', () => {
  it('reads data.payments — the route has no `data` key of its own', () => {
    const rows = billPaymentsSerializer(
      {
        payments: [
          {
            id: 'p1',
            paymentDate: '2026-09-05',
            totalAmount: '900',
            applications: [
              { billId: 'b1', amountApplied: '400' },
              { billId: 'b2', amountApplied: '500' },
            ],
          },
        ],
      },
      'b1',
    );
    expect(rows).toHaveLength(1);
    // This bill's share, not the payment's whole total.
    expect(rows[0].appliedAmount).toBe(400);
    expect(rows[0].totalAmount).toBe(900);
    expect(rows[0].allocations).toHaveLength(2);
  });

  it('reads the duplicate `allocations` alias when applications is absent', () => {
    const rows = billPaymentsSerializer(
      {
        payments: [
          {
            id: 'p1',
            totalAmount: '400',
            allocations: [{ billId: 'b1', amountApplied: '400' }],
          },
        ],
      },
      'b1',
    );
    expect(rows[0].appliedAmount).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════
// Purchase orders
// ═══════════════════════════════════════════════════════

const poForm = (
  over: Partial<PurchaseOrderFormData> = {},
): PurchaseOrderFormData => ({
  vendorId: 'v1',
  vendorName: 'Acme',
  orderDate: '2026-09-01',
  expectedDate: '2026-09-20',
  lines: [
    {
      id: 'l1',
      itemId: 'item-1',
      description: 'Widget',
      quantity: '10',
      unitPrice: '25.5',
      taxRate: '0',
    },
  ],
  notes: '',
  ...over,
});

describe('purchaseOrderFormToPayload', () => {
  it('sends orderedQty and unitCost, not quantity and unitPrice', () => {
    const [line] = purchaseOrderFormToPayload(poForm()).lines;
    expect(line).toMatchObject({
      description: 'Widget',
      orderedQty: '10',
      unitCost: '25.5',
      taxRate: '0',
      itemId: 'item-1',
    });
    expect(line).not.toHaveProperty('quantity');
    expect(line).not.toHaveProperty('unitPrice');
  });

  it('sends figures as strings', () => {
    const [line] = purchaseOrderFormToPayload(poForm()).lines;
    expect(typeof line.orderedQty).toBe('string');
    expect(typeof line.unitCost).toBe('string');
  });

  it('carries no discount — a PO has no such field', () => {
    const payload = purchaseOrderFormToPayload(poForm());
    expect(payload).not.toHaveProperty('discountType');
    expect(payload).not.toHaveProperty('discountValue');
  });

  it('OMITS a blank expected date rather than sending ""', () => {
    // @IsOptional() skips only null and undefined; "" would reach
    // @IsDateString() and 400.
    const payload = purchaseOrderFormToPayload(poForm({ expectedDate: '' }));
    expect('expectedDate' in payload).toBe(false);
  });

  it('OMITS a blank itemId rather than sending ""', () => {
    const payload = purchaseOrderFormToPayload(
      poForm({ lines: [{ ...poForm().lines[0], itemId: '' }] }),
    );
    expect('itemId' in payload.lines[0]).toBe(false);
  });
});

describe('mapPurchaseOrder', () => {
  it('translates the PO line vocabulary onto the shared line shape', () => {
    const po = mapPurchaseOrder({
      id: 'po1',
      poNumber: 'PO-0001',
      status: 'partial',
      vendor: { companyName: 'Acme Supplies' },
      lines: [
        {
          id: 'l1',
          description: 'Widget',
          orderedQty: '10',
          unitCost: '25.5',
          lineTotal: '255',
          receivedQty: '4',
        },
      ],
    });
    expect(po.vendorName).toBe('Acme Supplies');
    expect(po.lines[0]).toMatchObject({
      quantity: 10,
      unitPrice: 25.5,
      amount: 255,
      receivedQuantity: 4,
    });
  });

  it('reads the status verbatim — there is no partially_received', () => {
    // The five values the column holds are draft | sent | partial | received |
    // closed. Nothing maps onto anything else.
    for (const status of ['draft', 'sent', 'partial', 'received', 'closed']) {
      expect(mapPurchaseOrder({ id: 'x', status, lines: [] }).status).toBe(status);
    }
  });

  it('defaults an absent status to draft', () => {
    expect(mapPurchaseOrder({ id: 'x', lines: [] }).status).toBe('draft');
  });
});

describe('purchaseOrderListSerializer', () => {
  it('loses its pagination — the response is flat, like bills', () => {
    const rows = purchaseOrderListSerializer([{ id: 'po1', lines: [] }]);
    expect(rows).toHaveLength(1);
  });
});
