import { describe, expect, it } from 'vitest';

import {
  APPROVAL_TYPES,
  approvalAmount,
  approvalCounterparty,
  canDecide,
  canWithdraw,
  invalidationKeysFor,
  resultLink,
  statusDisplay,
  voidTargetLink,
  type ApprovalRequest,
  type ApprovalType,
} from '@/models/approval';
import { computeTotals } from '@/models/document';
import { approvalListSerializer, mapApproval } from '@/serializers/approvalSerializer';

const req = (type: ApprovalType, payload: Record<string, unknown>, over: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
  id: 'req-1',
  companyId: 'co',
  type,
  status: 'pending',
  payload,
  summary: '',
  reason: null,
  requestedBy: 'staff-1',
  reviewedBy: null,
  reviewerRole: null,
  reviewedAt: null,
  reviewerComment: null,
  journalEntryId: null,
  resultId: null,
  lastError: null,
  createdAt: '2026-09-11T08:00:00Z',
  updatedAt: '2026-09-11T08:00:00Z',
  ...over,
});

describe('approvalAmount', () => {
  it('prices an invoice from its lines, as the invoice form would', () => {
    const r = req('invoice', {
      customerId: 'c1',
      lines: [
        { description: 'Ghee', quantity: '2', unitPrice: '500', taxRate: '17' },
        { description: 'Oil', quantity: '1', unitPrice: '250', taxRate: '0' },
      ],
    });
    // 1000 @ 17% = 1170, + 250 = 1420
    expect(approvalAmount(r)).toBe(1420);
  });

  it('passes an invoice discount through to computeTotals', () => {
    const lines = [{ quantity: '4', unitPrice: '250', taxRate: '0' }];
    const r = req('invoice', { lines, discountType: 'percent', discountValue: '10' });
    expect(approvalAmount(r)).toBe(computeTotals(lines, 'percent', '10').total);
  });

  it('prices a purchase order from orderedQty × unitCost', () => {
    expect(
      approvalAmount(req('po', { lines: [{ orderedQty: '10', unitCost: '25', taxRate: '0' }] })),
    ).toBe(250);
  });

  it('prices a vendor credit from net amount plus tax', () => {
    expect(
      approvalAmount(req('vendor_credit', { action: 'create', lines: [{ amount: '1000', taxRate: '17' }] })),
    ).toBe(1170);
  });

  it('reads the amount of a customer payment', () => {
    expect(approvalAmount(req('invoice_payment', { amount: '4500.50' }))).toBe(4500.5);
  });

  it('sums a bill payment’s applications — the DTO has no top-level amount', () => {
    expect(
      approvalAmount(req('bill_payment', { applications: [{ amount: '300' }, { amount: '200.50' }] })),
    ).toBe(500.5);
  });

  it('sums a journal entry’s debits', () => {
    expect(
      approvalAmount(req('journal', { lines: [{ debit: '400', credit: '0' }, { debit: '600', credit: '0' }, { debit: '0', credit: '1000' }] })),
    ).toBe(1000);
  });

  it('reads the amount applied on apply actions', () => {
    expect(approvalAmount(req('credit_memo', { action: 'apply', amount: '75' }))).toBe(75);
    expect(approvalAmount(req('vendor_credit', { action: 'apply', amount: '120' }))).toBe(120);
  });

  it('is null where the request is not an amount of money', () => {
    expect(approvalAmount(req('void', { entity: 'invoice', targetId: 'i1' }))).toBe(null);
    expect(approvalAmount(req('adjustment', { itemId: 'x', newQty: '5' }))).toBe(null);
    expect(approvalAmount(req('delivery_undo', { requestId: 'd1' }))).toBe(null);
    expect(approvalAmount(req('credit_memo', { action: 'refund', creditMemoId: 'm1' }))).toBe(null);
    expect(approvalAmount(req('journal', { draftEntryId: 'je-1' }))).toBe(null);
  });

  it('is the advance for a delivery request — given, or the whole order when prepaid', () => {
    const items = [{ itemId: 'i1', orderedQty: 2, unitPrice: 150, taxRate: 10 }];
    expect(approvalAmount(req('delivery_advance', { advanceAmount: '100', items }))).toBe(100);
    expect(approvalAmount(req('delivery_advance', { prePaid: true, items }))).toBe(330);
    expect(approvalAmount(req('delivery_advance', { items }))).toBe(null);
  });

  it('is null — never NaN — for a malformed payload', () => {
    expect(approvalAmount(req('invoice', {}))).toBe(null);
    expect(approvalAmount(req('bill_payment', { applications: 'nope' }))).toBe(null);
  });

  it('handles every approval type without throwing', () => {
    for (const t of APPROVAL_TYPES) {
      expect(() => approvalAmount(req(t, {}))).not.toThrow();
    }
  });
});

describe('approvalCounterparty', () => {
  it('names the customer on sales requests and the vendor on purchase requests', () => {
    expect(approvalCounterparty(req('invoice', { customerId: 'c1' }))).toEqual({ kind: 'customer', id: 'c1' });
    expect(approvalCounterparty(req('bill_payment', { vendorId: 'v1' }))).toEqual({ kind: 'vendor', id: 'v1' });
    expect(approvalCounterparty(req('journal', {}))).toBe(null);
  });
});

