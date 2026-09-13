import { describe, expect, it } from 'vitest';

import { companyForDocument, docDate } from '@/features/documents/documentModel';
import {
  customerStatementDocument,
  statementPeriodLabel,
  vendorStatementDocument,
} from '@/features/documents/statementBuilders';
import type { CustomerStatement } from '@/serializers/customerSerializer';
import type { VendorStatement } from '@/serializers/vendorSerializer';
import { formatMoney } from '@/utils/money';

const company = companyForDocument(null, 'Warehouse Co');
const range = { startDate: '2026-01-01', endDate: '2026-09-13' };

describe('customerStatementDocument', () => {
  const statement: CustomerStatement = {
    customer: { id: 'c1', name: 'Madina Wholesale', email: 'cust4@example.com' },
    period: { startDate: '', endDate: '' },
    openingBalance: 500,
    lines: [
      { id: 'i1', date: '2026-02-01', kind: 'invoice', reference: 'INV-1', amount: 1200, runningBalance: 1700 },
      { id: 'p1', date: '2026-02-10', kind: 'payment', reference: 'PAY-1', amount: -700, runningBalance: 1000 },
    ],
    totals: { invoiced: 1200, received: 700 },
    closingBalance: 1000,
  };
  const doc = customerStatementDocument(statement, company, null, range);

  it('falls back to the chosen range when the server sends no period', () => {
    expect(doc.pdf.periodLabel).toBe(statementPeriodLabel('2026-01-01', '2026-09-13'));
    expect(doc.pdf.periodLabel).toBe(`${docDate('2026-01-01')} – ${docDate('2026-09-13')}`);
  });

  it('opens and closes the ledger around the dated lines', () => {
    const rows = doc.pdf.sections[0].rows;
    expect(rows[0]).toMatchObject({ cells: [docDate('2026-01-01'), 'Opening balance', '', null, 500], bold: true });
    expect(rows[1].cells).toEqual([docDate('2026-02-01'), 'INV-1', 'Invoice', 1200, 1700]);
    expect(rows[2].cells).toEqual([docDate('2026-02-10'), 'PAY-1', 'Payment', -700, 1000]);
    expect(rows.at(-1)).toMatchObject({ cells: [docDate('2026-09-13'), 'Balance due', '', null, 1000], grand: true });
  });

  it('summarises the period and shares the balance with the customer', () => {
    expect(doc.pdf.meta?.map((m) => m.label)).toEqual(['Period', 'Opening balance', 'Invoiced', 'Received', 'Balance due']);
    expect(doc.pdf.party?.name).toBe('Madina Wholesale');
    expect(doc.share).toMatchObject({
      kind: 'Statement',
      partyName: 'Madina Wholesale',
      amount: 1000,
      amountLabel: 'Balance due',
      companyName: 'Warehouse Co',
    });
    expect(doc.pdf.meta?.at(-1)?.value).toBe(formatMoney(1000));
  });
});

describe('vendorStatementDocument', () => {
  it('speaks of bills and what is owed', () => {
    const statement: VendorStatement = {
      vendor: { id: 'v1', name: 'Habib Oil Mills', email: '' },
      period: { startDate: '2026-03-01', endDate: '2026-03-31' },
      openingBalance: 0,
      lines: [{ id: 'b1', date: '2026-03-02', kind: 'bill', reference: 'B-9', amount: 5000, runningBalance: 5000 }],
      totals: { billed: 5000, paid: 0 },
      closingBalance: 5000,
    };
    const doc = vendorStatementDocument(statement, company, null, range);
    expect(doc.pdf.periodLabel).toBe(statementPeriodLabel('2026-03-01', '2026-03-31'));
    expect(doc.pdf.sections[0].rows[1].cells[2]).toBe('Bill');
    expect(doc.share.amountLabel).toBe('Balance owed');
    expect(doc.pdf.meta?.map((m) => m.label)).toContain('Billed');
  });
});
