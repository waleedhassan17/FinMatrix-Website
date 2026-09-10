import { describe, expect, it } from 'vitest';

import {
  computeBillTotals,
  deriveBillStatus,
  isBillEditable,
  isBillPayable,
  validateBillLines,
  type BillFormLine,
  type BillStatus,
} from '@/models/bill';

const formLine = (amount: string, taxRate = '0'): BillFormLine => ({
  id: `l_${amount}_${taxRate}`,
  accountId: 'acct-1',
  description: 'Consumables',
  amount,
  taxRate,
});

describe('computeBillTotals', () => {
  it('sums the line amounts', () => {
    // A bill line carries its own amount — there is no qty × price to derive.
    const t = computeBillTotals([formLine('100'), formLine('250.50')]);
    expect(t.subtotal).toBe(350.5);
    expect(t.taxAmount).toBe(0);
    expect(t.total).toBe(350.5);
  });

  it('charges tax per line on that line’s own amount', () => {
    const t = computeBillTotals([formLine('100', '17'), formLine('100', '0')]);
    expect(t.subtotal).toBe(200);
    expect(t.taxAmount).toBe(17);
    expect(t.total).toBe(217);
  });

  it('taxes each line on ITS OWN amount, not the running subtotal', () => {
    // Two taxed lines are what separates the two implementations: taxing the
    // accumulated subtotal would charge the first line's amount again on the
    // second, giving 40 instead of 30. One taxed line hides the difference.
    const t = computeBillTotals([formLine('100', '10'), formLine('200', '10')]);
    expect(t.subtotal).toBe(300);
    expect(t.taxAmount).toBe(30);
    expect(t.total).toBe(330);
  });

  it('is unaffected by the order the lines are entered in', () => {
    const a = computeBillTotals([formLine('100', '17'), formLine('250', '5')]);
    const b = computeBillTotals([formLine('250', '5'), formLine('100', '17')]);
    expect(a).toEqual(b);
  });

  it('has no discount concept at all', () => {
    // CreateBillDto carries no discount field of any kind, so the total is
    // always subtotal + tax and nothing can reduce it.
    const t = computeBillTotals([formLine('100', '10')]);
    expect(t.total).toBe(t.subtotal + t.taxAmount);
  });

  it('keeps the displayed parts summing to the displayed total', () => {
    const t = computeBillTotals([formLine('0.005', '17'), formLine('0.005', '17')]);
    expect(t.subtotal + t.taxAmount).toBeCloseTo(t.total, 10);
  });

  it('treats a blank amount as zero rather than NaN', () => {
    const t = computeBillTotals([formLine(''), formLine('50')]);
    expect(t.total).toBe(50);
  });

  it('is zero for no lines', () => {
    expect(computeBillTotals([])).toEqual({
      subtotal: 0,
      taxAmount: 0,
      total: 0,
    });
  });
});

describe('deriveBillStatus', () => {
  const today = '2026-09-10';

  it('marks an open bill past its due date as overdue', () => {
    expect(deriveBillStatus('open', 500, '2026-09-01', today)).toBe('overdue');
  });

  it('marks a partial bill past its due date as overdue', () => {
    expect(deriveBillStatus('partial', 200, '2026-09-01', today)).toBe('overdue');
  });

  it('leaves a bill due today alone', () => {
    // The rule is strictly `dueDate < today` — due today is not yet late.
    expect(deriveBillStatus('open', 500, today, today)).toBe('open');
  });

  it('leaves a settled bill alone however old it is', () => {
    expect(deriveBillStatus('paid', 0, '2020-01-01', today)).toBe('paid');
  });

  it('never marks a draft overdue', () => {
    // A draft has posted nothing to accounts payable; it cannot be late.
    expect(deriveBillStatus('draft', 500, '2020-01-01', today)).toBe('draft');
  });

  it('never marks a void bill overdue', () => {
    expect(deriveBillStatus('void', 500, '2020-01-01', today)).toBe('void');
  });

  it('leaves a bill with no due date alone', () => {
    expect(deriveBillStatus('open', 500, '', today)).toBe('open');
  });

  it('leaves a zero-balance open bill alone', () => {
    expect(deriveBillStatus('open', 0, '2020-01-01', today)).toBe('open');
  });
});

describe('isBillEditable', () => {
  it('allows a draft', () => {
    expect(isBillEditable('draft')).toBe(true);
  });

  it.each<BillStatus>(['open', 'partial', 'paid', 'overdue', 'void'])(
    'refuses a %s bill',
    (status) => {
      expect(isBillEditable(status)).toBe(false);
    },
  );
});

describe('isBillPayable', () => {
  it('allows a posted bill with a balance', () => {
    expect(isBillPayable({ status: 'open', balance: 100 })).toBe(true);
    expect(isBillPayable({ status: 'partial', balance: 40 })).toBe(true);
    expect(isBillPayable({ status: 'overdue', balance: 40 })).toBe(true);
  });

  it('refuses a draft however much it owes', () => {
    // BILL_NOT_POSTED — the server refuses outright, so the action is hidden
    // rather than offered and failed.
    expect(isBillPayable({ status: 'draft', balance: 1000 })).toBe(false);
  });

  it('refuses a settled bill', () => {
    expect(isBillPayable({ status: 'paid', balance: 0 })).toBe(false);
  });

  it('refuses a void bill', () => {
    expect(isBillPayable({ status: 'void', balance: 500 })).toBe(false);
  });
});

describe('validateBillLines', () => {
  const totals = (lines: BillFormLine[]) => computeBillTotals(lines);

  it('accepts a complete line', () => {
    const lines = [formLine('100')];
    expect(validateBillLines(lines, totals(lines))).toBeNull();
  });

  it('rejects an empty bill', () => {
    expect(validateBillLines([], totals([]))).toMatch(/at least one line/i);
  });

  it('rejects a line with no account', () => {
    // Without one the server falls back to the company's COGS account and, if
    // that lookup fails, refuses the whole bill with ACCOUNT_REQUIRED.
    const lines = [{ ...formLine('100'), accountId: '' }];
    expect(validateBillLines(lines, totals(lines))).toMatch(/account/i);
  });

  it('rejects a line with no description', () => {
    const lines = [{ ...formLine('100'), description: '   ' }];
    expect(validateBillLines(lines, totals(lines))).toMatch(/description/i);
  });

  it('rejects a zero amount', () => {
    const lines = [formLine('0')];
    expect(validateBillLines(lines, totals(lines))).toMatch(/amount/i);
  });
});
