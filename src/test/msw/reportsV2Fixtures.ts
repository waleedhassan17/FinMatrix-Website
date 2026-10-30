// ═══════════════════════════════════════════════════════
// FinMatrix Web — Reports v2 fixtures (raw API payloads)
// ═══════════════════════════════════════════════════════
// What the backend sends, in the shapes FinMatrix-Backend's reports v2
// implementation returns (reports.types.ts, reports-kpi.service.ts) — raw,
// before any serializer — so the tests that use them exercise network →
// serializer → model → page exactly as production does.
//
// Every figure foots: sections add to their subtotals, A = L + E, the trial
// balance balances, cash-flow sections sum to the net change, a register's
// opening plus its movement is its closing. The page tests assert the rendered
// totals against these, so a fixture that did not foot would test nothing.
//
// Amounts are deliberately sent as strings in places: Postgres `numeric`
// arrives that way when a query forgets to unwrap it, and the serializers must
// survive it.

export const AS_OF = '2026-09-30';
export const FY_START = '2026-01-01';
export const PRIOR_MONTH_END = '2026-08-31';

const line = (
  accountCode: string,
  accountName: string,
  subType: string,
  amount: number,
  priorAmount: number,
  pctOfTotalAssets: number,
) => ({
  accountCode,
  accountName,
  subType,
  amount,
  priorAmount,
  change: amount - priorAmount,
  changePct: priorAmount ? Math.round(((amount - priorAmount) / Math.abs(priorAmount)) * 1000) / 10 : null,
  pctOfTotalAssets,
});

