import { describe, expect, it } from 'vitest';

import {
  agingPartyDocumentsSerializer,
  agingSerializer,
  analyticsSerializer,
  balanceSheetSerializer,
  cashFlowSerializer,
  generalLedgerSerializer,
  inventoryValuationSerializer,
  ledgerAccountsSerializer,
  legacyAgingTotals,
  notYetDueTotal,
  overdueTotal,
  profitLossSerializer,
  trialBalanceSerializer,
} from '@/serializers/reportSerializers';

// Amounts arrive as JSON numbers today, but the columns behind them are Postgres
// `numeric`. These suites pass STRINGS deliberately: if one query ever returns an
// unwrapped numeric, the alternative to coercion is a statement of `Rs NaN` with
// no error raised anywhere.

describe('profitLossSerializer', () => {
  it('reads the scalars and the per-account detail', () => {
    const report = profitLossSerializer({
      range: { startDate: '2026-01-01', endDate: '2026-03-31' },
      revenue: 100000,
      cogs: 60000,
      grossProfit: 40000,
      expenses: 25000,
      netIncome: 15000,
      income: [{ accountCode: '4000', accountName: 'Sales Revenue', amount: 100000 }],
      cogsLines: [{ accountCode: '5000', accountName: 'COGS', amount: 60000 }],
      expenseLines: [{ accountCode: '6000', accountName: 'Rent', amount: 25000 }],
      otherIncome: [],
      otherExpense: [],
      totalIncome: 100000,
      totalCogs: 60000,
      totalExpenses: 25000,
      netOperatingIncome: 15000,
      netOtherIncome: 0,
    });

    expect(report.netIncome).toBe(15000);
    expect(report.range.startDate).toBe('2026-01-01');
    expect(report.income[0].accountName).toBe('Sales Revenue');
    expect(report.expenseLines).toHaveLength(1);
  });

  it('coerces string amounts to numbers', () => {
    const report = profitLossSerializer({
      revenue: '100000.0000',
      netIncome: '15000.5000',
      income: [{ accountCode: '4000', accountName: 'Sales', amount: '100000.0000' }],
    });
    expect(report.revenue).toBe(100000);
    expect(report.netIncome).toBe(15000.5);
    expect(report.income[0].amount).toBe(100000);
  });

  it('defaults every section to an empty array', () => {
    const report = profitLossSerializer({});
    expect(report.income).toEqual([]);
    expect(report.cogsLines).toEqual([]);
    expect(report.expenseLines).toEqual([]);
    expect(report.otherIncome).toEqual([]);
    expect(report.otherExpense).toEqual([]);
  });

  it('is all zeroes for a malformed payload rather than throwing', () => {
    expect(profitLossSerializer(null).netIncome).toBe(0);
    expect(profitLossSerializer(undefined).revenue).toBe(0);
  });
});

describe('balanceSheetSerializer', () => {
  it('reads the three flat sections and their totals', () => {
    const report = balanceSheetSerializer({
      asOfDate: '2026-03-31',
      assets: [{ accountCode: '1000', accountName: 'Cash', amount: 50000 }],
      liabilities: [{ accountCode: '2000', accountName: 'A/P', amount: 20000 }],
      equity: [{ accountCode: '3000', accountName: 'Owner Equity', amount: 30000 }],
      totalAssets: 50000,
      totalLiabilities: 20000,
      totalEquity: 30000,
      isBalanced: true,
    });

    expect(report.asOfDate).toBe('2026-03-31');
    expect(report.totalAssets).toBe(50000);
    expect(report.totalAssets).toBe(report.totalLiabilities + report.totalEquity);
    expect(report.isBalanced).toBe(true);
  });

  it('preserves an imbalance verdict', () => {
    // The one flag the page turns into a red banner — it must survive intact.
    expect(balanceSheetSerializer({ isBalanced: false }).isBalanced).toBe(false);
  });

  it('assumes balanced when the flag is absent', () => {
    // A missing flag is an old or partial payload, not evidence of an imbalance.
    // Crying "out of balance" at books that are fine sends someone hunting an
    // error nobody posted.
    expect(balanceSheetSerializer({ totalAssets: 100 }).isBalanced).toBe(true);
  });

  it('coerces string totals', () => {
    const report = balanceSheetSerializer({
      totalAssets: '50000.0000',
      totalLiabilities: '20000.0000',
      totalEquity: '30000.0000',
    });
    expect(report.totalAssets).toBe(50000);
    expect(report.totalEquity).toBe(30000);
  });
});

