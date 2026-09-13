import { describe, expect, it, vi } from 'vitest';

// The browser build embeds Roboto from Vite asset URLs, which Node cannot fetch.
// The layout, not the typeface, is what is under test here.
vi.mock('@/features/pdf/fonts', () => ({
  PDF_FONT_FAMILY: 'Helvetica',
  registerPdfFonts: () => undefined,
}));

import { renderToBuffer } from '@react-pdf/renderer';

import { invoiceDocument, purchaseOrderDocument } from '@/features/documents/documentBuilders';
import { companyForDocument } from '@/features/documents/documentModel';
import { TransactionPdf } from '@/features/pdf/TransactionPdf';
import type { Invoice } from '@/models/invoice';
import type { PurchaseOrder } from '@/models/purchaseOrder';

const company = companyForDocument(null, 'Warehouse Co');

const manyLines = Array.from({ length: 60 }, (_, i) => ({
  id: `l${i}`,
  itemId: '',
  itemName: `Item ${i + 1}`,
  description: `Item ${i + 1}`,
  quantity: i + 1,
  unitPrice: 100,
  taxRate: 17,
  amount: (i + 1) * 100,
}));

describe('TransactionPdf', () => {
  it('renders an invoice to a real PDF', async () => {
    const invoice = {
      invoiceNumber: 'INV-2026-0047',
      customerName: 'Faisal Traders',
      issueDate: '2026-09-10',
      dueDate: '2026-10-10',
      status: 'draft',
      lines: manyLines.slice(0, 3),
      subtotal: 600,
      taxAmount: 102,
      discountType: 'none',
      discountValue: 0,
      discountAmount: 0,
      total: 702,
      amountPaid: 0,
      balance: 702,
      notes: 'Thank you.',
    } as unknown as Invoice;

    const buffer = await renderToBuffer(
      <TransactionPdf doc={invoiceDocument(invoice, company, null)} generatedAt="Sep 13, 2026" />,
    );
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('flows a long purchase order onto more pages', async () => {
    const po = {
      poNumber: 'PO-2026-0003',
      vendorName: 'Pak Dairy',
      orderDate: '2026-09-02',
      expectedDate: '2026-09-09',
      status: 'sent',
      lines: manyLines,
      subtotal: 183000,
      taxAmount: 31110,
      total: 214110,
      notes: '',
    } as unknown as PurchaseOrder;

    const buffer = await renderToBuffer(
      <TransactionPdf doc={purchaseOrderDocument(po, company, null)} generatedAt="Sep 13, 2026" />,
    );
    const pages = buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages.length).toBeGreaterThan(1);
  });
});