/** The balance sheet at AS_OF, compared with PRIOR_MONTH_END. */
export const balanceSheetV2 = {
  asOfDate: AS_OF,
  fiscalYearStart: FY_START,
  assets: [
    { accountCode: '1000', accountName: 'Cash', amount: 300000 },
    { accountCode: '1010', accountName: 'Meezan Bank', amount: 200000 },
    { accountCode: '1100', accountName: 'Accounts Receivable', amount: 400000 },
    { accountCode: '1200', accountName: 'Inventory', amount: 300000 },
    { accountCode: '1500', accountName: 'Equipment', amount: 300000 },
  ],
  liabilities: [
    { accountCode: '2000', accountName: 'Accounts Payable', amount: 250000 },
    { accountCode: '2300', accountName: 'Sales Tax Payable', amount: 50000 },
    { accountCode: '2700', accountName: 'Bank Loan', amount: 100000 },
  ],
  equity: [
    { accountCode: '3000', accountName: "Owner's Capital", amount: 600000 },
    { accountCode: '3100', accountName: 'Retained Earnings', amount: 300000 },
    { accountCode: '', accountName: 'Net Income (current fiscal year)', amount: 200000 },
  ],
  totalAssets: '1500000.0000',
  totalLiabilities: 400000,
  totalEquity: 1100000,
  isBalanced: true,
  sections: [
    {
      key: 'cashAndBank',
      label: 'Cash and Bank',
      lines: [line('1000', 'Cash', 'Cash', 300000, 250000, 20), line('1010', 'Meezan Bank', 'Bank', 200000, 150000, 13.3)],
      subtotal: 500000,
      priorSubtotal: 400000,
      change: 100000,
      changePct: 25.0,
      subtotalPctOfTotalAssets: 33.3,
    },
    {
      key: 'receivables',
      label: 'Accounts Receivable',
      lines: [line('1100', 'Accounts Receivable', 'Accounts Receivable', 400000, 380000, 26.7)],
      subtotal: 400000,
      priorSubtotal: 380000,
      change: 20000,
      changePct: 5.3,
      subtotalPctOfTotalAssets: 26.7,
    },
    {
      key: 'inventory',
      label: 'Inventory',
      lines: [line('1200', 'Inventory', 'Inventory', 300000, 320000, 20)],
      subtotal: 300000,
      priorSubtotal: 320000,
      change: -20000,
      changePct: -6.2,
      subtotalPctOfTotalAssets: 20,
    },
    {
      key: 'fixedAssets',
      label: 'Fixed Assets',
      lines: [line('1500', 'Equipment', 'Fixed Asset', 300000, 300000, 20)],
      subtotal: 300000,
      priorSubtotal: 300000,
      change: 0,
      changePct: 0.0,
      subtotalPctOfTotalAssets: 20,
    },
    {
      key: 'currentLiabilities',
      label: 'Current Liabilities',
      lines: [
        line('2000', 'Accounts Payable', 'Accounts Payable', 250000, 240000, 16.7),
        line('2300', 'Sales Tax Payable', 'Tax Payable', 50000, 40000, 3.3),
      ],
      subtotal: 300000,
      priorSubtotal: 280000,
      change: 20000,
      changePct: 7.1,
      subtotalPctOfTotalAssets: 20,
    },
    {
      key: 'longTermLiabilities',
      label: 'Long-term Liabilities',
      lines: [line('2700', 'Bank Loan', 'Notes Payable', 100000, 120000, 6.7)],
      subtotal: 100000,
      priorSubtotal: 120000,
      change: -20000,
      changePct: -16.7,
      subtotalPctOfTotalAssets: 6.7,
    },
    {
      key: 'equity',
      label: 'Equity',
      lines: [
        line('3000', "Owner's Capital", 'Owner Equity', 600000, 600000, 40),
        {
          ...line('3100', 'Retained Earnings', 'Retained Earnings', 300000, 300000, 20),
          composite: { postedBalance: 50000, priorYearsEarnings: 250000 },
        },
        {
          ...line('', 'Net Income (current fiscal year)', '', 200000, 100000, 13.3),
          synthetic: 'currentYearEarnings',
        },
      ],
      subtotal: 1100000,
      priorSubtotal: 1000000,
      change: 100000,
      changePct: 10.0,
      subtotalPctOfTotalAssets: 73.3,
    },
  ],
  subtotals: [
    { key: 'totalCurrentAssets', label: 'Total Current Assets', amount: 1200000, priorAmount: 1100000, change: 100000, changePct: 9.1, pctOfTotalAssets: 80 },
    { key: 'totalAssets', label: 'TOTAL ASSETS', amount: 1500000, priorAmount: 1400000, change: 100000, changePct: 7.1, pctOfTotalAssets: 100 },
    { key: 'totalCurrentLiabilities', label: 'Total Current Liabilities', amount: 300000, priorAmount: 280000, change: 20000, changePct: 7.1, pctOfTotalAssets: 20 },
    { key: 'totalLiabilities', label: 'Total Liabilities', amount: 400000, priorAmount: 400000, change: 0, changePct: 0, pctOfTotalAssets: 26.7 },
    { key: 'totalEquity', label: 'Total Equity', amount: 1100000, priorAmount: 1000000, change: 100000, changePct: 10, pctOfTotalAssets: 73.3 },
    { key: 'totalLiabilitiesAndEquity', label: 'TOTAL LIABILITIES AND EQUITY', amount: 1500000, priorAmount: 1400000, change: 100000, changePct: 7.1, pctOfTotalAssets: 100 },
  ],
  totalLiabilitiesAndEquity: 1500000,
  gap: 0,
  comparison: { asOfDate: PRIOR_MONTH_END, totalAssets: 1400000, totalLiabilities: 400000, totalEquity: 1000000 },
};

/** The server's verdict on a figure (kpi-benchmarks.ts), as the contract sends it. */
export const assessment = (level: 'healthy' | 'watch' | 'risk' | 'neutral', guide = `${level} guide.`) => ({ level, guide });

const kpi = (
  key: string,
  label: string,
  value: number | null,
  unit: string,
  formula: string,
  inputs: Record<string, number>,
  status: string | null = null,
  verdict: ReturnType<typeof assessment> = assessment('healthy'),
) => ({
  key,
  label,
  value,
  unit,
  formula,
  inputs,
  asOfDate: AS_OF,
  status: status ?? (value === null ? 'no_denominator' : 'ok'),
  assessment: verdict,
});

