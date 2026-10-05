// A customer's open items as the summary endpoint reports them: one invoice
// 45 days overdue, one part-paid and not yet due. Shared by the summary's
// model, builder and panel tests.

import type { AgingPartyDocument, PartySummary } from '@/serializers/reportSerializers';

export const summaryDoc = (n: number, daysOverdue: number, balance: number): AgingPartyDocument => ({
  documentId: `d${n}`,
  documentType: 'invoice',
  documentNumber: `INV-${n}`,
  issueDate: '2026-07-01',
  dueDate: '2026-08-14',
  daysOverdue,
  bucketKey: daysOverdue > 0 ? 'd31to60' : 'current',
  bucketLabel: daysOverdue > 0 ? '31–60' : 'Current',
  total: balance,
  amountPaid: 0,
  balance,
  status: 'sent',
});

export const summaryFixture = (over: Partial<PartySummary> = {}): PartySummary => ({
  partyType: 'customer',
  party: {
    code: 'C-0007',
    id: 'c1',
    name: 'Acme Traders',
    contactPerson: '',
    email: 'accounts@acme.pk',
    phone: '0300 1234567',
    address: '12 Mall Road, Lahore',
    paymentTerms: 'net30',
    taxId: '',
  },
  asOfDate: '2026-09-28',
  preset: 'monthly',
  buckets: [
    { key: 'current', label: 'Current', minDays: 0, maxDays: 0, amount: 300, count: 1 },
    { key: 'd1to30', label: '1–30', minDays: 1, maxDays: 30, amount: 0, count: 0 },
    { key: 'd31to60', label: '31–60', minDays: 31, maxDays: 60, amount: 1000, count: 1 },
  ],
  documents: [summaryDoc(1, 45, 1000), { ...summaryDoc(2, -20, 300), total: 500, amountPaid: 200 }],
  totals: { count: 2, outstanding: 1300, overdue: 1000, overdueCount: 1, notYetDue: 300 },
  credits: { total: 0, items: [] },
  netDue: 1300,
  lastPayment: null,
  ...over,
});
