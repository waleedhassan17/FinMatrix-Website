import { describe, expect, it } from 'vitest';

import { kpiMapSerializer, kpiOrNumber, kpiSerializer } from '@/serializers/kpiSerializer';
import {
  financialHealthSerializer,
  inventoryHealthSerializer,
  ownerCockpitSerializer,
} from '@/serializers/reportInsightSerializers';
import {
  accountMovementSerializer,
  accountRegisterSerializer,
  cashFlowLineEntriesSerializer,
  retainedEarningsSerializer,
} from '@/serializers/reportInvestigateSerializers';
import {
  agingSerializer,
  balanceSheetSerializer,
  cashFlowSerializer,
  inventoryValuationSerializer,
  trialBalanceSerializer,
} from '@/serializers/reportSerializers';
import {
  arAgingV2,
  AS_OF,
  balanceSheetV2,
  cockpitKpi,
  FY_START,
  cashFlowLineEntries,
  cashFlowV2,
  financialHealthV2,
  inventoryHealthV2,
  movementCash,
  ownerCockpitV2,
  registerCash,
  retainedEarningsV2,
  trialBalanceClosing,
  trialBalanceWorking,
} from '@/test/msw/reportsV2Fixtures';

describe('kpiSerializer', () => {
  it('reads the KPI object, keeping a null value null', () => {
    const k = kpiSerializer(financialHealthV2.kpis[4]);
    expect(k).toMatchObject({ key: 'runwayMonths', value: null, unit: 'months', status: 'cash_positive' });
    expect(k.inputs).toEqual([{ key: 'cash', label: 'Cash', value: 500000, unit: 'money' }]);
  });

  it('never turns Infinity, NaN or a blank into a number', () => {
    expect(kpiSerializer({ key: 'x', value: 'Infinity' }).value).toBeNull();
    expect(kpiSerializer({ key: 'x', value: '' }).value).toBeNull();
    expect(kpiSerializer({ key: 'x', value: '1.25' }).value).toBe(1.25);
  });

  it('reads `current` beside `prior` on cockpit KPIs', () => {
    const k = kpiSerializer(cockpitKpi('revenue'));
    expect(k).toMatchObject({ value: 220000, prior: 200000, change: 20000, changePct: 10 });
  });

  it('accepts unit aliases and array inputs', () => {
    const k = kpiSerializer({ key: 'gm', unit: 'pct', value: 41, inputs: [{ label: 'Gross profit', value: '410' }] });
    expect(k.unit).toBe('percent');
    expect(k.inputs[0]).toMatchObject({ label: 'Gross profit', value: 410, unit: 'money' });
  });

  it('reads a KPI set as an array, `{ kpis }`, or a keyed map', () => {
    expect(Object.keys(kpiMapSerializer(financialHealthV2))).toContain('quickRatio');
    expect(Object.keys(kpiMapSerializer(financialHealthV2.kpis))).toHaveLength(5);
    expect(Object.keys(kpiMapSerializer(ownerCockpitV2.kpis))).toContain('ccc');
  });

  it('dresses a bare number as a KPI with no formula', () => {
    expect(kpiOrNumber(42, 'dso', 'DSO', 'days')).toMatchObject({ value: 42, unit: 'days', formula: '' });
    expect(kpiOrNumber(undefined, 'dso', 'DSO', 'days')).toBeNull();
  });
});