export const financialHealthV2 = {
  asOfDate: AS_OF,
  kpis: [
    kpi('workingCapital', 'Working capital', 900000, 'money', 'Current assets − Current liabilities', {
      currentAssets: 1200000,
      currentLiabilities: 300000,
    }),
    kpi(
      'currentRatio',
      'Current ratio',
      4,
      'ratio',
      'Current assets ÷ Current liabilities',
      { currentAssets: 1200000, currentLiabilities: 300000 },
      null,
      assessment('healthy', 'Above 1.5× is generally comfortable; below 1×, current debts exceed current assets.'),
    ),
    kpi('quickRatio', 'Quick ratio', 3, 'ratio', '(Cash and bank + Receivables) ÷ Current liabilities', {
      cashAndBank: 500000,
      receivables: 400000,
      currentLiabilities: 300000,
    }),
    kpi('debtToEquity', 'Debt to equity', 0.36, 'ratio', 'Total liabilities ÷ Total equity', {
      totalLiabilities: 400000,
      totalEquity: 1100000,
    }),
    kpi('runwayMonths', 'Runway', null, 'months', 'Cash ÷ average monthly net outflow (last 3 full months)', {
      cash: 500000,
    }, 'cash_positive'),
  ],
};

/** Register of 1000 Cash from the comparison date to AS_OF: 250,000 → 300,000. */
export const registerCash = {
  account: { accountCode: '1000', accountName: 'Cash', accountType: 'asset', subType: 'Cash' },
  range: { startDate: '2026-09-01', endDate: AS_OF },
  openingBasis: 'cumulative',
  openingBalance: 250000,
  periodDebit: '70000.0000',
  periodCredit: 20000,
  periodNet: 50000,
  closingBalance: 300000,
  entries: [
    {
      id: 'g1',
      date: '2026-09-05',
      reference: 'JE-101',
      memo: 'Receipt',
      debit: 70000,
      credit: 0,
      amount: 70000,
      runningBalance: 320000,
      sourceType: 'payment',
      sourceId: 'pay-1',
      sourceLabel: 'Customer payment',
      documentNumber: 'RCT-0042',
      counterpartyName: 'Allama Traders',
    },
    {
      id: 'g2',
      date: '2026-09-20',
      reference: 'JE-102',
      memo: 'Supplier',
      debit: 0,
      credit: 20000,
      amount: -20000,
      runningBalance: 300000,
      sourceType: 'bill_payment',
      sourceId: 'bp-1',
      sourceLabel: 'Bill payment',
      documentNumber: 'BP-0007',
      counterpartyName: 'Sukoon Supplies',
    },
  ],
  total: 2,
  page: 1,
  limit: 50,
};

export const movementCash = {
  current: 50000,
  prior: 0,
  change: 50000,
  byCounterparty: [
    { name: 'Allama Traders', current: 70000, prior: 0, change: 70000 },
    { name: 'Sukoon Supplies', current: -20000, prior: 0, change: -20000 },
  ],
  bySourceType: [
    { sourceLabel: 'Customer payment', current: 70000, prior: 0, change: 70000 },
    { sourceLabel: 'Bill payment', current: -20000, prior: 0, change: -20000 },
  ],
};

export const retainedEarningsV2 = {
  fiscalYearStart: FY_START,
  postedTo3100: 50000,
  byFiscalYear: [
    { fiscalYear: 'FY2024', startDate: '2024-01-01', endDate: '2024-12-31', netIncome: 100000 },
    { fiscalYear: 'FY2025', startDate: '2025-01-01', endDate: '2025-12-31', netIncome: 150000 },
  ],
  total: 300000,
};

const GROUP_OF: Record<string, string> = {
  '1000': 'cashAndBank',
  '1100': 'receivables',
  '2000': 'currentLiabilities',
  '3000': 'equity',
  '4000': 'income',
  '6000': 'expenses',
};

const tbRow = (
  accountCode: string,
  accountName: string,
  accountType: string,
  subType: string,
  debit: number,
  credit: number,
  flags: string[] = [],
) => ({ accountCode, accountName, accountType, subType, group: GROUP_OF[accountCode] ?? accountType, debit, credit, flags });

