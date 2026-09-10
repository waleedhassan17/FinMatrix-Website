import { describe, expect, it } from 'vitest';

import type { VendorCreditFormData } from '@/models/vendorCredit';
import { freshVendorCreditLine } from '@/models/vendorCredit';
import {
  mapVendorCredit,
  vendorCreditFormToPayload,
  vendorCreditListSerializer,
  vendorCreditSingleSerializer,
} from '@/serializers/vendorCreditSerializer';

// ═══════════════════════════════════════════════════════
// Vendor credits
// ═══════════════════════════════════════════════════════

const creditForm = (
  over: Partial<VendorCreditFormData> = {},
): VendorCreditFormData => ({
  vendorId: 'vendor-1',
  date: '2026-03-01',
  reason: '',
  lines: [
    {
      ...freshVendorCreditLine(),
      description: 'Overcharged on freight',
      amount: '1200.00',
    },
  ],
  ...over,
});

describe('vendorCreditFormToPayload', () => {
  it('sends the fields the DTO declares and nothing else', () => {
    const payload = vendorCreditFormToPayload(
      creditForm({ reason: 'Damaged on arrival' }),
    );

    expect(payload).toEqual({
      vendorId: 'vendor-1',
      date: '2026-03-01',
      reason: 'Damaged on arrival',
      lines: [{ description: 'Overcharged on freight', amount: '1200.00' }],
    });
  });

  it('never sends a credit number — the server assigns it', () => {
    expect(vendorCreditFormToPayload(creditForm())).not.toHaveProperty(
      'vendorCreditNumber',
    );
  });

  it('never sends totals — the server computes them from the lines', () => {
    const payload = vendorCreditFormToPayload(creditForm());
    expect(payload).not.toHaveProperty('subtotal');
    expect(payload).not.toHaveProperty('taxAmount');
    expect(payload).not.toHaveProperty('total');
  });

  it('drops a blank reason rather than sending an empty string', () => {
    expect(vendorCreditFormToPayload(creditForm({ reason: '   ' })).reason).toBe(
      undefined,
    );
  });

  it('omits itemId entirely on a money-only line', () => {
    // `@IsOptional() @IsUUID()` — "" is present and fails, so the key must go.
    const [line] = vendorCreditFormToPayload(creditForm()).lines;
    expect('itemId' in line).toBe(false);
    expect('quantity' in line).toBe(false);
  });

  it('omits accountId rather than sending an empty string', () => {
    const [line] = vendorCreditFormToPayload(creditForm()).lines;
    expect('accountId' in line).toBe(false);
  });

  it('sends accountId on a money-only line that names one', () => {
    const form = creditForm();
    form.lines[0].accountId = 'acct-6000';
    const [line] = vendorCreditFormToPayload(form).lines;
    expect(line.accountId).toBe('acct-6000');
  });

  it('sends quantity only alongside an item', () => {
    const form = creditForm();
    form.lines[0].itemId = 'item-1';
    form.lines[0].quantity = '3';
    form.lines[0].amount = '750.00';

    const [line] = vendorCreditFormToPayload(form).lines;
    expect(line.itemId).toBe('item-1');
    expect(line.quantity).toBe('3');
  });

  it('drops accountId on an item line, which posts to Inventory instead', () => {
    // The server refuses a NON-stock line pointed at 1200; on a stock line it
    // ignores accountId outright. Sending a stale one is misleading either way.
    const form = creditForm();
    form.lines[0].itemId = 'item-1';
    form.lines[0].quantity = '2';
    form.lines[0].accountId = 'acct-6000';

    const [line] = vendorCreditFormToPayload(form).lines;
    expect('accountId' in line).toBe(false);
  });

  it('omits taxRate when it is zero', () => {
    const [line] = vendorCreditFormToPayload(creditForm()).lines;
    expect('taxRate' in line).toBe(false);
  });

  it('sends taxRate when set, so the input tax claim is reversed', () => {
    const form = creditForm();
    form.lines[0].taxRate = '17';
    const [line] = vendorCreditFormToPayload(form).lines;
    expect(line.taxRate).toBe('17');
  });

  it('sends amounts as 2-dp strings', () => {
    const form = creditForm();
    form.lines[0].amount = '1200';
    expect(vendorCreditFormToPayload(form).lines[0].amount).toBe('1200.00');
  });

  it('skips lines with no description or no amount', () => {
    const form = creditForm();
    form.lines = [
      { ...freshVendorCreditLine(), description: 'Real line', amount: '100' },
      { ...freshVendorCreditLine(), description: '', amount: '' },
      { ...freshVendorCreditLine(), description: 'Zero', amount: '0' },
    ];
    expect(vendorCreditFormToPayload(form).lines).toHaveLength(1);
  });
});