describe('balanceSheetSerializer (v2)', () => {
  const bs = balanceSheetSerializer(balanceSheetV2);

  it('reads the server’s sections, lines and comparison figures as sent', () => {
    expect(bs.grouped).toBe(true);
    expect(bs.sections.map((s) => s.key)).toEqual([
      'cashAndBank',
      'receivables',
      'inventory',
      'fixedAssets',
      'currentLiabilities',
      'longTermLiabilities',
      'equity',
    ]);
    expect(bs.sections[0].lines[0]).toMatchObject({ accountCode: '1000', priorAmount: 250000, change: 50000, changePct: 20 });
    expect(bs.totalAssets).toBe(1500000); // a numeric string, coerced
    expect(bs.fiscalYearStart).toBe('2026-01-01');
  });

  it('keeps synthetic and composite lines apart from real accounts', () => {
    const equity = bs.sections.find((s) => s.key === 'equity')!;
    expect(equity.lines[1].composite).toEqual({ postedBalance: 50000, priorYearsEarnings: 250000 });
    expect(equity.lines[2]).toMatchObject({ synthetic: 'currentYearEarnings', accountCode: '' });
  });

  it('reads the cross-section totals, with their priors', () => {
    // The contract's `totalCurrentAssets` key, and each subtotal's own change.
    expect(bs.totals.currentAssets).toMatchObject({ amount: 1200000, prior: 1100000, change: 100000, pctOfTotalAssets: 80 });
    expect(bs.totals.totalLiabilitiesAndEquity).toMatchObject({ amount: 1500000, prior: 1400000 });
    expect(bs.sections[0]).toMatchObject({ change: 100000, changePct: 25, pctOfTotalAssets: 33.3 });
    expect(bs.gap).toBe(0);
  });

  it('turns an older server’s flat lists into three sections, totalled by the server', () => {
    const legacy = balanceSheetSerializer({
      asOfDate: '2026-09-30',
      assets: [{ accountCode: '1000', accountName: 'Cash', amount: 100 }],
      liabilities: [{ accountCode: '2000', accountName: 'AP', amount: 40 }],
      equity: [{ accountCode: '3000', accountName: 'Capital', amount: 60 }],
      totalAssets: 100,
      totalLiabilities: 40,
      totalEquity: 60,
    });
    expect(legacy.grouped).toBe(false);
    expect(legacy.sections.map((s) => [s.key, s.subtotal])).toEqual([
      ['assets', 100],
      ['liabilities', 40],
      ['equity', 60],
    ]);
    // The right-hand bottom line, carried down when the server predates it.
    expect(legacy.totals.totalLiabilitiesAndEquity?.amount).toBe(100);
    expect(legacy.comparison).toBeNull();
  });
});

describe('trialBalanceSerializer (v2)', () => {
  it('reads mode, types, flags, the synthetic row and the group subtotals', () => {
    const tb = trialBalanceSerializer(trialBalanceClosing);
    expect(tb.mode).toBe('closing');
    expect(tb.rows[0]).toMatchObject({ accountType: 'asset', subType: 'Cash', flags: ['abnormal_balance'] });
    expect(tb.rows.find((r) => r.synthetic)?.credit).toBe(50000);
    expect(tb.groups.find((g) => g.key === 'equity')?.main).toEqual({ debit: 0, credit: 200000 });
    expect(tb.columnTotals.closing).toEqual({ debit: 605000, credit: 605000, isBalanced: true });
  });

  it('reads the working view’s six figures per row and per column pair', () => {
    const tb = trialBalanceSerializer(trialBalanceWorking);
    expect(tb.rows[0].opening).toEqual({ debit: 10000, credit: 0 });
    expect(tb.rows[0].period).toEqual({ debit: 50000, credit: 30000 });
    // The contract's flat totals and separate verdicts.
    expect(tb.columnTotals.period).toEqual({ debit: 50000, credit: 50000, isBalanced: true });
    expect(tb.columnTotals.opening).toEqual({ debit: 10000, credit: 10000, isBalanced: true });
    expect(tb.warning).toMatch(/runs past the fiscal year/);
  });

  it('answers in movement mode for a server that knows no modes', () => {
    const tb = trialBalanceSerializer({ rows: [{ accountCode: '1000', accountName: 'Cash', debit: 5, credit: 0 }], totalDebits: 5, totalCredits: 5 });
    expect(tb.mode).toBe('movement');
    expect(tb.rows[0]).toMatchObject({ accountType: '', flags: [], opening: null });
    expect(tb.columnTotals.period).toMatchObject({ debit: 5, credit: 5 });
  });
});

describe('cashFlowSerializer (v2)', () => {
  it('reads line keys, the bank accounts and the monthly series', () => {
    const cf = cashFlowSerializer(cashFlowV2);
    expect(cf.operating.lines[1]).toMatchObject({ lineKey: 'op.suppliers', section: 'operating', amount: -650000 });
    expect(cf.accounts.map((a) => a.ending)).toEqual([300000, 200000]);
    expect(cf.monthlyTrend[1]).toEqual({ label: 'Sep 26', value: 60000, endingCash: 500000 });
    expect(cf.cashTie).toEqual({ endingCash: 500000, balanceSheetCash: 500000, ties: true });
    // In and out per month (contract gap G1) are read when a server sends them.
    const split = cashFlowSerializer({ monthly: [{ month: '2026-09', label: 'Sep 26', inflow: '10', outflow: 4, net: 6, endingCash: 6 }] });
    expect(split.monthly[0]).toMatchObject({ period: '2026-09', inflow: 10, outflow: 4 });
    expect(cashFlowSerializer({}).cashTie).toBeNull();
    // Unkeyed indirect adjustments (contract gap G7) stay unkeyed.
    expect(cf.operatingIndirect?.adjustments[0].lineKey).toBeNull();
    expect(cf.operatingIndirect?.excludedNonCash).toEqual([]);
    const excluded = cashFlowSerializer({ operatingIndirect: { excludedNonCash: [{ label: 'Opening balances', amount: '-149980' }] } });
    expect(excluded.operatingIndirect?.excludedNonCash[0]).toMatchObject({ label: 'Opening balances', amount: -149980 });
  });
});

