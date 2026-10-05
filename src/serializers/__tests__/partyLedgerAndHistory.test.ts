import { describe, expect, it } from 'vitest';

import { partyHistorySerializer } from '@/serializers/partyHistorySerializer';
import { ledgerPartiesSerializer, partyLedgerSerializer } from '@/serializers/reportSerializers';

describe('partyLedgerSerializer — the General Ledger read by customer', () => {
  const payload = {
    range: { startDate: '2026-01-01', endDate: '2026-10-05' },
    accountCode: null,
    party: { type: 'customer', id: 'c1', code: 'C-0007', name: 'Ali Traders' },
    entries: [
      {
        date: '2026-07-01', postedAt: '2026-07-01T10:00:00.000Z', reference: 'JE-12',
        accountCode: '1100', accountName: 'Accounts Receivable', memo: 'Invoice INV-1',
        debit: 3000000, credit: 0, balance: 3000000, voided: false,
        sourceType: 'journal_entry', sourceId: 'je-12', postingType: 'invoice', label: 'Invoice',
        documentType: 'invoice', documentId: 'i1', documentNumber: 'INV-1',
        partyId: 'c1', partyCode: 'C-0007', partyName: 'Ali Traders',
      },
      {
        date: '2026-07-05', postedAt: '2026-07-05T10:00:00.000Z', reference: 'JE-13',
        accountCode: '1100', accountName: 'Accounts Receivable', memo: '',
        debit: 0, credit: 3000000, balance: 0, voided: false,
        sourceType: 'journal_entry', sourceId: 'je-13', postingType: 'payment', label: 'Receipt',
        documentType: null, documentId: null, documentNumber: 'RCT-1',
        partyId: 'c1', partyCode: 'C-0007', partyName: 'Ali Traders',
      },
    ],
    openingBalances: [{ partyId: 'c1', partyCode: 'C-0007', partyName: 'Ali Traders', balance: 0 }],
    closingBalances: [{ partyId: 'c1', partyCode: 'C-0007', partyName: 'Ali Traders', balance: 0 }],
    totals: { debit: 3000000, credit: 3000000 },
    control: null,
  };

  it('keeps every line with its document and party', () => {
    const r = partyLedgerSerializer(payload);
    expect(r.party).toEqual({ type: 'customer', id: 'c1', code: 'C-0007', name: 'Ali Traders' });
    expect(r.entries.map((e) => [e.label, e.documentNumber, e.debit, e.credit, e.balance])).toEqual([
      ['Invoice', 'INV-1', 3000000, 0, 3000000],
      ['Receipt', 'RCT-1', 0, 3000000, 0],
    ]);
    expect(r.entries[0]).toMatchObject({ documentType: 'invoice', documentId: 'i1', partyCode: 'C-0007' });
    // A deleted receipt has no document to open.
    expect(r.entries[1]).toMatchObject({ documentType: null, documentId: null });
    expect(r.control).toBeNull();
  });

  it('reads the tie-out for every customer', () => {
    const r = partyLedgerSerializer({
      ...payload,
      party: { type: 'customer', id: null, code: null, name: null },
      control: { accounts: [{ code: '1100', name: 'Accounts Receivable' }], balance: 1000, linked: 900, unlinked: 100 },
    });
    expect(r.party.id).toBeNull();
    expect(r.control).toEqual({ accounts: [{ code: '1100', name: 'Accounts Receivable' }], balance: 1000, linked: 900, unlinked: 100 });
  });

  it('lists every party for the picker', () => {
    const r = ledgerPartiesSerializer({
      range: { startDate: '2026-01-01', endDate: '2026-10-05' },
      parties: [{ partyId: 'v1', partyCode: 'V-0003', partyName: 'Habib Oil', isActive: false, opening: '0', debit: 5, credit: 10, closing: -5, entries: 2 }],
    });
    expect(r.parties[0]).toEqual({ partyId: 'v1', partyCode: 'V-0003', partyName: 'Habib Oil', isActive: false, opening: 0, debit: 5, credit: 10, closing: -5, entries: 2 });
  });
});

describe('partyHistorySerializer', () => {
  it('reads a customer\'s history in one shape', () => {
    const h = partyHistorySerializer(
      {
        partyType: 'customer',
        party: { id: 'c1', code: 'C-0007', name: 'Ali Traders' },
        since: '2026-01-04',
        lastInvoice: { id: 'i9', number: 'INV-9', date: '2026-09-01', amount: 5000000 },
        lastPayment: { id: 'p3', number: 'RCT-3', date: '2026-09-07', amount: 6000000 },
        averageDaysToPay: { days: 21, count: 4 },
        fiscalYear: { year: 2026, startDate: '2026-01-01', endDate: '2026-12-31' },
        openingBalance: 0,
        months: [{ month: '2026-09', sales: 10000000, receipts: 6000000, balance: 4000000 }],
        totals: { sales: 10000000, receipts: 6000000 },
        closingBalance: 4000000,
        changes: [
          { id: 'a1', at: '2026-09-02T10:00:00Z', action: 'updated', user: { id: 'u1', name: 'Waleed' },
            fields: [{ field: 'creditLimit', from: '0.0000', to: '7500000' }] },
          { id: 'created-c1', at: '2026-01-04T00:00:00Z', action: 'created', user: null, fields: [] },
        ],
      },
      'customer',
    );
    expect(h.lastDocument).toEqual({ id: 'i9', number: 'INV-9', date: '2026-09-01', amount: 5000000 });
    expect(h.months[0]).toEqual({ month: '2026-09', charged: 10000000, settled: 6000000, balance: 4000000 });
    expect(h.totals).toEqual({ charged: 10000000, settled: 6000000 });
    expect(h.changes?.[0]).toMatchObject({ action: 'updated', user: 'Waleed', fields: [{ field: 'creditLimit', from: '0.0000', to: '7500000' }] });
    expect(h.changes?.[1]).toMatchObject({ action: 'created', user: null });
  });

  it('reads a vendor\'s in the same shape, and no log when it is not shown', () => {
    const h = partyHistorySerializer(
      {
        partyType: 'vendor',
        party: { id: 'v1', code: 'V-0003', name: 'Habib Oil' },
        lastBill: { id: 'b1', number: 'B-9', date: '2026-06-03', amount: 54000 },
        lastPayment: null,
        months: [{ month: '2026-06', purchases: 54000, payments: 0, balance: 54000 }],
        totals: { purchases: 54000, payments: 0 },
        changes: null,
      },
      'vendor',
    );
    expect(h.lastDocument?.number).toBe('B-9');
    expect(h.lastPayment).toBeNull();
    expect(h.months[0]).toMatchObject({ charged: 54000, settled: 0 });
    expect(h.changes).toBeNull();
  });
});
