import { describe, expect, it } from 'vitest';

import { companyForDocument, docDate } from '@/features/documents/documentModel';
import {
  customerStatementDocument,
  customerSummaryDocument,
  statementPeriodLabel,
  vendorStatementDocument,
  vendorSummaryDocument,
} from '@/features/documents/statementBuilders';
import { pdfFilename, shareText } from '@/features/share/shareDocument';
import type { Customer } from '@/models/customer';
import type { CustomerStatement } from '@/serializers/customerSerializer';
import type { VendorStatement } from '@/serializers/vendorSerializer';
import { formatMoney } from '@/utils/money';
import { summaryFixture } from '@/test/partySummaryFixture';

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
    totals: { invoiced: 1200, received: 700, credited: 0, refunded: 0 },
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
      totals: { billed: 5000, paid: 0, credited: 0 },
      closingBalance: 5000,
    };
    const doc = vendorStatementDocument(statement, company, null, range);
    expect(doc.pdf.periodLabel).toBe(statementPeriodLabel('2026-03-01', '2026-03-31'));
    expect(doc.pdf.sections[0].rows[1].cells[2]).toBe('Bill');
    expect(doc.share.amountLabel).toBe('Balance owed');
    expect(doc.pdf.meta?.map((m) => m.label)).toContain('Billed');
    // Nothing credited: no line for it on the vendor's copy.
    expect(doc.pdf.meta?.map((m) => m.label)).not.toContain('Credited');
  });

  it('names a vendor credit, and totals it', () => {
    const statement: VendorStatement = {
      vendor: { id: 'v1', name: 'Habib Oil Mills', email: '' },
      period: { startDate: '2026-03-01', endDate: '2026-03-31' },
      openingBalance: 0,
      lines: [
        { id: 'b1', date: '2026-03-02', kind: 'bill', reference: 'B-9', amount: 5000, runningBalance: 5000 },
        { id: 'c1', date: '2026-03-09', kind: 'vendor_credit', reference: 'VC-3', amount: -800, runningBalance: 4200 },
      ],
      totals: { billed: 5000, paid: 0, credited: 800 },
      closingBalance: 4200,
    };
    const doc = vendorStatementDocument(statement, company, null, range);
    expect(doc.pdf.sections[0].rows[2].cells).toEqual([docDate('2026-03-09'), 'VC-3', 'Vendor credit', -800, 4200]);
    expect(doc.pdf.meta).toContainEqual({ label: 'Credited', value: formatMoney(800) });
  });
});

describe('customerStatementDocument — credits and refunds', () => {
  it('names credit memos and their refunds, and totals both', () => {
    const statement: CustomerStatement = {
      customer: { id: 'c1', name: 'Madina Wholesale', email: '' },
      period: { startDate: '2026-02-01', endDate: '2026-02-28' },
      openingBalance: 0,
      lines: [
        { id: 'i1', date: '2026-02-01', kind: 'invoice', reference: 'INV-1', amount: 1200, runningBalance: 1200 },
        { id: 'm1', date: '2026-02-05', kind: 'credit_memo', reference: 'CM-1', amount: -200, runningBalance: 1000 },
        { id: 'r1', date: '2026-02-06', kind: 'refund', reference: 'CM-1', amount: 50, runningBalance: 1050 },
      ],
      totals: { invoiced: 1200, received: 0, credited: 200, refunded: 50 },
      closingBalance: 1050,
    };
    const doc = customerStatementDocument(statement, company, null, range);
    const kinds = doc.pdf.sections[0].rows.slice(1, -1).map((r) => r.cells[2]);
    expect(kinds).toEqual(['Invoice', 'Credit memo', 'Refund']);
    expect(doc.pdf.meta?.map((m) => m.label)).toEqual([
      'Period', 'Opening balance', 'Invoiced', 'Received', 'Credited', 'Refunded', 'Balance due',
    ]);
  });
});

// ═══════════════════════════════════════════════════════
// Outstanding invoices / payables summary
// ═══════════════════════════════════════════════════════