describe('agingSerializer (v2)', () => {
  it('reads the party facts and the insights block', () => {
    const ar = agingSerializer(arAgingV2);
    expect(ar.rows[0]).toMatchObject({
      paymentTerms: 'net30',
      creditLimit: 150000,
      overLimit: true,
      creditUsedPct: 133.33,
      oldestDueDate: '2026-05-15',
    });
    // The contract's 0 for "no limit" reads as no limit.
    expect(ar.rows[1]).toMatchObject({ creditLimit: null, lastPaymentDate: null });
    expect(ar.insights?.days).toMatchObject({ key: 'dso', value: 42, unit: 'days' });
    expect(ar.insights?.schedule.reduce((t, s) => t + s.amount, 0)).toBe(ar.insights?.totalOpen);
  });

  it('reads DPO given as a bare number, and no insights from an older server', () => {
    const ap = agingSerializer({ ...arAgingV2, insights: { dpo: 30, totalOpen: 1, schedule: [] } });
    expect(ap.insights?.days).toMatchObject({ key: 'dpo', value: 30 });
    expect(agingSerializer({ rows: [] }).insights).toBeNull();
  });
});

describe('inventoryValuationSerializer (v2)', () => {
  it('reads the as-of tie and the coverage in either form', () => {
    const v = inventoryValuationSerializer({ rows: [], totalValue: 10, asOfDate: '2026-09-30', ledgerTie: { gl1200: 12, valuation: 10, gap: -2 }, coverage: 80 });
    expect(v.ledgerTie).toEqual({ gl1200: 12, valuation: 10, gap: -2 });
    expect(v.coverage).toEqual({ pct: 80, message: '' });
    expect(inventoryValuationSerializer({ rows: [] }).ledgerTie).toBeNull();
  });

  it('marks an item the as-of record could not value, rather than calling it zero', () => {
    const v = inventoryValuationSerializer({
      asOfDate: '2026-06-30',
      rows: [
        { itemId: 'a', itemName: 'A', qty: 3, cost: null, value: null, valueKnown: false },
        { itemId: 'b', itemName: 'B', qty: 1, cost: 2, value: 2, valueKnown: true },
      ],
      coverage: { movements: 10, valued: 9, pct: 90, unvaluedItems: 1 },
    });
    expect(v.rows.map((r) => r.valueKnown)).toEqual([false, true]);
    expect(v.coverage).toEqual({ pct: 90, message: '1 item has no recorded value on that date' });
  });
});

describe('investigation serializers', () => {
  it('reads a register, its running balances and its paging', () => {
    const r = accountRegisterSerializer(registerCash);
    expect(r.account).toEqual({ accountCode: '1000', accountName: 'Cash', accountType: 'asset', subType: 'Cash' });
    expect(r.periodDebit).toBe(70000);
    expect(r).toMatchObject({ periodNet: 50000, openingBasis: 'cumulative' });
    expect(r.entries.map((e) => e.runningBalance)).toEqual([320000, 300000]);
    expect(r.entries[1].documentNumber).toBe('BP-0007');
  });

  it('tolerates rows lifted out of the envelope as a bare array', () => {
    expect(accountRegisterSerializer(registerCash.entries).entries).toHaveLength(2);
  });

  it('reads the movement breakdown, naming the unattributed', () => {
    const m = accountMovementSerializer({ ...movementCash, byCounterparty: [{ name: null, current: 1, prior: 0, change: 1 }] });
    expect(m.change).toBe(50000);
    expect(m.byCounterparty[0].label).toBe('Unattributed');
    expect(accountMovementSerializer(movementCash).bySourceType[0].label).toBe('Customer payment');
  });

  it('reads the retained earnings rollforward', () => {
    const re = retainedEarningsSerializer(retainedEarningsV2);
    expect(re.postedTo3100 + re.byFiscalYear.reduce((t, y) => t + y.netIncome, 0)).toBe(re.total);
  });

  it('reads cash-flow line entries with their allocation', () => {
    const e = cashFlowLineEntriesSerializer(cashFlowLineEntries);
    expect(e.entries[0]).toMatchObject({ allocatedAmount: -650000, allocationPct: 65, amount: -1000000 });
    // A whole (unsplit) row allocates its full amount.
    const whole = cashFlowLineEntriesSerializer({ entries: [{ id: 'x', amount: 5 }] });
    expect(whole.entries[0]).toMatchObject({ allocatedAmount: 5, allocationPct: null });
  });
});

