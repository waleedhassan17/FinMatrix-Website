import { describe, expect, it } from 'vitest';

import { balanceSheetRows } from '@/features/reports/balanceSheetRows';
import { documentHref } from '@/features/reports/documentRoutes';
import { registerTies } from '@/features/reports/investigate/register';
import { statementColumns, statementCsvRows } from '@/features/reports/statementColumns';
import { signedBalance, tbColumns, tbTotal, trialBalanceView } from '@/features/reports/trialBalanceRows';
import { withStockAsOf, valuationRows } from '@/models/inventoryValuation';
import { csvHeaderBlock } from '@/models/reportCsv';
import { quickFilterAgingRows } from '@/models/reportAging';
import { accountRegisterSerializer } from '@/serializers/reportInvestigateSerializers';
import {
  agingSerializer,
  balanceSheetSerializer,
  inventoryValuationSerializer,
  trialBalanceSerializer,
} from '@/serializers/reportSerializers';
import {
  arAgingV2,
  AS_OF,
  balanceSheetV2,
  registerCash,
  trialBalanceClosing,
  trialBalanceWorking,
} from '@/test/msw/reportsV2Fixtures';

describe('balanceSheetRows', () => {
  const report = balanceSheetSerializer(balanceSheetV2);

  it('lays the server’s sections out as a balance sheet, every figure as sent', () => {
    const { assets, liabilitiesAndEquity } = balanceSheetRows(report, false);
    expect(assets.map((r) => r.label)).toEqual([
      'Current Assets',
      'Cash and Bank',
      '1000  Cash',
      '1010  Meezan Bank',
      'Total Cash and Bank',
      'Accounts Receivable',
      '1100  Accounts Receivable',
      'Total Accounts Receivable',
      'Inventory',
      '1200  Inventory',
      'Total Inventory',
      'Total Current Assets',
      'Fixed Assets',
      '1500  Equipment',
      'Total Fixed Assets',
      'TOTAL ASSETS',
    ]);
    expect(assets.at(-1)).toMatchObject({ amount: 1500000, isGrand: true });
    expect(liabilitiesAndEquity.at(-1)).toMatchObject({ label: 'TOTAL LIABILITIES AND EQUITY', amount: 1500000 });
    expect(liabilitiesAndEquity.find((r) => r.label === 'Total Equity')?.amount).toBe(1100000);
  });

  it('leaves out a statement group with nothing in it', () => {
    const withEmpty = balanceSheetSerializer({
      ...balanceSheetV2,
      sections: [
        ...balanceSheetV2.sections.slice(0, 3),
        { key: 'otherCurrentAssets', label: 'Other Current Assets', lines: [], subtotal: 0, priorSubtotal: 0 },
        ...balanceSheetV2.sections.slice(3),
      ],
    });
    expect(balanceSheetRows(withEmpty, false).assets.some((r) => r.label === 'Other Current Assets')).toBe(false);
  });

  it('never gives a synthetic line a real account code', () => {
    const { liabilitiesAndEquity, lines } = balanceSheetRows(report, true);
    const ni = liabilitiesAndEquity.find((r) => r.key === 'synthetic-currentYearEarnings');
    expect(ni).toMatchObject({ kind: 'synthetic', accountCode: undefined, prior: 100000 });
    expect(ni?.note).toMatch(/Computed, not posted/);
    expect(lines.get('retained-earnings')?.line.composite?.postedBalance).toBe(50000);
    // No two equity lines share a code.
    const codes = liabilitiesAndEquity.filter((r) => r.accountCode).map((r) => r.accountCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('statement columns → CSV', () => {
  it('exports exactly the columns on screen', () => {
    const rows = balanceSheetRows(balanceSheetSerializer(balanceSheetV2), true).assets;
    const cols = statementColumns({ comparing: true, commonSize: true, currentLabel: 'Sep 30', priorLabel: 'Aug 31' });
    const csv = statementCsvRows(rows, cols);
    expect(csv[0]).toEqual(['Line', 'Sep 30', 'Aug 31', 'Change', '%', '% of total']);
    expect(csv.find((r) => r[0] === '1000  Cash')).toEqual(['1000  Cash', '300000.00', '250000.00', '50000.00', '20.0%', '20.0%']);
    // A heading has no figures.
    expect(csv[1]).toEqual(['Current Assets', '', '', '', '', '']);
  });

  it('opens with the header block', () => {
    expect(
      csvHeaderBlock({ company: 'Warehouse Co', report: 'Balance Sheet', period: 'As of Sep 30', comparison: 'Compared with Aug 31', generatedAt: 'now' }),
    ).toEqual([['Warehouse Co'], ['Balance Sheet'], ['As of Sep 30'], ['Compared with Aug 31'], ['Generated now'], []]);
  });
});

describe('trialBalanceView', () => {
  const tb = trialBalanceSerializer(trialBalanceClosing);

  it('groups by type with the server’s subtotals', () => {
    const view = trialBalanceView(tb);
    expect(view.rows.filter((r) => r.type === 'group').map((r) => (r.type === 'group' ? r.label : ''))).toEqual([
      'Assets',
      'Liabilities',
      'Equity',
      'Revenue',
      'Expenses',
    ]);
    expect(view.flaggedCount).toBe(1);
    // The synthetic prior-years row sits under Equity.
    const equityRows = view.rows.filter((r) => r.groupKey === 'equity' && r.type === 'account');
    expect(equityRows).toHaveLength(2);
  });

  it('drops group subtotals when a filter hides rows, never re-adding the rest', () => {
    const view = trialBalanceView(tb, { flaggedOnly: true });
    expect(view.filtered).toBe(true);
    expect(view.rows.some((r) => r.type === 'subtotal')).toBe(false);
    expect(view.rows.filter((r) => r.type === 'account')).toHaveLength(1);
  });

  it('shows six columns in the working view, footed by each pair’s own total', () => {
    const working = trialBalanceSerializer(trialBalanceWorking);
    const cols = tbColumns('working');
    expect(cols.map((c) => `${c.group} ${c.header}`)).toEqual([
      'Opening Debit',
      'Opening Credit',
      'Period Debit',
      'Period Credit',
      'Closing Debit',
      'Closing Credit',
    ]);
    expect(cols.map((c) => tbTotal(working, c))).toEqual([10000, 10000, 50000, 50000, 30000, 30000]);
  });

  it('signs a pair on the account’s normal side, as its register does', () => {
    expect(signedBalance('asset', { debit: 0, credit: 5000 })).toBe(-5000);
    expect(signedBalance('revenue', { debit: 0, credit: 300000 })).toBe(300000);
  });
});

describe('registerTies', () => {
  const reg = accountRegisterSerializer(registerCash);

  it('ties a balance line to the closing balance, and an activity line to the movement', () => {
    expect(registerTies(reg, 300000, 'closing')).toEqual({ internal: true, toLine: true });
    expect(registerTies(reg, 50000, 'movement')).toEqual({ internal: true, toLine: true });
    expect(registerTies(reg, 299999, 'closing').toLine).toBe(false);
  });

  it('notices a register that does not foot on its own', () => {
    expect(registerTies({ ...reg, closingBalance: 300001 }, 300001, 'closing').internal).toBe(false);
  });
});

describe('documentHref', () => {
  it('opens every document that has a page, and only those', () => {
    expect(documentHref('invoice_void', 'i1')).toBe('/invoices/i1');
    expect(documentHref('payment', 'p1')).toBe('/payments/p1');
    expect(documentHref('delivery_return', 'd1')).toBe('/deliveries/d1');
    expect(documentHref('payroll', 'r1')).toBe('/payroll/runs/r1');
    expect(documentHref('journal_entry', 'j1')).toBe('/journal-entries/j1');
    expect(documentHref('bill_payment', 'b1')).toBeNull();
    expect(documentHref('tax_payment', 't1')).toBeNull();
    expect(documentHref('invoice', '')).toBeNull();
  });
});

describe('quickFilterAgingRows', () => {
  const ar = agingSerializer(arAgingV2);

  it('narrows by a fact about the party', () => {
    expect(quickFilterAgingRows(ar.rows, ar.buckets, 'over-limit', AS_OF).map((r) => r.customerName)).toEqual(['Allama Traders']);
    expect(quickFilterAgingRows(ar.rows, ar.buckets, '90plus', AS_OF).map((r) => r.customerName)).toEqual(['Allama Traders']);
    expect(quickFilterAgingRows(ar.rows, ar.buckets, 'overdue', AS_OF)).toHaveLength(2);
    expect(quickFilterAgingRows(ar.rows, ar.buckets, null, AS_OF)).toHaveLength(2);
  });
});

describe('withStockAsOf', () => {
  it('takes stock from the as-of valuation and keeps the period’s sales', () => {
    const today = inventoryValuationSerializer({
      rows: [
        { itemId: 'a', itemName: 'A', qty: 10, cost: 2, value: 20 },
        { itemId: 'b', itemName: 'B', qty: 5, cost: 1, value: 5 },
      ],
    });
    const then = inventoryValuationSerializer({
      rows: [
        { itemId: 'a', itemName: 'A', qty: 4, cost: 2, value: 8 },
        { itemId: 'c', itemName: 'C', qty: 1, cost: 3, value: 3 },
      ],
    });
    const rows = withStockAsOf(valuationRows(today, undefined), then);
    expect(rows.map((r) => [r.itemId, r.qty, r.value])).toEqual([
      ['a', 4, 8],
      ['b', 0, 0],
      ['c', 1, 3],
    ]);
  });
});