/** Closing trial balance at AS_OF. Cash is (deliberately) on the wrong side. */
export const trialBalanceClosing = {
  mode: 'closing',
  range: { startDate: '1970-01-01', endDate: AS_OF },
  asOfDate: AS_OF,
  fiscalYearStart: FY_START,
  rows: [
    tbRow('1000', 'Cash', 'asset', 'Cash', 0, 5000, ['abnormal_balance']),
    tbRow('1100', 'Accounts Receivable', 'asset', 'Accounts Receivable', 405000, 0),
    tbRow('2000', 'Accounts Payable', 'liability', 'Accounts Payable', 0, 100000),
    tbRow('3000', "Owner's Capital", 'equity', 'Owner Equity', 0, 150000),
    {
      accountCode: '',
      accountName: "Retained earnings — prior years' net income",
      accountType: 'equity',
      subType: 'Retained Earnings',
      group: 'equity',
      debit: 0,
      credit: 50000,
      flags: [],
      synthetic: true,
    },
    tbRow('4000', 'Sales', 'revenue', 'Sales', 0, 300000),
    tbRow('6000', 'Rent', 'expense', 'Expense', 200000, 0),
  ],
  totalDebits: 605000,
  totalCredits: 605000,
  isBalanced: true,
  groups: [
    { key: 'cashAndBank', label: 'Cash and Bank', debit: 0, credit: 5000 },
    { key: 'receivables', label: 'Accounts Receivable', debit: 405000, credit: 0 },
    { key: 'currentLiabilities', label: 'Current Liabilities', debit: 0, credit: 100000 },
    { key: 'equity', label: 'Equity', debit: 0, credit: 200000 },
    { key: 'income', label: 'Income', debit: 0, credit: 300000 },
    { key: 'expenses', label: 'Expenses', debit: 200000, credit: 0 },
  ],
};

export const trialBalanceWorking = {
  mode: 'working',
  range: { startDate: '2026-07-01', endDate: AS_OF },
  fiscalYearStart: FY_START,
  rows: [
    {
      ...tbRow('1000', 'Cash', 'asset', 'Cash', 30000, 0),
      openingDebit: 10000,
      openingCredit: 0,
      periodDebit: 50000,
      periodCredit: 30000,
      closingDebit: 30000,
      closingCredit: 0,
    },
    {
      ...tbRow('4000', 'Sales', 'revenue', 'Sales', 0, 30000),
      openingDebit: 0,
      openingCredit: 10000,
      periodDebit: 0,
      periodCredit: 20000,
      closingDebit: 0,
      closingCredit: 30000,
    },
  ],
  totalDebits: 30000,
  totalCredits: 30000,
  isBalanced: true,
  balanced: { opening: true, period: true, closing: true },
  totals: {
    openingDebit: 10000,
    openingCredit: 10000,
    periodDebit: 50000,
    periodCredit: 50000,
    closingDebit: 30000,
    closingCredit: 30000,
  },
  groups: [],
  warnings: [
    {
      code: 'CROSSES_FISCAL_YEAR',
      message:
        'The range runs past the fiscal year that starts 2026-07-01. Revenue and expense in the closing columns span more than one fiscal year; run one range per year to close each.',
    },
  ],
};

export const trialBalanceMovement = {
  mode: 'movement',
  range: { startDate: '2026-09-01', endDate: AS_OF },
  rows: [tbRow('1000', 'Cash', 'asset', 'Cash', 50000, 0), tbRow('4000', 'Sales', 'revenue', 'Sales', 0, 50000)],
  totalDebits: 50000,
  totalCredits: 50000,
  isBalanced: true,
  groups: [],
};

/** Cash flow for the year to AS_OF: 400,000 → 500,000. */
export const cashFlowV2 = {
  range: { startDate: FY_START, endDate: AS_OF },
  operating: {
    lines: [
      { label: 'Cash received from customers', amount: 900000, lineKey: 'op.customers', section: 'operating' },
      { label: 'Cash paid to suppliers', amount: -650000, lineKey: 'op.suppliers', section: 'operating' },
    ],
    total: 250000,
  },
  investing: {
    lines: [{ label: 'Purchase / sale of fixed assets', amount: -120000, lineKey: 'inv.fixed_assets', section: 'investing' }],
    total: -120000,
  },
  financing: {
    lines: [{ label: 'Loan proceeds / repayments', amount: -30000, lineKey: 'fin.loans', section: 'financing' }],
    total: -30000,
  },
  netChange: 100000,
  beginningCash: 400000,
  endingCash: 500000,
  monthlyTrend: [
    { label: 'Aug 26', value: 40000, endingCash: 440000 },
    { label: 'Sep 26', value: 60000, endingCash: 500000 },
  ],
  cashTie: { endingCash: 500000, balanceSheetCash: 500000, ties: true },
  // In − out is each month's net; the nets add up to netChange.
  monthly: [
    { period: '2026-08', label: 'Aug 26', inflow: 90000, outflow: 50000, net: 40000, endingCash: 440000 },
    { period: '2026-09', label: 'Sep 26', inflow: 100000, outflow: 40000, net: 60000, endingCash: 500000 },
  ],
  operatingIndirect: {
    netIncome: 200000,
    adjustments: [
      { label: 'Accounts Receivable', amount: -20000 },
      { label: 'Inventory', amount: 20000 },
      { label: 'Accounts Payable', amount: 50000 },
    ],
    total: 250000,
  },
  accounts: [
    { accountCode: '1000', accountName: 'Cash', beginning: 250000, ending: 300000 },
    { accountCode: '1010', accountName: 'Meezan Bank', beginning: 150000, ending: 200000 },
  ],
};