describe('insight serializers', () => {
  it('reads financial health, the server’s "ok" status meaning nothing to say', () => {
    const h = financialHealthSerializer(financialHealthV2);
    expect(h.asOfDate).toBe('2026-09-30');
    expect(h.kpis.currentRatio).toMatchObject({ value: 4, status: null });
    expect(h.kpis.runwayMonths.status).toBe('cash_positive');
  });

  it('reads inventory health, dead stock as an object or a bare list', () => {
    const h = inventoryHealthSerializer(inventoryHealthV2);
    expect(h.belowReorder[0].suggestedOrderQty).toBe(20);
    expect(h.aging.map((b) => b.label)).toEqual([
      '0–30 days',
      '31–90 days',
      '91–180 days',
      'More than 180 days',
      'No movement recorded',
    ]);
    expect(h.agingOutbound.map((b) => b.value)).toEqual([120000, 100000, 40000, 20000, 20000]);
    expect(h.deadStock.items[0]).toMatchObject({ qty: 5, value: 20000 });
    expect(h.turnover).toMatchObject({ key: 'inventoryTurnover', value: 4.2 });
    const bare = inventoryHealthSerializer({ deadStock: [{ itemId: 'a', name: 'A', qty: 1, value: 9 }], deadStockValue: 9, aging: { d0_30: { value: 1, count: 1 } } });
    expect(bare.deadStock).toEqual({ items: [{ itemId: 'a', name: 'A', sku: '', qty: 1, value: 9, lastOutboundDate: null }], totalValue: 9 });
    expect(bare.aging[0]).toMatchObject({ key: 'd0_30', label: '0–30 days' });
  });

  it('reads the cockpit, its series as rows or as one array per measure', () => {
    const c = ownerCockpitSerializer(ownerCockpitV2);
    expect(c.series[1]).toMatchObject({ label: 'Sep 26', revenue: 120000, endingCash: 500000 });
    expect(c.kpis.dso.change).toBe(4);
    expect(c.salesByCustomer).toMatchObject({
      basis: 'invoice basis',
      top5SharePct: 100,
      other: null,
      assessment: { level: 'risk' },
    });
    expect(c.salesByCustomer.customers[0]).toMatchObject({ sharePct: 59.09, invoices: 4 });
    expect(c.salesByCustomer.note).toMatch(/Credit memos are not netted/);
    expect(c.expenseByAccount[0]).toEqual({ accountCode: '6000', label: 'Rent', amount: 30000, sharePct: 66.67 });
    expect(c.health?.kpis.workingCapital.value).toBe(900000);
    expect(c.kpis.dio.assessment).toEqual({ level: 'watch', guide: 'watch guide.' });
    expect(c.insights.map((i) => [i.key, i.tone])).toEqual([
      ['concentration', 'negative'],
      ['revenue', 'positive'],
      ['margins', 'neutral'],
    ]);
    expect(c.insights[1].report).toEqual({ key: 'profitLoss', params: { startDate: FY_START, endDate: AS_OF } });

    const columnar = ownerCockpitSerializer({
      series: {
        revenue: [
          { period: '2026-08', label: 'Aug 26', value: 1 },
          { period: '2026-09', label: 'Sep 26', value: 2 },
        ],
        netIncome: [
          { period: '2026-08', label: 'Aug 26', value: 3 },
          { period: '2026-09', label: 'Sep 26', value: 4 },
        ],
      },
    });
    expect(columnar.series).toEqual([
      expect.objectContaining({ period: '2026-08', revenue: 1, netIncome: 3, cogs: 0 }),
      expect.objectContaining({ period: '2026-09', revenue: 2, netIncome: 4 }),
    ]);
    expect(columnar.budgetVsActual).toBeNull();
    // A server that predates insights and assessments: none, never guessed.
    expect(columnar.insights).toEqual([]);
    expect(columnar.salesByCustomer.assessment).toBeNull();
  });
});
