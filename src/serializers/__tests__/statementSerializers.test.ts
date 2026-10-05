import { describe, expect, it } from 'vitest';

import { customerStatementSerializer } from '@/serializers/customerSerializer';
import { vendorStatementSerializer } from '@/serializers/vendorSerializer';

// The statement is read from the books on the server (GET …/ledger-statement):
// one line per transaction in date order, each carrying its running balance and
// the document behind it. These pin the mapping, not the arithmetic.

describe('customerStatementSerializer', () => {
  const payload = {
    partyType: 'customer',
    party: { id: 'c1', code: 'C-0007', name: 'Madina Wholesale', email: 'm@x.pk' },
    period: { startDate: '2026-02-01', endDate: '2026-02-28' },
    openingBalance: 300,
    lines: [
      { id: 'g1', date: '2026-02-01', kind: 'invoice', label: 'Invoice', reference: 'INV-1', documentType: 'invoice', documentId: 'i1', amount: 1200, balance: 1500 },
      { id: 'g2', date: '2026-02-05', kind: 'credit_memo', label: 'Credit memo', reference: 'CM-1', documentType: 'credit_memo', documentId: 'm1', amount: -200, balance: 1300 },
      { id: 'g3', date: '2026-02-06', kind: 'refund', label: 'Refund', reference: 'CM-1', documentType: 'credit_memo', documentId: 'm1', amount: 50, balance: 1350 },
      { id: 'g4', date: '2026-02-08', kind: 'advance', label: 'Advance received', reference: 'DEL-9', documentType: 'delivery', documentId: null, amount: -100, balance: 1250 },
      { id: 'g5', date: '2026-02-10', kind: 'payment', label: 'Receipt', reference: 'RCT-1', documentType: 'payment', documentId: 'p1', amount: -500, balance: 750 },
      { id: 'g6', date: '2026-02-11', kind: 'something_new', label: 'Posting', reference: '', documentType: null, documentId: null, amount: 0.5, balance: 750.5 },
    ],
    totals: { invoiced: 1200, received: 600, credited: 200, refunded: 50, other: 0.5 },
    closingBalance: 750.5,
  };

  it('keeps the server\'s lines, order and running balance', () => {
    const s = customerStatementSerializer(payload);
    expect(s.lines.map((l) => [l.date, l.kind, l.reference, l.amount, l.runningBalance])).toEqual([
      ['2026-02-01', 'invoice', 'INV-1', 1200, 1500],
      ['2026-02-05', 'credit_memo', 'CM-1', -200, 1300],
      ['2026-02-06', 'refund', 'CM-1', 50, 1350],
      ['2026-02-08', 'advance', 'DEL-9', -100, 1250],
      ['2026-02-10', 'payment', 'RCT-1', -500, 750],
      // An unknown kind reads as an adjustment, and an empty reference as a dash.
      ['2026-02-11', 'other', '—', 0.5, 750.5],
    ]);
    expect(s.lines[s.lines.length - 1].runningBalance).toBe(s.closingBalance);
  });

  it('carries the customer ID, the totals and each line\'s document', () => {
    const s = customerStatementSerializer(payload);
    expect(s.customer).toEqual({ id: 'c1', code: 'C-0007', name: 'Madina Wholesale', email: 'm@x.pk' });
    expect(s.totals).toEqual({ invoiced: 1200, received: 600, credited: 200, refunded: 50 });
    expect(s.lines[0]).toMatchObject({ documentType: 'invoice', documentId: 'i1' });
    expect(s.lines[3]).toMatchObject({ documentType: 'delivery', documentId: null });
    expect(s.openingBalance).toBe(300);
  });
});

describe('vendorStatementSerializer', () => {
  it('reads bills, payments, credits and voids as the vendor sees them', () => {
    const s = vendorStatementSerializer({
      partyType: 'vendor',
      party: { id: 'v1', code: 'V-0003', name: 'Habib Oil Mills', email: null },
      period: { startDate: '2026-03-01', endDate: '2026-03-31' },
      openingBalance: 0,
      lines: [
        { id: 'g1', date: '2026-03-02', kind: 'bill', reference: 'B-9', amount: 5000, balance: 5000, documentType: 'bill', documentId: 'b1' },
        { id: 'g2', date: '2026-03-09', kind: 'vendor_credit', reference: 'VC-3', amount: -800, balance: 4200, documentType: 'vendor_credit', documentId: 'c1' },
        { id: 'g3', date: '2026-03-12', kind: 'bill_void', reference: 'B-7', amount: -300, balance: 3900, documentType: 'bill', documentId: null },
        { id: 'g4', date: '2026-03-20', kind: 'payment', reference: 'CHQ 1', amount: -1000, balance: 2900, documentType: 'bill_payment', documentId: 'p1' },
      ],
      totals: { billed: 4700, paid: 1000, credited: 800, other: 0 },
      closingBalance: 2900,
    });
    expect(s.vendor).toEqual({ id: 'v1', code: 'V-0003', name: 'Habib Oil Mills', email: '' });
    expect(s.lines.map((l) => [l.kind, l.amount, l.runningBalance])).toEqual([
      ['bill', 5000, 5000],
      ['vendor_credit', -800, 4200],
      ['bill_void', -300, 3900],
      ['payment', -1000, 2900],
    ]);
    expect(s.totals).toEqual({ billed: 4700, paid: 1000, credited: 800 });
  });
});