describe('trialBalanceSerializer', () => {
  it('reads rows and both column totals', () => {
    const report = trialBalanceSerializer({
      range: { startDate: '2026-01-01', endDate: '2026-03-31' },
      rows: [
        { accountCode: '1000', accountName: 'Cash', debit: 50000, credit: 0 },
        { accountCode: '4000', accountName: 'Sales', debit: 0, credit: 50000 },
      ],
      totalDebits: 50000,
      totalCredits: 50000,
      isBalanced: true,
    });

    expect(report.rows).toHaveLength(2);
    expect(report.totalDebits).toBe(report.totalCredits);
    expect(report.rows[1].credit).toBe(50000);
  });

  it('coerces string debits and credits', () => {
    const report = trialBalanceSerializer({
      rows: [{ accountCode: '1000', accountName: 'Cash', debit: '500.0000', credit: '0.0000' }],
      totalDebits: '500.0000',
      totalCredits: '500.0000',
    });
    expect(report.rows[0].debit).toBe(500);
    expect(report.totalDebits).toBe(500);
  });

  it('preserves an imbalance verdict', () => {
    expect(trialBalanceSerializer({ isBalanced: false }).isBalanced).toBe(false);
  });

  it('defaults rows to an empty array', () => {
    expect(trialBalanceSerializer({}).rows).toEqual([]);
  });
});

describe('cashFlowSerializer', () => {
  const payload = {
    range: { startDate: '2026-01-01', endDate: '2026-03-31' },
    operating: {
      lines: [{ label: 'Received from customers', amount: 80000 }],
      total: 80000,
    },
    investing: { lines: [], total: 0 },
    financing: { lines: [{ label: 'Owner contribution', amount: 10000 }], total: 10000 },
    netChange: 90000,
    beginningCash: 5000,
    endingCash: 95000,
    monthlyTrend: [{ label: 'Jan 26', value: 30000 }],
  };

  it('reads the three sections, the reconciliation and the trend', () => {
    const report = cashFlowSerializer(payload);
    expect(report.operating.lines[0].label).toBe('Received from customers');
    expect(report.investing.lines).toEqual([]);
    expect(report.financing.total).toBe(10000);
    expect(report.monthlyTrend[0].value).toBe(30000);
  });

  it('holds the cash reconciliation', () => {
    const report = cashFlowSerializer(payload);
    expect(report.beginningCash + report.netChange).toBe(report.endingCash);
  });

  it('reads the optional indirect reconciliation when present', () => {
    const report = cashFlowSerializer({
      ...payload,
      operatingIndirect: {
        netIncome: 70000,
        adjustments: [{ label: 'Depreciation', amount: 10000 }],
        total: 80000,
      },
    });
    expect(report.operatingIndirect?.netIncome).toBe(70000);
    expect(report.operatingIndirect?.adjustments).toHaveLength(1);
    // Its total always equals the direct method's operating total.
    expect(report.operatingIndirect?.total).toBe(report.operating.total);
  });

  it('is null for the indirect block when absent', () => {
    expect(cashFlowSerializer(payload).operatingIndirect).toBe(null);
  });

  it('gives empty sections for a malformed payload', () => {
    const report = cashFlowSerializer({});
    expect(report.operating.lines).toEqual([]);
    expect(report.operating.total).toBe(0);
  });
});

