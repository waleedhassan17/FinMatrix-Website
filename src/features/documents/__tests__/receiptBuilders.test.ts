import { describe, expect, it } from 'vitest';

import { companyForDocument } from '@/features/documents/documentModel';
import { paymentReceiptDocument } from '@/features/documents/receiptBuilders';
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