describe('mapVendorCredit', () => {
  it('reads the stringified decimals the API sends', () => {
    const credit = mapVendorCredit({
      id: 'vc-1',
      vendorCreditNumber: 'VC-2026-0001',
      vendorId: 'vendor-1',
      vendorName: 'Acme Supplies',
      date: '2026-03-01',
      status: 'open',
      subtotal: '1000.0000',
      taxAmount: '170.0000',
      total: '1170.0000',
      amountApplied: '0.0000',
      balance: '1170.0000',
      lines: [
        {
          id: 'l-1',
          accountId: 'acct-6000',
          description: 'Freight',
          amount: '1000.0000',
          taxRate: '17.0000',
          quantity: null,
          lineOrder: 0,
        },
      ],
    });

    expect(credit.subtotal).toBe(1000);
    expect(credit.taxAmount).toBe(170);
    expect(credit.total).toBe(1170);
    expect(credit.balance).toBe(1170);
    expect(credit.lines[0].amount).toBe(1000);
    expect(credit.lines[0].taxRate).toBe(17);
    // A money-only line has a null quantity, which must read as 0, not NaN.
    expect(credit.lines[0].quantity).toBe(0);
  });

  it('holds the subtotal + tax = total invariant', () => {
    const credit = mapVendorCredit({
      subtotal: '1000.0000',
      taxAmount: '170.0000',
      total: '1170.0000',
    });
    expect(credit.subtotal + credit.taxAmount).toBe(credit.total);
  });

  it('leaves originalBillId null rather than an empty string', () => {
    expect(mapVendorCredit({ id: 'vc-1' }).originalBillId).toBe(null);
  });

  it('defaults a missing status to open', () => {
    expect(mapVendorCredit({ id: 'vc-1' }).status).toBe('open');
  });
});

describe('vendorCreditListSerializer', () => {
  it('reads the paginated {data} envelope the AP side uses', () => {
    const rows = vendorCreditListSerializer({
      data: [{ id: 'vc-1' }, { id: 'vc-2' }],
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
    });
    expect(rows.map((r) => r.id)).toEqual(['vc-1', 'vc-2']);
  });

  it('tolerates a bare array', () => {
    expect(vendorCreditListSerializer([{ id: 'vc-1' }])).toHaveLength(1);
  });

  it('is empty for a malformed payload rather than throwing', () => {
    expect(vendorCreditListSerializer(null)).toEqual([]);
    expect(vendorCreditListSerializer({})).toEqual([]);
  });
});

describe('vendorCreditSingleSerializer', () => {
  it('reads the bare entity the detail route returns', () => {
    const credit = vendorCreditSingleSerializer({
      id: 'vc-1',
      total: '500.0000',
      lines: [],
    });
    expect(credit?.id).toBe('vc-1');
    expect(credit?.total).toBe(500);
  });

  it('reads a wrapped entity too', () => {
    expect(
      vendorCreditSingleSerializer({ vendorCredit: { id: 'vc-9' } })?.id,
    ).toBe('vc-9');
  });

  it('is null for an empty payload', () => {
    expect(vendorCreditSingleSerializer(null)).toBe(null);
    expect(vendorCreditSingleSerializer({})).toBe(null);
  });
});