describe('customerSummaryDocument', () => {
  const summary = summaryFixture();
  const doc = customerSummaryDocument(summary, company, null);
  const [documents, aging] = doc.pdf.sections;

  it('is titled for the customer, as of the day it was made', () => {
    expect(doc.pdf.title).toBe('Outstanding invoices');
    expect(doc.pdf.periodLabel).toBe(`As of ${docDate('2026-09-28')}`);
    expect(doc.pdf.party).toMatchObject({ label: 'Prepared for', name: 'Acme Traders' });
    // The one-line address from the summary, when the full record is not to hand.
    expect(doc.pdf.party?.lines).toContain('12 Mall Road, Lahore');
  });

  it('lists every unpaid invoice with how late it is, and foots the balance column', () => {
    expect(documents.title).toBe('Unpaid invoices');
    expect(documents.columns.map((c) => c.header)).toEqual([
      'Invoice', 'Date', 'Due', 'Status', 'Amount', 'Paid', 'Balance',
    ]);
    expect(documents.rows[0].cells).toEqual([
      'INV-1', docDate('2026-07-01'), docDate('2026-08-14'), '45 days overdue', 1000, '—', 1000,
    ]);
    expect(documents.rows[1].cells[3]).toBe('Due in 20 days');
    expect(documents.rows.at(-1)).toMatchObject({
      cells: ['Total', '', '', '2 invoices', 1500, 200, 1300],
      total: true,
    });
  });

  it('prints the aging strip with the buckets the report uses', () => {
    expect(aging.columns.map((c) => c.header)).toEqual(['Current', '1–30', '31–60', 'Total']);
    expect(aging.rows[0].cells).toEqual([300, '—', 1000, 1300]);
  });

  it('asks for the total due, with terms, overdue and no credits section', () => {
    expect(doc.pdf.sections).toHaveLength(2);
    expect(doc.pdf.totals).toEqual([{ label: 'Total due', value: 1300, grand: true }]);
    expect(doc.pdf.totalsAfter).toBe(0);
    expect(doc.pdf.meta).toEqual([
      { label: 'As of', value: docDate('2026-09-28') },
      { label: 'Payment terms', value: 'Net 30' },
      { label: 'Total due', value: formatMoney(1300) },
      { label: 'Overdue (1 invoice)', value: formatMoney(1000) },
    ]);
  });

  it('shares a message that stands on its own, under a filename that says what it is', () => {
    expect(doc.share).toMatchObject({
      kind: 'Outstanding invoices',
      partyName: 'Acme Traders',
      partyPhone: '0300 1234567',
      partyEmail: 'accounts@acme.pk',
      amount: 1300,
      amountLabel: 'Total due',
      companyName: 'Warehouse Co',
    });
    expect(pdfFilename(doc.share)).toBe(`Outstanding invoices - Acme Traders - ${docDate('2026-09-28')}.pdf`);
    const text = shareText(doc.share);
    expect(text.startsWith('Dear Acme Traders,\n\nHere is a summary of your unpaid invoices with Warehouse Co')).toBe(true);
    expect(text).toContain('INV-1 · due');
    expect(text).toContain('Total due: Rs 1,300.00');
    expect(text.endsWith('Regards,\nWarehouse Co')).toBe(true);
  });

  it('takes the address and terms from the customer record when it has one', () => {
    const customer = {
      name: 'Acme Traders',
      company: '',
      contactPerson: 'Bilal',
      email: 'accounts@acme.pk',
      phone: '0300 1234567',
      billingAddress: { street: '12 Mall Road', city: 'Lahore', state: '', zipCode: '54000', country: 'Pakistan' },
      taxId: '',
      paymentTerms: 'net_15',
    } as unknown as Customer;
    const withRecord = customerSummaryDocument(summary, company, customer);
    expect(withRecord.pdf.party?.lines[0]).toBe('Attn: Bilal');
    expect(withRecord.pdf.meta?.find((m) => m.label === 'Payment terms')?.value).toBe('Net 15');
  });

  it('nets unapplied credits off, lists them, and puts the totals after them', () => {
    const withCredits = customerSummaryDocument(
      summaryFixture({
        credits: {
          total: 400,
          items: [
            { kind: 'credit_memo', id: 'm1', reference: 'CM-7', date: '2026-08-20', amount: 150, available: 150 },
            { kind: 'payment', id: 'p1', reference: 'RCT-9', date: '2026-09-01', amount: 500, available: 250 },
          ],
        },
        netDue: 900,
        lastPayment: { date: '2026-09-01', amount: 500, reference: 'RCT-9' },
      }),
      company,
      null,
    );
    const [, credits, agingAfter] = withCredits.pdf.sections;
    expect(credits.title).toBe('Unapplied credits');
    expect(credits.rows[1].cells).toEqual(['RCT-9', docDate('2026-09-01'), 'Unapplied payment', 500, 250]);
    expect(credits.rows.at(-1)).toMatchObject({ cells: ['Total', '', '', null, 400], total: true });
    expect(agingAfter.title).toBe('Aging · days overdue');
    expect(withCredits.pdf.totalsAfter).toBe(1);
    expect(withCredits.pdf.totals).toEqual([
      { label: 'Total outstanding', value: 1300 },
      { label: 'Less credits', value: 400, prefix: '− ' },
      { label: 'Total due', value: 900, grand: true },
    ]);
    expect(withCredits.share.amount).toBe(900);
    expect(withCredits.pdf.meta?.at(-1)).toEqual({
      label: 'Last payment received',
      value: `${formatMoney(500)} · ${docDate('2026-09-01')}`,
    });
  });

  it('says so plainly when nothing is unpaid', () => {
    const empty = customerSummaryDocument(summaryFixture({ documents: [], buckets: [] }), company, null);
    expect(empty.pdf.sections).toHaveLength(1);
    expect(empty.pdf.sections[0].rows).toEqual([{ cells: ['No unpaid invoices', '', '', '', null, null, null] }]);
  });
});

describe('vendorSummaryDocument', () => {
  it('speaks of bills and of what is payable, to whom', () => {
    const doc = vendorSummaryDocument(
      summaryFixture({
        partyType: 'vendor',
        documents: summaryFixture().documents.map((d) => ({
          ...d,
          documentType: 'bill' as const,
          total: d.balance,
          amountPaid: 0,
        })),
        totals: { count: 2, outstanding: 1300, overdue: 1000, overdueCount: 1, notYetDue: 300 },
      }),
      company,
      null,
    );
    expect(doc.pdf.title).toBe('Payables summary');
    expect(doc.pdf.party?.label).toBe('Payable to');
    expect(doc.pdf.sections[0].title).toBe('Unpaid bills');
    expect(doc.pdf.sections[0].columns[0].header).toBe('Bill');
    expect(doc.pdf.sections[0].rows.at(-1)?.cells[3]).toBe('2 bills');
    // Nothing paid on any of them: the total says so the way each row does.
    expect(doc.pdf.sections[0].rows.at(-1)?.cells[5]).toBe('—');
    expect(doc.pdf.totals).toEqual([{ label: 'Total payable', value: 1300, grand: true }]);
    expect(doc.share.kind).toBe('Payables summary');
    expect(shareText(doc.share)).toContain('the bills we have open with you');
  });
});