describe('generalLedgerSerializer', () => {
  it('reads entries, the running balance and the period totals', () => {
    const report = generalLedgerSerializer({
      range: { startDate: '2026-01-01', endDate: '2026-03-31' },
      accountCode: '1000',
      entries: [
        {
          date: '2026-01-05',
          postedAt: '2026-01-05T09:30:00.000Z',
          reference: 'JE-2026-0001',
          accountCode: '1000',
          accountName: 'Cash',
          memo: 'Opening balance',
          debit: 50000,
          credit: 0,
          balance: 50000,
          sourceType: 'journal_entry',
          sourceId: 'je-1',
        },
      ],
      totals: { debit: 50000, credit: 0 },
    });

    expect(report.accountCode).toBe('1000');
    expect(report.entries[0].balance).toBe(50000);
    // The drill-through target.
    expect(report.entries[0].sourceId).toBe('je-1');
    expect(report.totals.debit).toBe(50000);
  });

  it('is null for accountCode when no filter is in force', () => {
    expect(generalLedgerSerializer({ accountCode: null }).accountCode).toBe(null);
    expect(generalLedgerSerializer({}).accountCode).toBe(null);
  });

  it('coerces string amounts and balances', () => {
    const report = generalLedgerSerializer({
      entries: [{ debit: '500.0000', credit: '0.0000', balance: '500.0000' }],
      totals: { debit: '500.0000', credit: '0.0000' },
    });
    expect(report.entries[0].debit).toBe(500);
    expect(report.entries[0].balance).toBe(500);
    expect(report.totals.debit).toBe(500);
  });

  it('preserves the order it was given', () => {
    // Oldest-first, and the running balance depends on it — re-sorting would
    // make every balance read as wrong.
    const report = generalLedgerSerializer({
      entries: [
        { date: '2026-01-05', balance: 100 },
        { date: '2026-01-06', balance: 250 },
        { date: '2026-01-07', balance: 400 },
      ],
    });
    expect(report.entries.map((e) => e.date)).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
    ]);
  });

  it('defaults entries to an empty array', () => {
    expect(generalLedgerSerializer(null).entries).toEqual([]);
  });

  it('flags a voided journal and reads opening and closing balances', () => {
    const report = generalLedgerSerializer({
      entries: [
        { reference: 'JE-301', debit: 123.45, credit: 0, voided: true, sourceId: 'je-301' },
        { reference: 'JE-302', debit: 0, credit: 123.45, sourceId: 'je-302' },
      ],
      openingBalances: [{ accountCode: '1000', accountName: 'Cash', balance: '880334.6140' }],
      closingBalances: [{ accountCode: '1000', accountName: 'Cash', balance: 880334.61 }],
    });
    expect(report.entries[0].voided).toBe(true);
    expect(report.entries[1].voided).toBe(false);
    expect(report.openingBalances[0]).toEqual({ accountCode: '1000', accountName: 'Cash', balance: 880334.614 });
    expect(report.closingBalances[0].balance).toBe(880334.61);
  });
});

describe('ledgerAccountsSerializer', () => {
  it('reads per-account totals and the entry count', () => {
    const report = ledgerAccountsSerializer({
      range: { startDate: '2026-01-01', endDate: '2026-03-31' },
      accounts: [
        {
          accountCode: '1000',
          accountName: 'Cash',
          debit: 50000,
          credit: 10000,
          balance: 40000,
          entries: 12,
        },
      ],
    });
    expect(report.accounts[0].balance).toBe(40000);
    // A count, not a list.
    expect(report.accounts[0].entries).toBe(12);
  });

  it('defaults accounts to an empty array', () => {
    expect(ledgerAccountsSerializer({}).accounts).toEqual([]);
  });
});

