import { describe, expect, it } from 'vitest';

import { companyForDocument } from '@/features/documents/documentModel';
import { billPaymentAdviceDocument, paymentReceiptDocument } from '@/features/documents/receiptBuilders';
import { mapPayment } from '@/serializers/paymentSerializer';

const company = companyForDocument(null, 'Warehouse Co');

// SO-2026-0027 → INV-2026-0052 (7,581.60), part-paid 758 by RCT-2026-0040.
// The rest stays in receivables; the receipt has to say so.
const raw = {
  id: 'pay-1',
  paymentNumber: 'RCT-2026-0040',
  customerName: 'Allama Iqbal',
  paymentDate: '2026-09-17',
  paymentMethod: 'cash',
  amount: '758.0000',
  applications: [
    { invoiceId: 'inv-52', invoiceNumber: 'INV-2026-0052', amountApplied: '758.0000', invoiceTotal: '7581.6000', invoiceBalance: '6823.6000' },
  ],
};

describe('paymentReceiptDocument', () => {
  it('shows the invoice total and what is still owing after a part-payment', () => {
    const doc = paymentReceiptDocument(mapPayment(raw), company);
    expect(doc.number).toBe('RCT-2026-0040');
    expect(doc.lines[0].amount).toBe(758);
    expect(doc.lines[0].secondary).toContain('7,581.60');
    expect(doc.lines[0].secondary).toContain('6,823.60 still owing');
  });

  it('says settled in full when nothing is left', () => {
    const settled = { ...raw, applications: [{ ...raw.applications[0], invoiceBalance: '0.0000' }] };
    expect(paymentReceiptDocument(mapPayment(settled), company).lines[0].secondary).toContain('settled in full');
  });

  it('falls back when the server gives no invoice figures', () => {
    const bare = { ...raw, applications: [{ invoiceId: 'inv-52', invoiceNumber: 'INV-2026-0052', amountApplied: '758' }] };
    expect(paymentReceiptDocument(mapPayment(bare), company).lines[0].secondary).toBe('Applied to invoice');
  });
});

describe('billPaymentAdviceDocument', () => {
  const advice = {
    vendorName: 'Acme Supplies',
    paymentDate: '2026-09-28',
    total: 700,
    reference: 'CHQ-9',
    lines: [{ billId: 'b1', billNumber: 'BILL-1', applied: 700, remaining: 0 }],
  };

  it('a cash payment: total paid is the whole of it', () => {
    const doc = billPaymentAdviceDocument(advice, company);
    expect(doc.totals).toEqual([{ label: 'Total paid', value: 700, grand: true, tone: 'success' }]);
    expect(doc.share.amount).toBe(700);
  });

  it("part from the vendor's credit: the advice says so, and total paid is only the money sent", () => {
    const doc = billPaymentAdviceDocument({ ...advice, creditApplied: 150 }, company);
    expect(doc.totals.map((t) => [t.label, t.value])).toEqual([
      ['Bills settled', 700],
      ['Your credit applied', 150],
      ['Total paid', 550],
    ]);
    expect(doc.lines[0].amount).toBe(700);
    expect(doc.share).toMatchObject({ amount: 550, amountLabel: 'Amount paid' });
  });

  it('credit alone: nothing was sent, and the share says it was settled from their credit', () => {
    const doc = billPaymentAdviceDocument({ ...advice, total: 120, creditApplied: 120 }, company);
    expect(doc.totals.at(-1)).toMatchObject({ label: 'Total paid', value: 0 });
    expect(doc.share).toMatchObject({ amount: 120, amountLabel: 'Settled from your credit' });
  });
});
