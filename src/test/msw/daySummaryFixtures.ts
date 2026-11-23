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
  countedTotal: 1300,
  excludedTotal: 0,
  q: null,
  sort: 'newest',
  page: 1,
  limit: 25,
  pages: 1,
};

/**
 * A busy day's Day Book as the server pages it: `count` invoices, newest
 * first, answering `page`, `limit`, `q` and `sort` the way the API does.
 */
export const busyDayBook = (count: number) => (url: URL) => {
  const all = Array.from({ length: count }, (_, i) => ({
    ...dayEntriesPage.items[0],
    id: `inv-${i + 1}`,
    number: `INV-2026-${String(i + 1).padStart(4, '0')}`,
    amount: (i + 1) * 100,
    createdAt: new Date(Date.UTC(2026, 10, 19, 4, 0) + i * 60_000).toISOString(),
  })).reverse();
  const q = (url.searchParams.get('q') ?? '').toLowerCase();
  const sort = url.searchParams.get('sort') ?? 'newest';
  const limit = Number(url.searchParams.get('limit') ?? 25);
  const page = Number(url.searchParams.get('page') ?? 1);
  let rows = q ? all.filter((r) => r.number.toLowerCase().includes(q)) : all;
  if (sort === 'amount_desc') rows = [...rows].sort((a, b) => b.amount - a.amount);
  if (sort === 'amount_asc') rows = [...rows].sort((a, b) => a.amount - b.amount);
  if (sort === 'oldest') rows = [...rows].reverse();
  return {
    date: '2026-11-19',
    filter: url.searchParams.get('type') ?? 'all',
    q: q || null,
    sort,
    items: rows.slice((page - 1) * limit, page * limit),
    total: rows.length,
    countedTotal: rows.reduce((t, r) => t + r.amount, 0),
    excludedTotal: 0,
    page,
    limit,
    pages: Math.ceil(rows.length / limit),
  };
};

// ─── Item-wise sales (GET /reports/day-summary/items) ─────────────────────

const sheetRow = (over: Record<string, unknown>) => ({
  kind: 'item',
  itemId: 'i0',
  code: null,
  name: 'Item',
  unit: 'tin',
  category: null,
  agency: 'Nestle',
  sold: 0,
  free: 0,
  returned: 0,
  net: 0,
  value: 0,
  returnsValue: 0,
  cost: 0,
  profit: 0,
  margin: null,
  costMissing: false,
  compareValue: 0,
  ...over,
});

/** A distributor's day: two Nestle groups, a free tin, a return and a charge. */
export const dayItemSheetOwner = {
  from: '2026-11-19',
  to: '2026-11-19',
  today: '2026-11-19',
  currency: 'PKR',
  scope: { ownOnly: false, createdBy: null },
  compare: 'previous',
  compareFrom: '2026-11-18',
  compareTo: '2026-11-18',
  rows: [
    sheetRow({
      itemId: 'lac1',
      code: '001-006',
      name: 'Lactogen 1 400G',
      category: 'NESTLE POWDER',
      sold: 12,
      free: 1,
      returned: 2,
      net: 11,
      value: '15000.00',
      returnsValue: 3000,
      cost: 12100,
      profit: 2900,
      margin: 19.3,
      compareValue: 12000,
    }),
    sheetRow({
      itemId: 'bun9',
      code: '001-004',
      name: 'Bunyad 900G',
      category: 'Nestle Powder',
      sold: 3,
      net: 3,
      value: 5340,
      cost: 4500,
      profit: 840,
      margin: 15.7,
      compareValue: 0,
    }),
    sheetRow({
      itemId: 'mp1',
      code: '002-002',
      name: 'Milkpak 1000ML',
      category: 'MILK PACK',
      sold: 6,
      net: 6,
      value: 2160,
      cost: 1800,
      profit: 360,
      margin: 16.7,
      compareValue: 2500,
    }),
    sheetRow({
      itemId: 'x1',
      code: null,
      name: 'Loose Sundry',
      agency: null,
      sold: 4,
      net: 4,
      value: 360,
      cost: 200,
      profit: 160,
      margin: 44.4,
    }),
    sheetRow({
      kind: 'service',
      itemId: null,
      name: 'Delivery charge',
      unit: null,
      agency: null,
      sold: 1,
      net: 1,
      value: 250,
      cost: null,
      profit: null,
      margin: null,
    }),
  ],
  compareOnly: [
    { kind: 'item', itemId: 'cer', name: 'Cerelac Rice', category: 'NESTLE POWDER', agency: 'Nestle', compareValue: 900 },
  ],
  totals: {
    lines: 5,
    sold: 26,
    free: 1,
    returned: 2,
    net: 25,
    value: 23110,
    returnsValue: 3000,
    cost: 18600,
    profit: 4260,
    margin: 18.6,
    compareValue: 15400,
  },
  hasFree: true,
  showCost: true,
  reconciliation: { salesBeforeTax: 26110, returns: 3000, netSales: 23110, matches: true },
  reorder: [
    {
      itemId: 'lac1',
      code: '001-006',
      name: 'Lactogen 1 400G',
      unit: 'tin',
      onHand: 0,
      reorderPoint: 15,
      reorderQuantity: 24,
      outOfStock: true,
    },
    {
      itemId: 'mp1',
      code: '002-002',
      name: 'Milkpak 1000ML',
      unit: 'pack',
      onHand: 10,
      reorderPoint: 12,
      reorderQuantity: 48,
      outOfStock: false,
    },
  ],
  generatedAt: '2026-11-19T18:00:00.000Z',
};

/** The same day for staff: their own lines, no cost or profit. */
export const dayItemSheetStaff = {
  ...dayItemSheetOwner,
  scope: { ownOnly: true, createdBy: { id: 'u-staff', name: 'Sara' } },
  rows: dayItemSheetOwner.rows.slice(2, 3).map((r) => ({ ...r, cost: null, profit: null, margin: null })),
  compareOnly: [],
  totals: { ...dayItemSheetOwner.totals, lines: 1, value: 2160, cost: null, profit: null, margin: null },
  showCost: false,
  hasFree: false,
  reorder: [],
};
