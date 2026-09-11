import { describe, expect, it } from 'vitest';

import {
  isBeforeLastStatement,
  isLatestForAccount,
  normalizeStatementBalance,
  reconciliationMath,
  sourceTypeLabel,
  splitSections,
  type ReconEntry,
} from '@/models/reconciliation';
import {
  reconciliationDetailSerializer,
  unreconciledSerializer,
} from '@/serializers/reconciliationSerializer';

const entry = (id: string, amount: number): ReconEntry => ({
  id,
  date: '2026-09-01',
  reference: id.toUpperCase(),
  memo: '',
  sourceType: 'journal_entry',
  sourceId: `src-${id}`,
  debit: amount > 0 ? amount : 0,
  credit: amount < 0 ? -amount : 0,
  amount,
  cleared: false,
});

describe('normalizeStatementBalance', () => {
  it('returns a two-decimal string', () => {
    expect(normalizeStatementBalance('15250')).toBe('15250.00');
    expect(normalizeStatementBalance('15250.5')).toBe('15250.50');
  });

  it('strips the commas and spaces statements print', () => {
    expect(normalizeStatementBalance('15,250.00')).toBe('15250.00');
    expect(normalizeStatementBalance(' 1 000 ')).toBe('1000.00');
  });

  it('accepts a negative balance for an overdrawn account', () => {
    expect(normalizeStatementBalance('-120.5')).toBe('-120.50');
  });

  it('refuses what parseFloat would silently misread', () => {
    // parseFloat('15250abc') === 15250 — the app would reconcile against it.
    expect(normalizeStatementBalance('15250abc')).toBe(null);
    expect(normalizeStatementBalance('')).toBe(null);
    expect(normalizeStatementBalance('abc')).toBe(null);
  });

  it('refuses more than two decimals rather than guessing the paisa', () => {
    expect(normalizeStatementBalance('1.005')).toBe(null);
  });
});

describe('reconciliationMath', () => {
  const entries = [entry('dep1', 5000), entry('dep2', 2500.5), entry('pay1', -1200.25)];

  it('computes cleared = beginning + net of ticked rows', () => {
    const m = reconciliationMath(10000, entries, new Set(['dep1', 'pay1']), '13799.75');
    expect(m.clearedBalance).toBe(13799.75);
    expect(m.clearedNet).toBe(3799.75);
  });

  it('is balanced at exactly zero difference', () => {
    const m = reconciliationMath(10000, entries, new Set(['dep1', 'pay1']), '13799.75');
    expect(m.difference).toBe(0);
    expect(m.balanced).toBe(true);
  });

  it('is NOT balanced one paisa out', () => {
    // The app's |d| < 0.005 tolerance is looser than the server's 0.0001; a
    // client that says "balanced" here would be refused on Finish.
    const m = reconciliationMath(10000, entries, new Set(['dep1', 'pay1']), '13799.76');
    expect(m.difference).toBe(0.01);
    expect(m.balanced).toBe(false);
  });

  it('sums without float drift', () => {
    const drift = [entry('a', 0.1), entry('b', 0.2)];
    const m = reconciliationMath(0, drift, new Set(['a', 'b']), '0.30');
    expect(m.balanced).toBe(true);
  });

  it('ignores ticks for rows no longer on the list', () => {
    // The statement date moved back past a row: its old tick must not count.
    const m = reconciliationMath(100, [entry('a', 50)], new Set(['a', 'gone']), '150');
    expect(m.balanced).toBe(true);
  });

  it('can balance with nothing ticked', () => {
    // The server allows an empty clearedEntryIds when the statement matches
    // the carried-in balance.
    const m = reconciliationMath(500, entries, new Set(), '500.00');
    expect(m.balanced).toBe(true);
  });

  it('has no difference while the statement balance is unreadable', () => {
    const m = reconciliationMath(500, entries, new Set(), '5,00x');
    expect(m.statementBalance).toBe(null);
    expect(m.difference).toBe(null);
    expect(m.balanced).toBe(false);
  });

  it('handles an overdrawn statement', () => {
    const m = reconciliationMath(-200, [entry('p', -50)], new Set(['p']), '-250');
    expect(m.balanced).toBe(true);
  });
});

describe('splitSections', () => {
  it('puts deposits and payments apart, with cleared counts and totals', () => {
    const rows = [entry('d1', 100), entry('d2', 50), entry('p1', -30), entry('z', 0)];
    const { deposits, payments } = splitSections(rows, new Set(['d1', 'p1']));
    expect(deposits.entries.map((e) => e.id)).toEqual(['d1', 'd2', 'z']);
    expect(deposits.clearedCount).toBe(1);
    expect(deposits.clearedTotal).toBe(100);
    expect(payments.entries.map((e) => e.id)).toEqual(['p1']);
    expect(payments.clearedTotal).toBe(-30);
  });
});