describe('canDecide and canWithdraw', () => {
  it('lets the owner decide someone else’s pending request', () => {
    expect(canDecide(req('invoice', {}), 'owner-1', true)).toBe(true);
  });

  it('never lets staff decide — approvals.decide is false', () => {
    expect(canDecide(req('invoice', {}), 'owner-1', false)).toBe(false);
  });

  it('refuses a request stranded in approving, as the server does with 409', () => {
    expect(canDecide(req('invoice', {}, { status: 'approving' }), 'owner-1', true)).toBe(false);
  });

  it('refuses an owner approving their own request (MAKER_IS_CHECKER)', () => {
    expect(canDecide(req('invoice', {}, { requestedBy: 'owner-1' }), 'owner-1', true)).toBe(false);
  });

  it('refuses anything already decided', () => {
    for (const status of ['approved', 'rejected', 'cancelled'] as const) {
      expect(canDecide(req('invoice', {}, { status }), 'owner-1', true)).toBe(false);
    }
  });

  it('lets only the requester withdraw, and only while pending', () => {
    expect(canWithdraw(req('invoice', {}), 'staff-1')).toBe(true);
    expect(canWithdraw(req('invoice', {}), 'someone-else')).toBe(false);
    expect(canWithdraw(req('invoice', {}, { status: 'approved' }), 'staff-1')).toBe(false);
  });
});

describe('statusDisplay', () => {
  it('shows approving as interrupted, and cancelled as withdrawn', () => {
    expect(statusDisplay('approving')).toEqual({ badge: 'pending', label: 'Interrupted' });
    expect(statusDisplay('cancelled').label).toBe('Withdrawn');
    expect(statusDisplay('rejected').badge).toBe('rejected');
  });
});

describe('links', () => {
  it('links nothing until the request is approved', () => {
    expect(resultLink(req('invoice', {}, { resultId: 'inv-9' }))).toBe(null);
  });

  it('links the document an approval created', () => {
    expect(resultLink(req('invoice', {}, { status: 'approved', resultId: 'inv-9' }))?.to).toBe('/invoices/inv-9');
    expect(resultLink(req('journal', {}, { status: 'approved', resultId: 'je-3' }))?.to).toBe('/journal-entries/je-3');
  });

  it('falls back to the journal entry for a bill payment, which has no page', () => {
    expect(
      resultLink(req('bill_payment', {}, { status: 'approved', resultId: 'bp-1', journalEntryId: 'je-7' }))?.to,
    ).toBe('/journal-entries/je-7');
  });

  it('points a void at the document it reversed', () => {
    expect(voidTargetLink({ entity: 'credit_memo', targetId: 'm2' })).toBe('/credit-memos/m2');
    expect(voidTargetLink({ entity: 'adjustment', targetId: 'a1' })).toBe(null);
    expect(resultLink(req('void', { entity: 'invoice', targetId: 'i4' }, { status: 'approved' }))?.to).toBe('/invoices/i4');
  });
});

describe('invalidationKeysFor', () => {
  it('always refreshes the queue, the badge and every ledger reader', () => {
    for (const t of APPROVAL_TYPES) {
      const keys = invalidationKeysFor(t).map((k) => k[0]);
      for (const base of ['approvals', 'reports', 'dashboard', 'accounts', 'journal-entries']) {
        expect(keys).toContain(base);
      }
    }
  });

  it('adds the domains a type touches', () => {
    expect(invalidationKeysFor('invoice').map((k) => k[0])).toContain('invoices');
    expect(invalidationKeysFor('bill_payment').map((k) => k[0])).toContain('bills');
    expect(invalidationKeysFor('invoice_payment').map((k) => k[0])).toContain('payments');
    expect(invalidationKeysFor('delivery_advance').map((k) => k[0])).toEqual(
      expect.arrayContaining(['deliveries', 'inventory', 'payments']),
    );
  });
});

describe('approval serializer', () => {
  it('maps the entity and keeps the payload whole', () => {
    const r = mapApproval({
      id: 'a1',
      type: 'invoice',
      status: 'rejected',
      payload: { customerId: 'c1', lines: [] },
      summary: 'Invoice: 1 line(s)',
      requestedBy: 'u1',
      reviewerComment: 'Wrong customer',
      resultId: '',
    });
    expect(r.status).toBe('rejected');
    expect(r.reviewerComment).toBe('Wrong customer');
    expect(r.payload).toEqual({ customerId: 'c1', lines: [] });
    // '' is absent, not an id.
    expect(r.resultId).toBe(null);
  });

  it('reads the list bare or wrapped', () => {
    expect(approvalListSerializer([{ id: 'a' }])).toHaveLength(1);
    expect(approvalListSerializer({ data: [{ id: 'a' }, { id: 'b' }] })).toHaveLength(2);
    expect(approvalListSerializer(null)).toEqual([]);
  });
});