describe('agingSerializer', () => {
  const payload = {
    asOfDate: '2026-03-31',
    rows: [
      {
        customerId: 'cust-1',
        customerName: 'Acme Ltd',
        current: 1000,
        bucket1to30: 500,
        bucket31to60: 250,
        bucket61to90: 100,
        bucket90Plus: 50,
        total: 1900,
      },
    ],
    totals: {
      current: 1000,
      bucket1to30: 500,
      bucket31to60: 250,
      bucket61to90: 100,
      bucket90Plus: 50,
      total: 1900,
    },
  };

  it('reads all five buckets and the totals', () => {
    const report = agingSerializer(payload);
    expect(report.rows[0].customerName).toBe('Acme Ltd');
    expect(report.rows[0].bucket90Plus).toBe(50);
    expect(report.totals.total).toBe(1900);
  });

  it('names an unnamed counterparty rather than leaving a blank row', () => {
    const report = agingSerializer({ rows: [{ customerId: 'x', total: 100 }] });
    expect(report.rows[0].customerName).toBe('Unknown');
  });

  it('coerces string bucket amounts', () => {
    const report = agingSerializer({
      totals: { current: '1000.0000', bucket90Plus: '50.0000', total: '1050.0000' },
    });
    expect(report.totals.current).toBe(1000);
    expect(report.totals.total).toBe(1050);
  });

  it('zeroes every bucket for a malformed payload', () => {
    const report = agingSerializer({});
    expect(report.rows).toEqual([]);
    expect(report.totals.total).toBe(0);
    expect(report.totals.bucket31to60).toBe(0);
  });

  it('rebuilds the classic columns from a server that predates buckets[]', () => {
    // The website deploys ahead of the API sometimes, and the API sometimes
    // ahead of it. A table of blanks would look like a company with nothing
    // outstanding, which is the worst possible way to be wrong.
    const report = agingSerializer(payload);
    expect(report.buckets.map((b) => b.key)).toEqual([
      'current',
      'd1to30',
      'd31to60',
      'd61to90',
      'd91plus',
    ]);
    expect(report.rows[0].amounts).toEqual({
      current: 1000,
      d1to30: 500,
      d31to60: 250,
      d61to90: 100,
      d91plus: 50,
    });
    expect(report.preset).toBe('monthly');
    // The rebuilt columns foot to the total the server sent.
    const summed = report.buckets.reduce(
      (t, b) => t + report.totals.amounts[b.key],
      0,
    );
    expect(summed).toBe(report.totals.total);
  });

  it('reads a configurable bucket payload', () => {
    const report = agingSerializer({
      asOfDate: '2026-09-21',
      preset: 'days3',
      buckets: [
        { key: 'current', label: 'Current', minDays: 0, maxDays: 0 },
        { key: 'd1to3', label: '1-3', minDays: 1, maxDays: 3 },
        { key: 'd4plus', label: '4 and over', minDays: 4, maxDays: null },
      ],
      rows: [
        {
          customerId: 'c1',
          customerName: 'Acme',
          amounts: { current: 10, d1to3: 20, d4plus: 30 },
          total: 60,
        },
      ],
      totals: { amounts: { current: 10, d1to3: 20, d4plus: 30 }, total: 60 },
    });

    expect(report.preset).toBe('days3');
    expect(report.buckets).toHaveLength(3);
    expect(report.rows[0].amounts.d1to3).toBe(20);
    expect(report.buckets[2].maxDays).toBeNull();
  });

  it('coerces amounts on the bucket path too, not just the legacy fields', () => {
    const report = agingSerializer({
      buckets: [{ key: 'current', label: 'Current', minDays: 0, maxDays: 0 }],
      totals: { amounts: { current: '1000.5000' }, total: '1000.5000' },
    });
    expect(report.totals.amounts.current).toBe(1000.5);
  });

  it('counts everything past due as overdue, whatever the buckets are', () => {
    // This used to be hardcoded as "31 days and over" — a line drawn for
    // 30/60/90 columns. Under a 3-day preset that would report nearly a month
    // of debt as current, which is the opposite of what the preset reveals.
    const report = agingSerializer(payload);
    expect(overdueTotal(report)).toBe(900);
    expect(notYetDueTotal(report)).toBe(1000);

    const threeDay = agingSerializer({
      buckets: [
        { key: 'current', label: 'Current', minDays: 0, maxDays: 0 },
        { key: 'd1to3', label: '1-3', minDays: 1, maxDays: 3 },
        { key: 'd4plus', label: '4 and over', minDays: 4, maxDays: null },
      ],
      totals: { amounts: { current: 10, d1to3: 20, d4plus: 30 }, total: 60 },
    });
    expect(overdueTotal(threeDay)).toBe(50);
    expect(notYetDueTotal(threeDay)).toBe(10);
  });

  it('reports nothing overdue when only the current column carries a balance', () => {
    const report = agingSerializer({
      totals: { current: 1000, total: 1000 },
    });
    expect(overdueTotal(report)).toBe(0);
  });

  it('wraps the analytics snapshot, which is not re-bucketable', () => {
    const totals = legacyAgingTotals({
      current: 1,
      bucket1to30: 2,
      bucket31to60: 3,
      bucket61to90: 4,
      bucket90Plus: 5,
      total: 15,
    });
    expect(totals.amounts).toEqual({
      current: 1,
      d1to30: 2,
      d31to60: 3,
      d61to90: 4,
      d91plus: 5,
    });
  });
});