export const cashFlowLineEntries = {
  lineKey: 'op.suppliers',
  label: 'Cash paid to suppliers',
  section: 'operating',
  range: { startDate: FY_START, endDate: AS_OF },
  lineAmount: -650000,
  entries: [
    {
      id: 'g9',
      date: '2026-05-02',
      reference: 'JE-80',
      memo: '',
      debit: 0,
      credit: 1000000,
      amount: -1000000,
      allocatedAmount: -650000,
      allocationPct: 65,
      cashAccountCode: '1010',
      cashAccountName: 'Meezan Bank',
      sourceType: 'bill_payment',
      sourceId: 'bp-9',
      sourceLabel: 'Bill payment',
      documentNumber: 'BP-0009',
      counterpartyName: 'Sukoon Supplies',
    },
  ],
  total: 1,
  page: 1,
  limit: 50,
};

/** A/R aging with v2 insights. Σ schedule = totalOpen = totals.total. */
export const arAgingV2 = {
  asOfDate: AS_OF,
  preset: 'monthly',
  buckets: [
    { key: 'current', label: 'Current', minDays: 0, maxDays: 0 },
    { key: 'd1to30', label: '1–30', minDays: 1, maxDays: 30 },
    { key: 'd31to60', label: '31–60', minDays: 31, maxDays: 60 },
    { key: 'd61to90', label: '61–90', minDays: 61, maxDays: 90 },
    { key: 'd91plus', label: '91 and over', minDays: 91, maxDays: null },
  ],
  rows: [
    {
      customerId: '11111111-1111-4111-8111-111111111111',
      customerName: 'Allama Traders',
      amounts: { current: 100000, d1to30: 50000, d31to60: 0, d61to90: 0, d91plus: 50000 },
      total: 200000,
      paymentTerms: 'net30',
      creditLimit: 150000,
      overLimit: true,
      creditUsedPct: 133.33,
      lastPaymentDate: '2026-09-05',
      lastPaymentAmount: 70000,
      oldestDueDate: '2026-05-15',
    },
    {
      customerId: '22222222-2222-4222-8222-222222222222',
      customerName: 'Madina Wholesale',
      amounts: { current: 150000, d1to30: 0, d31to60: 50000, d61to90: 0, d91plus: 0 },
      total: 200000,
      paymentTerms: 'net15',
      creditLimit: 0,
      overLimit: false,
      creditUsedPct: null,
      lastPaymentDate: null,
      lastPaymentAmount: null,
      oldestDueDate: '2026-08-10',
    },
  ],
  totals: {
    amounts: { current: 250000, d1to30: 50000, d31to60: 50000, d61to90: 0, d91plus: 50000 },
    total: 400000,
  },
  insights: {
    dso: kpi('dso', 'Days sales outstanding', 42, 'days', 'Receivables ÷ revenue (trailing 90 days) × 90', {
      receivables: 400000,
      revenue90: 857000,
    }),
    totalOpen: 400000,
    overdue: 150000,
    overduePct: 37.5,
    weightedAvgDaysOverdue: 61.3,
    top5SharePct: 100,
    schedule: [
      { key: 'overdue', label: 'Overdue', amount: 150000, count: 3 },
      { key: 'd0_7', label: 'Due in 0–7 days', amount: 100000, count: 1 },
      { key: 'd8_14', label: 'Due in 8–14 days', amount: 50000, count: 1 },
      { key: 'd15_30', label: 'Due in 15–30 days', amount: 100000, count: 1 },
      { key: 'd31_60', label: 'Due in 31–60 days', amount: 0, count: 0 },
      { key: 'd60_plus', label: 'Due in more than 60 days', amount: 0, count: 0 },
    ],
    assessments: {
      overduePct: assessment('watch', 'The share of the open balance that is past its due date.'),
      weightedAvgDaysOverdue: assessment('risk', 'How late the overdue balance is, weighted by amount.'),
      top5SharePct: assessment('risk', 'How much of the total five parties hold; above 50%, losing one would be felt.'),
    },
  },
};

