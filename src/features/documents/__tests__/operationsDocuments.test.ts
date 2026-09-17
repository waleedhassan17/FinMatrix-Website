import { describe, expect, it } from 'vitest';

import { companyForDocument, docDate } from '@/features/documents/documentModel';
import {
  budgetVsActualDocument,
  deliveryNoteDocument,
  payslipShare,
  reconciliationDocument,
} from '@/features/documents/operationsDocuments';
import { pdfFilename, shareText } from '@/features/share/shareDocument';
import type { Budget, VsActualRow } from '@/models/budget';
import type { Delivery } from '@/models/delivery';
import type { PayrollRun } from '@/models/payroll';
import type { ReconEntry, ReconciliationDetail } from '@/models/reconciliation';

const company = companyForDocument(null, 'Warehouse Co');

describe('deliveryNoteDocument', () => {
  const delivery: Delivery = {
    id: 'd1',
    referenceNo: 'DLV-0007',
    customerId: 'c1',
    customerName: 'Madina Wholesale',
    zone: 'North',
    address: '12 Mall Road\nLahore',
    destLat: null,
    destLng: null,
    personnelId: 'r1',
    status: 'in_transit',
    priority: 'normal',
    preferredDate: '2026-09-15',
    preferredTimeSlot: 'Morning',
    assignedAt: '',
    completedAt: '',
    notes: 'Call before arriving',
    cancelReason: '',
    paidStatus: null,
    prepaid: false,
    advanceAmount: 0,
    advancePaymentId: null,
    amountCollected: null,
    salesOrderId: null,
    invoiceId: null,
    ledgerStatus: 'in_transit',
    createdAt: '2026-09-13T08:00:00.000Z',
    lines: [
      { id: 'l1', itemId: 'i1', itemName: 'Rice 5kg', orderedQty: 10, deliveredQty: 8, returnedQty: 2, unitPrice: 900, taxRate: 0 },
      { id: 'l2', itemId: 'i2', itemName: 'Oil 1L', orderedQty: 4, deliveredQty: 4, returnedQty: 0, unitPrice: 600, taxRate: 0 },
    ],
  };
  const note = deliveryNoteDocument(delivery, company, 'Ali (bike)');

  it('lists quantities only, with a total row, and never a price', () => {
    const section = note.pdf.sections[0];
    expect(section.columns.map((c) => c.header)).toEqual(['#', 'Item', 'Ordered', 'Delivered', 'Returned']);
    expect(section.rows[0].cells).toEqual(['1', 'Rice 5kg', '10', '8', '2']);
    expect(section.rows.at(-1)).toMatchObject({ cells: ['', 'Total units', '14', '12', '2'], total: true });
    expect(JSON.stringify(note.pdf)).not.toContain('900');
  });

  it('addresses the customer and leaves room to sign', () => {
    expect(note.pdf.party).toMatchObject({ label: 'Deliver to', name: 'Madina Wholesale', lines: ['12 Mall Road', 'Lahore', 'Zone North'] });
    expect(note.pdf.meta?.find((m) => m.label === 'Rider')?.value).toBe('Ali (bike)');
    expect(note.pdf.meta?.find((m) => m.label === 'Wanted')?.value).toBe(`${docDate('2026-09-15')} · Morning`);
    expect(note.pdf.notes).toEqual([{ title: 'Delivery instructions', text: 'Call before arriving' }]);
    expect(note.pdf.signatures).toHaveLength(2);
    expect(pdfFilename(note.share)).toBe('DLV-0007 - Madina Wholesale.pdf');
  });
});

describe('budgetVsActualDocument', () => {
  const row = (over: Partial<VsActualRow>): VsActualRow => ({
    accountId: 'a',
    accountCode: '4000',
    accountName: 'Sales',
    accountType: 'revenue',
    budgeted: 0,
    actual: 0,
    variance: 0,
    percentUsed: 0,
    months: [],
    ...over,
  });
  const budget: Budget = { id: 'b1', name: 'FY26 plan', fiscalYear: 2026, status: 'active', totalBudget: 1500, createdAt: '', lines: [] };
  const rows = [
    row({ accountId: 'r', budgeted: 1000, actual: 1200, percentUsed: 120 }),
    row({ accountId: 'e', accountCode: '6000', accountName: 'Rent', accountType: 'expense', budgeted: 500, actual: 600, percentUsed: 120 }),
  ];
  const doc = budgetVsActualDocument(budget, rows, company);

  it('keeps revenue and spending apart, with variance signed so positive is good', () => {
    expect(doc.pdf.sections.map((s) => s.title)).toEqual(['Revenue', 'Spending']);
    expect(doc.pdf.sections[0].rows[0].cells).toEqual(['4000 · Sales', 1000, 1200, 200, '120%']);
    expect(doc.pdf.sections[1].rows[0].cells[3]).toBe(-100);
    expect(doc.pdf.sections[1].rows.at(-1)).toMatchObject({ cells: ['Total spending', 500, 600, -100, '120.0%'], total: true });
  });

  it('leaves out a side with no accounts', () => {
    expect(budgetVsActualDocument(budget, [rows[1]], company).pdf.sections.map((s) => s.title)).toEqual(['Spending']);
  });
});

describe('reconciliationDocument', () => {
  const entry = (id: string, amount: number): ReconEntry => ({
    id, date: '2026-08-30', reference: `REF-${id}`, memo: '', sourceType: 'payment', sourceId: id,
    debit: Math.max(amount, 0), credit: Math.max(-amount, 0), amount, cleared: true,
  });
  const recon: ReconciliationDetail = {
    id: 'rc1', accountId: 'a1', statementDate: '2026-08-31', statementEndingBalance: 900, beginningBalance: 1000,
    clearedBalance: 900, difference: 0, clearedCount: 2, status: 'completed', notes: '', createdBy: 'u1',
    reconciledAt: '2026-09-01T10:00:00.000Z', createdAt: '',
    entries: [{ ...entry('1', 400), memo: 'Opening cash balance' }, entry('2', -500)],
    outstanding: [],
    outstandingTotal: 0,
  };
  const doc = reconciliationDocument(recon, '1010 · Meezan Bank', company);

  it('splits deposits from payments and says when nothing is outstanding', () => {
    expect(doc.pdf.sections[0].rows.map((r) => r.cells.slice(3))).toEqual([[400, null], [null, 500]]);
    expect(doc.pdf.sections[0].rows.map((r) => r.cells[1])).toEqual(['REF-1 · Opening cash balance', 'REF-2']);
    expect(doc.pdf.sections[1].rows[0].cells[1]).toBe('No outstanding items.');
    expect(doc.pdf.sections[1].rows.at(-1)).toMatchObject({ cells: ['', 'Net outstanding', '', 0, null], total: true });
    expect(doc.pdf.basis).toBe('1010 · Meezan Bank');
    expect(doc.pdf.notes).toBeUndefined();
  });
});

describe('payslipShare', () => {
  it('names the employee and the period', () => {
    const run = { payPeriod: 'August 2026' } as PayrollRun;
    const share = payslipShare(run, { id: 'p', employeeId: 'e', employeeName: 'Sara Khan', hours: 0, gross: 100, deductions: 10, net: 90 }, 'Warehouse Co');
    expect(pdfFilename(share)).toBe('Payslip - Sara Khan - August 2026.pdf');
    expect(shareText(share)).toContain('Please find the Payslip for August 2026 attached.');
  });
});