describe('agingPartyDocumentsSerializer', () => {
  const payload = {
    partyType: 'customer',
    partyId: 'c1',
    partyName: 'Allama Traders',
    asOfDate: '2026-09-22',
    preset: 'monthly',
    buckets: [
      { key: 'current', label: 'Current', minDays: 0, maxDays: 0 },
      { key: 'd1to30', label: '1\u201330', minDays: 1, maxDays: 30 },
      { key: 'd31plus', label: '31 and over', minDays: 31, maxDays: null },
    ],
    bucket: 'd1to30',
    // Postgres numeric arrives as a string: formats fine, fails on arithmetic.
    outstandingTotal: '300.00',
    documents: [
      {
        documentId: 'i1',
        documentType: 'invoice',
        documentNumber: 'INV-1',
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        daysOverdue: 21,
        bucketKey: 'd1to30',
        bucketLabel: '1\u201330',
        total: '500.00',
        amountPaid: '200.00',
        balance: '300.00',
        status: 'partial',
      },
    ],
    total: 1,
    page: 1,
    limit: 50,
  };

  it('reads the party, the spec and the documents', () => {
    const d = agingPartyDocumentsSerializer(payload);
    expect(d.partyType).toBe('customer');
    expect(d.partyName).toBe('Allama Traders');
    expect(d.bucket).toBe('d1to30');
    expect(d.buckets).toHaveLength(3);
    expect(d.buckets[2].maxDays).toBeNull();
    expect(d.documents).toHaveLength(1);
    expect(d.documents[0].documentNumber).toBe('INV-1');
  });

  it('coerces every money field off the numeric strings', () => {
    const d = agingPartyDocumentsSerializer(payload);
    expect(d.outstandingTotal).toBe(300);
    expect(d.documents[0].total).toBe(500);
    expect(d.documents[0].amountPaid).toBe(200);
    expect(d.documents[0].balance).toBe(300);
    // The contract that makes the panel reconcilable against its row.
    expect(d.documents.reduce((t, x) => t + x.balance, 0)).toBe(d.outstandingTotal);
  });

  it('keeps a negative daysOverdue for a document that is not yet due', () => {
    // 0 and negative are both real answers here, so neither may be coerced
    // away through a falsy fallback.
    const d = agingPartyDocumentsSerializer({
      ...payload,
      documents: [
        { ...payload.documents[0], daysOverdue: -4, bucketKey: 'current' },
        { ...payload.documents[0], documentId: 'i2', daysOverdue: 0 },
      ],
    });
    expect(d.documents[0].daysOverdue).toBe(-4);
    expect(d.documents[1].daysOverdue).toBe(0);
  });

  it('reads the payables side without inheriting the A/R field names', () => {
    const d = agingPartyDocumentsSerializer({
      ...payload,
      partyType: 'vendor',
      partyName: 'Supplier Co',
      documents: [{ ...payload.documents[0], documentType: 'bill' }],
    });
    expect(d.partyType).toBe('vendor');
    expect(d.partyName).toBe('Supplier Co');
    expect(d.documents[0].documentType).toBe('bill');
  });

  it('tolerates a bare array, so an envelope regression cannot blank the panel', () => {
    // The failure mode that took the P&L drill-down down: rows named `data`,
    // lifted into the envelope slot, siblings discarded, client shown nothing.
    const d = agingPartyDocumentsSerializer(payload.documents);
    expect(d.documents).toHaveLength(1);
    expect(d.documents[0].documentNumber).toBe('INV-1');
  });

  it('reads rows still arriving under `data`', () => {
    const { documents, ...rest } = payload;
    const d = agingPartyDocumentsSerializer({ ...rest, data: documents });
    expect(d.documents).toHaveLength(1);
    expect(d.outstandingTotal).toBe(300);
  });

  it('zeroes a malformed payload rather than throwing', () => {
    const d = agingPartyDocumentsSerializer(null);
    expect(d.documents).toEqual([]);
    expect(d.outstandingTotal).toBe(0);
    expect(d.partyName).toBe('Unknown');
    expect(d.bucket).toBeNull();
    expect(d.page).toBe(1);
  });

  it('defaults an unknown document type to an invoice rather than dropping it', () => {
    const d = agingPartyDocumentsSerializer({
      ...payload,
      documents: [{ ...payload.documents[0], documentType: 'something-else' }],
    });
    expect(d.documents[0].documentType).toBe('invoice');
  });
});