const ageSeries = (values: number[], counts: number[]) => [
  { key: 'd0_30', label: '0–30 days', count: counts[0], value: values[0] },
  { key: 'd31_90', label: '31–90 days', count: counts[1], value: values[1] },
  { key: 'd91_180', label: '91–180 days', count: counts[2], value: values[2] },
  { key: 'd180_plus', label: 'More than 180 days', count: counts[3], value: values[3] },
  { key: 'noMovement', label: 'No movement recorded', count: counts[4], value: values[4] },
];

export const inventoryHealthV2 = {
  asOfDate: AS_OF,
  basis: 'onHandAtAverageCost',
  belowReorder: [
    {
      itemId: 'item-1',
      name: 'Rice 5kg',
      sku: 'RICE-5',
      qtyOnHand: 4,
      reorderPoint: 10,
      reorderQuantity: 20,
      suggestedOrderQty: 20,
      stockValue: 4800,
    },
  ],
  aging: {
    byLastInbound: ageSeries([150000, 90000, 40000, 20000, 0], [12, 8, 3, 2, 0]),
    byLastOutbound: ageSeries([120000, 100000, 40000, 20000, 20000], [10, 9, 3, 2, 1]),
  },
  deadStock: {
    thresholdDays: 180,
    items: [
      {
        itemId: 'item-9',
        name: 'Old Stock',
        sku: 'OLD-1',
        qtyOnHand: 5,
        stockValue: 20000,
        lastOutboundDate: null,
        daysSinceOutbound: null,
      },
    ],
    totalValue: 20000,
  },
  turnover: kpi('inventoryTurnover', 'Inventory turnover', 4.2, 'ratio', 'COGS (trailing 12 months) ÷ average month-end inventory (GL 1200, 12 months)', {
    cogs12: 1260000,
    averageInventory: 300000,
  }),
  dio: kpi('dio12', 'Days inventory outstanding (12 months)', 87, 'days', 'Average month-end inventory ÷ COGS (trailing 12 months) × 365', {
    cogs12: 1260000,
    averageInventory: 300000,
  }),
  byLocation: [
    { location: 'Main warehouse', value: 250000 },
    { location: 'Unassigned', value: 50000 },
  ],
  totals: { itemCount: 25, itemsOnHand: 25, stockValue: 300000, valuationTotal: 300000 },
};

const comparedKpi = (
  key: string,
  label: string,
  current: number | null,
  prior: number | null,
  unit: string,
  verdict: ReturnType<typeof assessment> = assessment('neutral', 'No rule of thumb applies to this figure.'),
  inputs: Record<string, number> = {},
) => ({
  key,
  label,
  value: current,
  current,
  prior,
  change: current !== null && prior !== null ? Math.round((current - prior) * 100) / 100 : null,
  changePct: current !== null && prior ? Math.round(((current - prior) / Math.abs(prior)) * 1000) / 10 : null,
  unit,
  formula: `${label} (server formula)`,
  inputs,
  asOfDate: AS_OF,
  status: current === null ? 'no_denominator' : 'ok',
  assessment: verdict,
});

