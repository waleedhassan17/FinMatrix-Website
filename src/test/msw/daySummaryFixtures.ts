// A day as GET /reports/day-summary returns it (enveloped by the server).

// `total` may be a decimal string, as TypeORM sends it.
const kpi = (count: number, total: number | string, prev: number, week = 0) => ({
  count,
  total,
  previousDay: { count: prev ? 1 : 0, total: prev },
  sameDayLastWeek: { count: week ? 1 : 0, total: week },
  trend: [0, 100, 0, 200, 0, prev, Number(total)],
});

export const daySummaryOwner = {
  date: '2026-11-19',
  today: '2026-11-19',
  timezone: 'Asia/Karachi',
  currency: 'PKR',
  scope: { ownOnly: false, createdBy: null },
  kinds: ['invoice', 'sales_order', 'estimate', 'receipt', 'credit_memo', 'bill', 'purchase_order', 'vendor_payment', 'vendor_credit'],
  headline: {
    sales: kpi(12, '245000.0000', 200000, 245000),
    received: kpi(5, 180000, 0),
    orders: kpi(3, 70000, 70000),
    purchases: kpi(1, 40000, 0),
  },
  trendDates: ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'],
  documents: [
    { kind: 'invoice', count: 12, total: 245000 },
    { kind: 'sales_order', count: 3, total: 70000 },
    { kind: 'estimate', count: 0, total: 0 },
    { kind: 'receipt', count: 5, total: 180000 },
    { kind: 'credit_memo', count: 0, total: 0 },
    { kind: 'bill', count: 1, total: 40000 },
    { kind: 'purchase_order', count: 0, total: 0 },
    { kind: 'vendor_payment', count: 1, total: 25000 },
    { kind: 'vendor_credit', count: 0, total: 0 },
  ],
  sales: { subtotal: 250000, discount: 5000, tax: 0, total: 245000, unpaid: 65000 },
  cash: {
    methods: [
      { method: 'cash', received: 120000, paid: 0 },
      { method: 'bank_transfer', received: 60000, paid: 25000 },
    ],
    received: 180000,
    paid: 25000,
    net: 155000,
  },
  topCustomers: [{ id: 'c1', name: 'Ali Traders', count: 3, total: 90000 }],
  topItems: [{ itemId: 'i1', name: 'Basmati 5kg', quantity: 40, total: 60000 }],
  team: [
    {
      userId: 'u-owner',
      name: 'Owner One',
      invoices: { count: 8, total: 180000 },
      salesOrders: { count: 3, total: 70000 },
      estimates: { count: 0, total: 0 },
      receipts: { count: 5, total: 180000 },
      documents: 17,
    },
    {
      userId: 'u-staff',
      name: 'Sara Staff',
      invoices: { count: 4, total: 65000 },
      salesOrders: { count: 0, total: 0 },
      estimates: { count: 0, total: 0 },
      receipts: { count: 0, total: 0 },
      documents: 4,
    },
  ],
  members: [
    { id: 'u-owner', name: 'Owner One', role: 'admin' },
    { id: 'u-staff', name: 'Sara Staff', role: 'staff' },
  ],
  profit: { revenue: 245000, cogs: 150000, grossProfit: 95000, expenses: 10000, netIncome: 85000 },
  attention: { backdated: 2, drafts: 1, cancelledOrders: 0, voided: { count: 1, total: 5000 } },
  isEmpty: false,
  generatedAt: '2026-11-19T15:00:00.000Z',
};

export const daySummaryStaff = {
  ...daySummaryOwner,
  scope: { ownOnly: true, createdBy: { id: 'u-staff', name: 'Sara Staff' } },
  team: null,
  members: null,
  profit: null,
  attention: { backdated: 0, drafts: 0, cancelledOrders: 0, voided: null },
};

export const dayEntriesPage = {
  date: '2026-11-19',
  filter: 'all',
  items: [
    {
      kind: 'invoice',
      id: 'inv-1',
      number: 'INV-2026-0417',
      date: '2026-11-19',
      createdAt: '2026-11-19T10:15:00.000Z',
      partyId: 'c1',
      partyName: 'Ali Traders',
      amount: 900,
      status: 'sent',
      createdBy: { id: 'u-owner', name: 'Owner One' },
      backdated: false,
      counted: true,
      deleted: false,
    },
    {
      kind: 'receipt',
      id: 'rct-1',
      number: 'RCT-2026-0122',
      date: '2026-11-16',
      createdAt: '2026-11-19T09:00:00.000Z',
      partyId: 'c1',
      partyName: 'Ali Traders',
      amount: 400,
      status: null,
      createdBy: { id: 'u-staff', name: 'Sara Staff' },
      backdated: true,
      counted: true,
      deleted: false,
    },
  ],
  total: 2,
  page: 1,
  limit: 200,
};
