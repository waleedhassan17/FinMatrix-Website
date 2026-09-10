import { describe, expect, it } from 'vitest';

import { canApply, canDelete, canRefund, canVoid, maxApplicable } from '@/models/creditMemo';
import type { AllocationRow, PaymentFormData } from '@/models/payment';
import { isPendingApproval } from '@/networks/network/apiHelpers';
import { creditMemoFormToPayload, creditMemoListSerializer } from '@/serializers/creditMemoSerializer';
import {
  outstandingSerializer,
  paymentFormToPayload,
  paymentListSerializer,
} from '@/serializers/paymentSerializer';

const row = (
  documentId: string,
  balance: number,
  checked: boolean,
  applied: string,
): AllocationRow => ({
  documentId,
  documentNumber: `INV-${documentId}`,
  dueDate: '2026-01-01',
  total: balance,
  amountPaid: 0,
  balance,
  checked,
  applied,
});

const form = (over: Partial<PaymentFormData> = {}): PaymentFormData => ({
  customerId: 'cus-1',
  customerName: 'Acme',
  paymentDate: '2026-09-10',
  paymentMethod: 'bank_transfer',
  amount: '500',
  reference: ' CHQ-1 ',
  memo: '  ',
  bankAccountId: '',
  mode: 'manual',
  rows: [row('a', 300, true, '300'), row('b', 400, false, '0')],
  ...over,
});

describe('paymentFormToPayload — the allocation contract', () => {
  it('sends an explicit applications array in manual mode', () => {
    // This is the whole point: an empty or absent array makes the server sweep
    // every open invoice FIFO, so the user's ticks would be silently ignored.
    const p = paymentFormToPayload(form());
    expect(p.applications).toEqual([{ invoiceId: 'a', amount: '300.00' }]);
  });

  it('OMITS applications entirely in auto mode', () => {
    const p = paymentFormToPayload(form({ mode: 'auto' }));
    expect(p).not.toHaveProperty('applications');
  });

  it('excludes unticked rows and zero allocations', () => {
    const p = paymentFormToPayload(
      form({ rows: [row('a', 300, true, '0'), row('b', 400, false, '400')] }),
    );
    expect(p.applications).toEqual([]);
  });

  it('sends every money field as a .toFixed(2) string', () => {
    const p = paymentFormToPayload(form({ amount: '500.5' }));
    expect(p.amount).toBe('500.50');
    expect(typeof p.amount).toBe('string');
    expect(p.applications?.[0].amount).toBe('300.00');
  });

  it('renames notes to memo and drops it when blank', () => {
    expect(paymentFormToPayload(form()).memo).toBeUndefined();
    expect(paymentFormToPayload(form({ memo: 'Cheque banked' })).memo).toBe(
      'Cheque banked',
    );
    expect(paymentFormToPayload(form())).not.toHaveProperty('notes');
  });

  it('trims the reference and drops it when blank', () => {
    expect(paymentFormToPayload(form()).reference).toBe('CHQ-1');
    expect(paymentFormToPayload(form({ reference: '   ' })).reference).toBeUndefined();
  });

  it('omits bankAccountId when the deposit account is Automatic', () => {
    // Omitted means the server picks 1000 Cash or 1010 Business Checking.
    expect(paymentFormToPayload(form())).not.toHaveProperty('bankAccountId');
    expect(
      paymentFormToPayload(form({ bankAccountId: 'acct-1' })).bankAccountId,
    ).toBe('acct-1');
  });

  it('coerces an unparseable amount to "0.00" rather than "NaN"', () => {
    expect(paymentFormToPayload(form({ amount: 'abc' })).amount).toBe('0.00');
  });
});

describe('outstandingSerializer', () => {
  it('reads the open figure from `balance`', () => {
    // Not balanceDue, not amountDue — the endpoint returns full Invoice rows.
    const rows = outstandingSerializer([
      {
        id: 'i1',
        invoiceNumber: 'INV-2026-0001',
        dueDate: '2026-02-01',
        total: '1000.0000',
        amountPaid: '250.0000',
        balance: '750.0000',
      },
    ]);
    expect(rows[0].balance).toBe(750);
    expect(rows[0].checked).toBe(false);
    expect(rows[0].applied).toBe('0');
  });
});