export const ownerCockpitV2 = {
  range: { startDate: FY_START, endDate: AS_OF },
  comparisonRange: { startDate: '2025-04-04', endDate: '2025-12-31' },
  series: [
    {
      period: '2026-08',
      label: 'Aug 26',
      revenue: 100000,
      cogs: 60000,
      grossProfit: 40000,
      operatingExpenses: 20000,
      netIncome: 20000,
      operatingCashFlow: 25000,
      endingCash: 440000,
    },
    {
      period: '2026-09',
      label: 'Sep 26',
      revenue: 120000,
      cogs: 70000,
      grossProfit: 50000,
      operatingExpenses: 25000,
      netIncome: 25000,
      operatingCashFlow: 30000,
      endingCash: 500000,
    },
  ],
  kpis: [
    comparedKpi('revenue', 'Revenue', 220000, 200000, 'money'),
    comparedKpi('grossProfit', 'Gross profit', 90000, 76000, 'money', assessment('healthy'), {
      revenue: 220000,
      cogs: 130000,
    }),
    comparedKpi('grossMarginPct', 'Gross margin', 40.9, 38, 'percent', assessment('healthy', 'The share of revenue left after the cost of goods sold.'), {
      grossProfit: 90000,
      revenue: 220000,
    }),
    comparedKpi('netIncome', 'Net profit', 45000, 44000, 'money', assessment('healthy'), {
      grossProfit: 90000,
      operatingExpenses: 45000,
    }),
    comparedKpi('netMarginPct', 'Net margin', 20.5, 22, 'percent', assessment('healthy')),
    comparedKpi('operatingExpenses', 'Operating expenses', 45000, 40000, 'money'),
    comparedKpi('operatingCashFlow', 'Operating cash flow', 55000, 50000, 'money', assessment('healthy')),
    comparedKpi('endingCash', 'Ending cash', 500000, 400000, 'money', assessment('healthy')),
    {
      ...comparedKpi('runwayMonths', 'Cash runway', null, null, 'months', assessment('healthy'), {
        cashAndBank: 500000,
        avgMonthlyNetCash: 20000,
      }),
      status: 'cash_positive',
    },
    comparedKpi('dso', 'DSO', 42, 38, 'days', assessment('healthy')),
    comparedKpi('dpo', 'DPO', 30, 33, 'days'),
    comparedKpi('dio', 'DIO', 87, 90, 'days', assessment('watch')),
    comparedKpi('ccc', 'Cash conversion cycle', 99, 95, 'days', assessment('watch'), { dso: 42, dio: 87, dpo: 30 }),
  ],
  expenseByAccount: [
    { accountCode: '6000', accountName: 'Rent', amount: 30000, sharePct: 66.67 },
    { accountCode: '', accountName: 'Other', amount: 15000, sharePct: 33.33 },
  ],
  salesByCustomer: {
    basis: 'invoice',
    label: 'invoice basis',
    note: 'Invoiced sales excluding tax, net of invoice discounts; drafts and voids excluded. Credit memos are not netted.',
    total: 220000,
    customers: [
      { customerId: '11111111-1111-4111-8111-111111111111', name: 'Allama Traders', amount: 130000, invoices: 4, sharePct: 59.09 },
      { customerId: '22222222-2222-4222-8222-222222222222', name: 'Madina Wholesale', amount: 90000, invoices: 3, sharePct: 40.91 },
    ],
    other: { count: 0, amount: 0, sharePct: null },
    top5SharePct: 100,
    assessment: assessment('risk', 'How much of the total five parties hold; above 50%, losing one would be felt.'),
  },
  budgetVsActual: null,
  fiscalYearStart: FY_START,
  health: financialHealthV2,
  // Most pressing first, as business-insights.ts orders them.
  insights: [
    {
      key: 'concentration',
      tone: 'negative',
      title: 'Top 5 customers are 100.0% of sales',
      detail: 'Losing any one of them would be felt; a wider customer base spreads the risk.',
      report: { key: 'arAging', params: {} },
    },
    {
      key: 'revenue',
      tone: 'positive',
      title: 'Revenue up 10.0%',
      detail: 'Rs 220,000 this period, against Rs 200,000 in the previous one.',
      report: { key: 'profitLoss', params: { startDate: FY_START, endDate: AS_OF } },
    },
    {
      key: 'margins',
      tone: 'neutral',
      title: 'Keeping 20.5% of revenue as profit',
      detail: 'Gross margin 40.9%; net profit Rs 45,000.',
      report: { key: 'profitLoss', params: { startDate: FY_START, endDate: AS_OF } },
    },
  ],
};

/** One cockpit KPI by key — the contract sends them as an array. */
export const cockpitKpi = (key: string) => {
  const found = ownerCockpitV2.kpis.find((k) => k.key === key);
  if (!found) throw new Error(`No cockpit KPI ${key} in the fixture`);
  return found;
};
