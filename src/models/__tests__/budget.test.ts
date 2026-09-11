import { describe, expect, it } from 'vitest';

import {
  budgetPayload,
  emptyBudgetForm,
  evenSpread,
  favourableVariance,
  formTotal,
  hasBudgetErrors,
  lineAnnual,
  monthsTotal,
  newBudgetLine,
  spreadAnnual,
  validateBudget,
  varianceLabel,
  varianceTone,
  type BudgetForm,
} from '@/models/budget';
import { mapBudget, mapPrefill, mapVsActual } from '@/serializers/budgetSerializer';

const fmt = (n: number) => `Rs ${n.toFixed(2)}`;

describe('even spread', () => {
  it('lands the rounding remainder in December and adds back exactly', () => {
    const months = evenSpread(100_000);
    expect(months.slice(0, 11).every((m) => m === 8333.33)).toBe(true);
    expect(months[11]).toBe(8333.37);
    expect(monthsTotal(months).toNumber()).toBe(100_000);
  });

  it('handles paise and zero', () => {
    expect(monthsTotal(evenSpread('1000.05')).toString()).toBe('1000.05');
    expect(evenSpread(0)).toEqual(Array(12).fill(0));
  });
});

describe('variance, read the way an accountant reads it', () => {
  it('expense under budget is favourable; over is not', () => {
    const under = { accountType: 'expense', budgeted: 10_000, actual: 8_000 };
    expect(favourableVariance(under).toNumber()).toBe(2000);
    expect(varianceTone(under)).toBe('favourable');
    expect(varianceLabel(under, fmt)).toBe('Rs 2000.00 under budget');
    expect(varianceTone({ accountType: 'expense', budgeted: 10_000, actual: 12_000 })).toBe('unfavourable');
  });

  it('revenue ABOVE budget is favourable — the server’s budgeted − actual sign reads it backwards', () => {
    const beat = { accountType: 'revenue', budgeted: 50_000, actual: 60_000 };
    expect(favourableVariance(beat).toNumber()).toBe(10_000);
    expect(varianceTone(beat)).toBe('favourable');
    expect(varianceLabel(beat, fmt)).toBe('Rs 10000.00 above target');
    expect(varianceLabel({ accountType: 'revenue', budgeted: 50_000, actual: 45_000 }, fmt)).toBe(
      'Rs 5000.00 below target',
    );
  });

  it('is on budget at zero variance', () => {
    expect(varianceTone({ accountType: 'expense', budgeted: 5, actual: 5 })).toBe('on_budget');
  });
});

describe('budget form', () => {
  const form = (over: Partial<BudgetForm> = {}): BudgetForm => ({
    ...emptyBudgetForm(2026),
    name: 'FY2026 Operating',
    lines: [spreadAnnual(newBudgetLine('acct-rent'), '120000')],
    ...over,
  });

  it('spreads an annual figure and totals the months', () => {
    const line = form().lines[0];
    expect(line.months.every((m) => m === '10000')).toBe(true);
    expect(lineAnnual(line).toNumber()).toBe(120_000);
    expect(formTotal(form()).toNumber()).toBe(120_000);
  });

  it('is valid with a named budget and a funded line', () => {
    expect(hasBudgetErrors(validateBudget(form()))).toBe(false);
  });

  it('flags a missing name, a bad year, no accounts and a duplicate account', () => {
    const dup = [spreadAnnual(newBudgetLine('a'), '10'), spreadAnnual(newBudgetLine('a'), '10')];
    const e = validateBudget(form({ name: ' ', fiscalYear: '26', lines: dup }));
    expect(e.name).toBeTruthy();
    expect(e.fiscalYear).toBeTruthy();
    expect(e.line[dup[1].key]).toMatch(/already/);
    expect(validateBudget(form({ lines: [newBudgetLine()] })).lines).toBeTruthy();
  });

  it('refuses a line with nothing budgeted or a malformed month', () => {
    const empty = newBudgetLine('a');
    expect(validateBudget(form({ lines: [empty] })).line[empty.key]).toBeTruthy();
    const bad = { ...newBudgetLine('b'), months: ['12.345', ...Array(11).fill('')] };
    expect(validateBudget(form({ lines: [bad] })).line[bad.key]).toMatch(/decimals/);
  });

  it('builds the DTO with twelve numbers per line', () => {
    const body = budgetPayload(form({ status: 'active' }));
    expect(body).toMatchObject({ name: 'FY2026 Operating', fiscalYear: 2026, status: 'active' });
    expect(body.lines).toEqual([{ accountId: 'acct-rent', monthlyAmounts: Array(12).fill(10_000) }]);
  });
});

describe('budget serializer', () => {
  it('reads a budget with twelve months per line, padding short arrays', () => {
    const b = mapBudget({
      id: 'b1',
      fiscalYear: 2026,
      status: 'active',
      totalBudget: '120000.00',
      lines: [{ id: 'l1', accountId: 'a1', accountNumber: '6000', accountName: 'Rent', monthlyAmounts: [10000, 10000] }],
    });
    expect(b.totalBudget).toBe(120_000);
    expect(b.lines[0].monthlyAmounts).toHaveLength(12);
    expect(b.lines[0].annualTotal).toBe(20_000);
  });

  it('reads vs-actual rows and totals', () => {
    const v = mapVsActual({
      budget: { id: 'b1', name: 'X', fiscalYear: 2026, status: 'active' },
      rows: [{ accountId: 'a1', accountCode: '4000', accountName: 'Sales', accountType: 'revenue', budgeted: 100, actual: 120, variance: -20, percentUsed: 120, months: [{ month: 1, budgeted: 100, actual: 120, variance: -20 }] }],
      totals: { budgeted: 100, actual: 120, variance: -20 },
    });
    expect(v.rows[0].months[0].actual).toBe(120);
    expect(varianceTone(v.rows[0])).toBe('favourable');
  });

  it('reads prefill lines', () => {
    const p = mapPrefill({ fiscalYear: 2025, lines: [{ accountId: 'a', accountCode: '6000', accountName: 'Rent', accountType: 'expense', monthlyAmounts: [1, 2], annualTotal: 3 }] });
    expect(p[0]).toMatchObject({ accountCode: '6000', annualTotal: 3 });
    expect(p[0].monthlyAmounts).toHaveLength(12);
  });
});