describe('paymentListSerializer', () => {
  it('reads a bare array and derives allocated / unapplied', () => {
    // GET /payments loses its pagination to the response envelope.
    const [p] = paymentListSerializer([
      {
        id: 'p1',
        amount: '500.0000',
        applications: [
          { invoiceId: 'i1', amountApplied: '300.0000' },
          { invoiceId: 'i2', amountApplied: '100.0000' },
        ],
      },
    ]);
    expect(p.allocated).toBe(400);
    expect(p.unapplied).toBe(100);
  });

  it('reads the write-shaped `amount` on an application too', () => {
    // The wire returns amountApplied; a replayed approval payload carries
    // `amount`. Both have to map.
    const [p] = paymentListSerializer([
      { id: 'p1', amount: '100.0000', applications: [{ invoiceId: 'i1', amount: '60' }] },
    ]);
    expect(p.allocated).toBe(60);
  });

  it('has no status and falls back to an id when the reference is blank', () => {
    const [p] = paymentListSerializer([{ id: 'abcdef123456', amount: '10' }]);
    expect(p.reference).toBe('');
    expect(p).not.toHaveProperty('status');
  });
});

describe('creditMemoFormToPayload', () => {
  it('never sends a number, and has no discount fields', () => {
    const p = creditMemoFormToPayload({
      customerId: 'cus-1',
      customerName: 'Acme',
      date: '2026-09-10',
      reason: ' damaged ',
      lines: [
        {
          id: 'l1',
          itemId: 'item-1',
          description: 'Widget',
          quantity: '2',
          unitPrice: '100',
          taxRate: '17',
        },
        {
          id: 'l2',
          itemId: '',
          description: 'Goodwill',
          quantity: '1',
          unitPrice: '50',
          taxRate: '0',
        },
      ],
    });
    expect(p).not.toHaveProperty('creditMemoNumber');
    expect(p).not.toHaveProperty('discountType');
    expect(p).not.toHaveProperty('discountValue');
    expect(p.reason).toBe('damaged');
    // An itemId line restocks; a free-text line must omit the key entirely.
    expect(p.lines[0].itemId).toBe('item-1');
    expect(p.lines[1]).not.toHaveProperty('itemId');
  });
});

describe('credit memo guards', () => {
  const memo = (over: Partial<Parameters<typeof canVoid>[0]> & { balance?: number } = {}) => ({
    balance: 100,
    status: 'open' as const,
    amountApplied: 0,
    ...over,
  });

  it('allows apply and refund only while credit remains', () => {
    expect(canApply(memo())).toBe(true);
    expect(canRefund(memo())).toBe(true);
    expect(canApply(memo({ balance: 0 }))).toBe(false);
    expect(canApply(memo({ status: 'refunded' }))).toBe(false);
    expect(canApply(memo({ status: 'void' }))).toBe(false);
    expect(canApply(memo({ status: 'closed' }))).toBe(false);
  });

  it('treats a rounding-dust balance as empty', () => {
    // 4-dp decimals mean a spent credit can land on 0.0001.
    expect(canApply(memo({ balance: 0.001 }))).toBe(false);
  });

  it('withdraws void the moment any credit has been applied', () => {
    // The server refuses with ALREADY_APPLIED, so the button must disappear.
    expect(canVoid(memo())).toBe(true);
    expect(canVoid(memo({ amountApplied: 25 }))).toBe(false);
    expect(canVoid(memo({ status: 'applied' }))).toBe(false);
    expect(canDelete(memo({ amountApplied: 25 }))).toBe(false);
  });
});

describe('maxApplicable', () => {
  it('is whichever runs out first, the credit or the invoice', () => {
    expect(maxApplicable(100, 250)).toBe(100);
    expect(maxApplicable(400, 250)).toBe(250);
  });

  it('never goes negative', () => {
    expect(maxApplicable(-5, 250)).toBe(0);
  });
});

describe('creditMemoListSerializer', () => {
  it('reads a bare array, defaulting status to open', () => {
    const [m] = creditMemoListSerializer([
      { id: 'c1', creditMemoNumber: 'CM-2026-0001', total: '500.0000', balance: '500.0000' },
    ]);
    expect(m.status).toBe('open');
    expect(m.balance).toBe(500);
  });
});

describe('isPendingApproval on a 200-status action', () => {
  it('recognises the body an apply/refund/void returns for staff', () => {
    // These return HTTP 200 rather than 201, but the body is identical.
    expect(
      isPendingApproval({
        pending: true,
        requestId: '8f3c1b2a-0000-4000-8000-000000000000',
        type: 'credit_memo',
        summary: 'Apply a credit memo to an invoice',
        message: 'Sent to the owner for approval.',
      }),
    ).toBe(true);
  });

  it('does not mistake a real credit memo for a pending request', () => {
    expect(isPendingApproval({ id: 'c1', creditMemoNumber: 'CM-2026-0001' })).toBe(
      false,
    );
  });
});
