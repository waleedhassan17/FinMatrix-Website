import { describe, expect, it } from 'vitest';

import { customerStatementSerializer } from '@/serializers/customerSerializer';
import { vendorStatementSerializer } from '@/serializers/vendorSerializer';

// A statement is read as one ledger: every event in date order, each moving a
// running balance that must land on the server's closing figure.

describe('customerStatementSerializer', () => {
  const payload = {
    customer: { id: 'c1', name: 'Madina Wholesale', email: 'm@x.pk' },
    period: { startDate: '2026-02-01', endDate: '2026-02-28' },
    openingBalance: '300.0000',
    invoices: [{ id: 'i1', invoiceNumber: 'INV-1', invoiceDate: '2026-02-01', total: '1200.0000' }],
    payments: [{ id: 'p1', paymentNumber: 'RCT-1', paymentDate: '2026-02-10', amount: '500.0000' }],
    creditMemos: [{ id: 'm1', creditMemoNumber: 'CM-1', date: '2026-02-05', total: '200.0000', status: 'open' }],
    refunds: [{ id: 'g1', creditMemoId: 'm1', creditMemoNumber: 'CM-1', date: '2026-02-06', amount: '50.0000' }],
    totals: { invoiced: '1200.0000', received: '500.0000', credited: '200.0000', refunded: '50.0000' },
    closingBalance: '850.0000',
  };

  it('merges every kind of event in date order, credits down and refunds up', () => {
    const s = customerStatementSerializer(payload);
    expect(s.lines.map((l) => [l.date, l.kind, l.reference, l.amount])).toEqual([
      ['2026-02-01', 'invoice', 'INV-1', 1200],
      ['2026-02-05', 'credit_memo', 'CM-1', -200],
      ['2026-02-06', 'refund', 'CM-1', 50],
      ['2026-02-10', 'payment', 'RCT-1', -500],
    ]);
  });

  it('runs the balance from the opening figure to the closing one', () => {
    const s = customerStatementSerializer(payload);
    expect(s.lines.map((l) => l.runningBalance)).toEqual([1500, 1300, 1350, 850]);
    expect(s.lines[s.lines.length - 1].runningBalance).toBe(s.closingBalance);
    expect(s.totals).toEqual({ invoiced: 1200, received: 500, credited: 200, refunded: 50 });
  });

  it('reads a server that predates credits as having none', () => {
    const { creditMemos: _c, refunds: _r, ...older } = payload;
    const s = customerStatementSerializer({ ...older, totals: { invoiced: '1200', received: '500' } });
    expect(s.lines.map((l) => l.kind)).toEqual(['invoice', 'payment']);
    expect(s.totals.credited).toBe(0);
    expect(s.totals.refunded).toBe(0);
  });
});

describe('vendorStatementSerializer', () => {
  it('merges bills, payments and vendor credits, credits bringing what we owe down', () => {
    const s = vendorStatementSerializer({
      vendor: { id: 'v1', name: 'Habib Oil Mills', email: '' },
      period: { startDate: '2026-03-01', endDate: '2026-03-31' },
      openingBalance: 0,
      bills: [{ id: 'b1', billNumber: 'B-9', billDate: '2026-03-02', total: '5000.0000' }],
      payments: [{ id: 'p1', reference: 'CHQ 1', paymentDate: '2026-03-20', totalAmount: '1000.0000' }],
      vendorCredits: [{ id: 'c1', vendorCreditNumber: 'VC-3', date: '2026-03-09', total: '800.0000', status: 'open' }],
      totals: { billed: '5000', paid: '1000', credited: '800' },
      closingBalance: '3200.0000',
    });
    expect(s.lines.map((l) => [l.kind, l.amount, l.runningBalance])).toEqual([
      ['bill', 5000, 5000],
      ['vendor_credit', -800, 4200],
      ['payment', -1000, 3200],
    ]);
    expect(s.totals).toEqual({ billed: 5000, paid: 1000, credited: 800 });
  });
});