describe('inventoryValuationSerializer', () => {
  it('reads rows, the category roll-up and the total', () => {
    const report = inventoryValuationSerializer({
      rows: [
        {
          itemId: 'item-1',
          itemName: 'Widget',
          sku: 'W-1',
          category: 'Hardware',
          qty: 10,
          cost: 250,
          value: 2500,
        },
      ],
      byCategory: [{ category: 'Hardware', totalValue: 2500 }],
      totalValue: 2500,
    });
    expect(report.rows[0].value).toBe(2500);
    expect(report.byCategory[0].category).toBe('Hardware');
    expect(report.totalValue).toBe(2500);
  });

  it('labels an item with no category', () => {
    const report = inventoryValuationSerializer({
      rows: [{ itemId: 'i', itemName: 'X', value: 10 }],
    });
    expect(report.rows[0].category).toBe('Uncategorized');
  });

  it('coerces string quantities and costs', () => {
    const report = inventoryValuationSerializer({
      rows: [{ qty: '10.0000', cost: '250.0000', value: '2500.0000' }],
      totalValue: '2500.0000',
    });
    expect(report.rows[0].qty).toBe(10);
    expect(report.totalValue).toBe(2500);
  });

  it('defaults to empty for a malformed payload', () => {
    const report = inventoryValuationSerializer(null);
    expect(report.rows).toEqual([]);
    expect(report.byCategory).toEqual([]);
    expect(report.totalValue).toBe(0);
  });
});

describe('analyticsSerializer', () => {
  it('reads every trend and ranking', () => {
    const report = analyticsSerializer({
      revenueTrend: [{ label: 'Jan 26', value: 30000 }],
      expenseCategories: [{ label: 'Acme Supplies', value: 12000 }],
      cashFlowTrend: [{ label: 'Jan 26', value: 18000 }],
      topCustomers: [{ label: 'Big Co', value: 50000 }],
      arAgingTrend: [
        {
          label: 'Current',
          current: 1000,
          bucket1to30: 500,
          bucket31to60: 250,
          bucket61to90: 100,
          bucket90Plus: 50,
        },
      ],
    });

    expect(report.revenueTrend[0].value).toBe(30000);
    expect(report.topCustomers[0].label).toBe('Big Co');
    expect(report.arAgingTrend[0].bucket90Plus).toBe(50);
  });

  it('never hands a chart a NaN', () => {
    // recharts renders nothing and logs nothing for a NaN, so an unparseable
    // value has to become a number. `toNumber` makes it 0, which plots.
    const report = analyticsSerializer({
      revenueTrend: [
        { label: 'Jan', value: 100 },
        { label: 'Feb', value: 'not-a-number' },
        { label: 'Mar', value: null },
      ],
    });
    expect(report.revenueTrend.map((p) => p.value)).toEqual([100, 0, 0]);
    for (const point of report.revenueTrend) {
      expect(Number.isFinite(point.value)).toBe(true);
    }
  });

  it('defaults every collection to an empty array', () => {
    const report = analyticsSerializer({});
    expect(report.revenueTrend).toEqual([]);
    expect(report.expenseCategories).toEqual([]);
    expect(report.cashFlowTrend).toEqual([]);
    expect(report.topCustomers).toEqual([]);
    expect(report.arAgingTrend).toEqual([]);
  });
});