describe('isBeforeLastStatement', () => {
  it('refuses a statement dated before the last reconciliation', () => {
    expect(isBeforeLastStatement('2026-08-31', '2026-09-01')).toBe(true);
  });

  it('allows the same day and later', () => {
    expect(isBeforeLastStatement('2026-09-01', '2026-09-01')).toBe(false);
    expect(isBeforeLastStatement('2026-09-30', '2026-09-01')).toBe(false);
  });

  it('allows anything when the account was never reconciled', () => {
    expect(isBeforeLastStatement('2000-01-01', null)).toBe(false);
  });
});

describe('isLatestForAccount', () => {
  const r = (id: string, accountId: string, statementDate: string, createdAt: string) => ({
    id,
    accountId,
    statementDate,
    createdAt,
  });
  const history = [
    r('jul', 'bank', '2026-07-31', '2026-08-02T10:00:00Z'),
    r('aug', 'bank', '2026-08-31', '2026-09-02T10:00:00Z'),
    r('cash', 'cash', '2026-09-30', '2026-10-01T10:00:00Z'),
  ];

  it('is true only for the most recent statement on the same account', () => {
    expect(isLatestForAccount(history[1], history)).toBe(true);
    expect(isLatestForAccount(history[0], history)).toBe(false);
  });

  it('ignores reconciliations of other accounts', () => {
    expect(isLatestForAccount(history[2], history)).toBe(true);
  });

  it('breaks a same-day tie by creation time, as the server does', () => {
    const sameDay = [
      r('first', 'bank', '2026-09-30', '2026-09-30T09:00:00Z'),
      r('second', 'bank', '2026-09-30', '2026-09-30T17:00:00Z'),
    ];
    expect(isLatestForAccount(sameDay[0], sameDay)).toBe(false);
    expect(isLatestForAccount(sameDay[1], sameDay)).toBe(true);
  });
});

describe('sourceTypeLabel', () => {
  it('names known sources and humanises the rest', () => {
    expect(sourceTypeLabel('journal_entry')).toBe('Journal entry');
    expect(sourceTypeLabel('delivery_approval')).toBe('Delivery approval');
    expect(sourceTypeLabel('')).toBe('—');
  });
});

describe('reconciliation serializers', () => {
  it('coerces the string amounts the API sends', () => {
    const set = unreconciledSerializer({
      accountId: 'acct',
      accountName: 'Business Checking',
      accountNumber: '1010',
      beginningBalance: '1000.00',
      lastStatementDate: null,
      lastStatementEndingBalance: null,
      beginningMismatch: null,
      entries: [
        {
          id: 'g1',
          date: '2026-09-01',
          reference: 'JE-1',
          memo: 'Deposit',
          sourceType: 'journal_entry',
          sourceId: 'je-1',
          debit: '250.00',
          credit: '0.00',
          amount: '250.00',
          cleared: true,
        },
      ],
    });
    expect(set.beginningBalance).toBe(1000);
    expect(set.entries[0].amount).toBe(250);
    expect(set.entries[0].cleared).toBe(true);
    expect(set.entries[0].sourceId).toBe('je-1');
  });

  it('reads a mismatch as a number and its absence as null', () => {
    expect(unreconciledSerializer({ beginningMismatch: '-12.50' }).beginningMismatch).toBe(-12.5);
    expect(unreconciledSerializer({ beginningMismatch: null }).beginningMismatch).toBe(null);
  });

  it('reads the four-decimal stored columns and the report sections', () => {
    const d = reconciliationDetailSerializer({
      id: 'r1',
      accountId: 'acct',
      statementDate: '2026-09-30',
      statementEndingBalance: '1250.0000',
      beginningBalance: '1000.0000',
      clearedBalance: '1250.0000',
      difference: '0.0000',
      clearedCount: 1,
      status: 'completed',
      entries: [{ id: 'g1', debit: '250.00', credit: '0.00', amount: '250.00' }],
      outstanding: [{ id: 'g2', debit: '0.00', credit: '40.00', amount: '-40.00' }],
      outstandingTotal: '-40.00',
    });
    expect(d.statementEndingBalance).toBe(1250);
    expect(d.difference).toBe(0);
    expect(d.entries).toHaveLength(1);
    expect(d.outstanding[0].amount).toBe(-40);
    expect(d.outstandingTotal).toBe(-40);
  });

  it('derives the signed amount if a row lacks one', () => {
    const set = unreconciledSerializer({ entries: [{ id: 'g', debit: '0', credit: '75.50' }] });
    expect(set.entries[0].amount).toBe(-75.5);
  });
});
