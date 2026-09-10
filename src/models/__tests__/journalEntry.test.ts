import { describe, expect, it } from 'vitest';

import {
  canPost,
  canVoid,
  emptyJournalForm,
  freshJournalLine,
  isOpeningBalanceEntry,
  isReversal,
  journalTotals,
  usableJournalLines,
  validateJournalDraft,
  validateJournalPost,
  type JournalFormLine,
} from '@/models/journalEntry';
import { isBalanced } from '@/utils/money';

/** A complete, balanced pair — the smallest entry the server will accept. */
const debit = (amount: string, accountId = 'acct-1000'): JournalFormLine => ({
  ...freshJournalLine(),
  accountId,
  debit: amount,
  credit: '',
});

const credit = (amount: string, accountId = 'acct-4000'): JournalFormLine => ({
  ...freshJournalLine(),
  accountId,
  debit: '',
  credit: amount,
});

describe('journalTotals', () => {
  it('sums each side independently', () => {
    const totals = journalTotals([debit('1000'), credit('600'), credit('400')]);
    expect(totals.debits.toFixed(2)).toBe('1000.00');
    expect(totals.credits.toFixed(2)).toBe('1000.00');
    expect(totals.balanced).toBe(true);
  });

  it('reports the difference with a sign saying which side is short', () => {
    // Debits heavier → positive → credits are short.
    expect(journalTotals([debit('1000'), credit('600')]).difference.toFixed(2)).toBe(
      '400.00',
    );
    // Credits heavier → negative → debits are short.
    expect(journalTotals([debit('600'), credit('1000')]).difference.toFixed(2)).toBe(
      '-400.00',
    );
  });

  it('sums without float drift', () => {
    // 0.1 + 0.2 === 0.3 only because Decimal does the adding.
    const totals = journalTotals([debit('0.1'), debit('0.2'), credit('0.3')]);
    expect(totals.balanced).toBe(true);
  });

  it('balances a compound entry split across several lines', () => {
    const totals = journalTotals([
      debit('333.33'),
      debit('333.33'),
      debit('333.34'),
      credit('1000.00'),
    ]);
    expect(totals.debits.toFixed(2)).toBe('1000.00');
    expect(totals.balanced).toBe(true);
  });

  it('treats blank and unparseable amounts as zero', () => {
    const totals = journalTotals([
      { ...freshJournalLine(), accountId: 'a', debit: '', credit: '' },
      { ...freshJournalLine(), accountId: 'b', debit: 'abc', credit: '' },
    ]);
    expect(totals.debits.toFixed(2)).toBe('0.00');
  });

  it('is zero and balanced for no lines', () => {
    const totals = journalTotals([]);
    expect(totals.debits.isZero()).toBe(true);
    expect(totals.balanced).toBe(true);
  });
});

describe('usableJournalLines', () => {
  it('drops rows the user never started', () => {
    // An untouched row is the blank the editor opened with, not a mistake.
    const lines = usableJournalLines([
      debit('1000'),
      freshJournalLine(),
      credit('1000'),
    ]);
    expect(lines).toHaveLength(2);
  });

  it('keeps a row with an account but no amount, so it can be reported', () => {
    // Dropping it silently would lose a line the user deliberately picked an
    // account for, and the server would refuse it anyway.
    const lines = usableJournalLines([
      { ...freshJournalLine(), accountId: 'acct-1000', debit: '', credit: '' },
    ]);
    expect(lines).toHaveLength(1);
  });

  it('keeps a row with an amount but no account', () => {
    const lines = usableJournalLines([
      { ...freshJournalLine(), accountId: '', debit: '500', credit: '' },
    ]);
    expect(lines).toHaveLength(1);
  });
});

describe('validateJournalDraft', () => {
  it('accepts a balanced pair', () => {
    expect(validateJournalDraft([debit('1000'), credit('1000')])).toBe('');
  });

  it('accepts an UNBALANCED draft — that is what a draft is for', () => {
    // The server checks the balance only when status === 'posted'.
    expect(validateJournalDraft([debit('1000'), credit('600')])).toBe('');
  });

  it('refuses fewer than two lines', () => {
    // ArrayMinSize(2) on the DTO, INSUFFICIENT_LINES behind it.
    expect(validateJournalDraft([debit('1000')])).toMatch(/at least two lines/);
  });

  it('refuses an empty editor', () => {
    expect(validateJournalDraft(emptyJournalForm('2026-03-01').lines)).toMatch(
      /at least two lines/,
    );
  });

  it('refuses a line with no account', () => {
    expect(
      validateJournalDraft([
        { ...freshJournalLine(), accountId: '', debit: '1000', credit: '' },
        credit('1000'),
      ]),
    ).toBe('Every line needs an account.');
  });

  it('refuses a line carrying BOTH a debit and a credit', () => {
    // The server throws when debitPositive === creditPositive, and the DB backs
    // it with a CHECK — so this is unsaveable even as a draft.
    expect(
      validateJournalDraft([
        { ...freshJournalLine(), accountId: 'acct-1000', debit: '500', credit: '500' },
        credit('1000'),
      ]),
    ).toBe('A line is either a debit or a credit, never both.');
  });

  it('refuses a line with an account but neither side filled', () => {
    expect(
      validateJournalDraft([
        debit('1000'),
        credit('1000'),
        { ...freshJournalLine(), accountId: 'acct-6000', debit: '', credit: '' },
      ]),
    ).toBe('Every line needs an amount on one side.');
  });
});

describe('validateJournalPost', () => {
  it('accepts a balanced entry', () => {
    expect(validateJournalPost([debit('1000'), credit('1000')])).toBe('');
  });

  it('accepts a balanced compound entry', () => {
    expect(
      validateJournalPost([debit('600'), debit('400'), credit('1000')]),
    ).toBe('');
  });

  it('refuses an entry that is one cent out', () => {
    // Exact equality, not an epsilon: the figures are typed at 2 dp and summed
    // with Decimal, so a cent out is a real mistake, not float drift.
    const message = validateJournalPost([debit('1000.00'), credit('999.99')]);
    expect(message).toMatch(/Credits are short by 0\.01/);
  });

  it('names the short side correctly in both directions', () => {
    expect(validateJournalPost([debit('1000'), credit('600')])).toMatch(
      /Credits are short by 400\.00/,
    );
    expect(validateJournalPost([debit('600'), credit('1000')])).toMatch(
      /Debits are short by 400\.00/,
    );
  });

  it('refuses an all-zero entry that isBalanced alone would accept', () => {
    // This is the case isBalanced cannot catch: it coerces blank to 0, and
    // 0 === 0, so on its own it says an empty entry balances.
    const zeroLines = [
      { ...freshJournalLine(), accountId: 'acct-1000', debit: '0', credit: '' },
      { ...freshJournalLine(), accountId: 'acct-4000', debit: '', credit: '0' },
    ];
    expect(isBalanced(['0'], ['0'])).toBe(true);
    expect(validateJournalPost(zeroLines)).not.toBe('');
  });

  it('confirms isBalanced is necessary but not sufficient', () => {
    // The companion assertion: isBalanced says a blank entry balances.
    expect(isBalanced([''], [])).toBe(true);
    expect(validateJournalPost([])).not.toBe('');
  });

  it('applies every draft rule too', () => {
    expect(validateJournalPost([debit('1000')])).toMatch(/at least two lines/);
    expect(
      validateJournalPost([
        { ...freshJournalLine(), accountId: 'acct-1000', debit: '500', credit: '500' },
        credit('500'),
      ]),
    ).toMatch(/never both/);
  });

  it('ignores untouched rows when judging the balance', () => {
    expect(
      validateJournalPost([debit('1000'), credit('1000'), freshJournalLine()]),
    ).toBe('');
  });
});

describe('canPost and canVoid', () => {
  it('posts only a draft', () => {
    expect(canPost({ status: 'draft' })).toBe(true);
    expect(canPost({ status: 'posted' })).toBe(false);
    expect(canPost({ status: 'void' })).toBe(false);
  });

  it('voids anything not already void', () => {
    // A posted entry is reversed rather than erased, so it stays voidable.
    expect(canVoid({ status: 'draft' })).toBe(true);
    expect(canVoid({ status: 'posted' })).toBe(true);
    expect(canVoid({ status: 'void' })).toBe(false);
  });
});

describe('isReversal and isOpeningBalanceEntry', () => {
  it('spots a reversing entry by its back-reference', () => {
    expect(isReversal({ reversalOfId: 'je-1' })).toBe(true);
    expect(isReversal({ reversalOfId: null })).toBe(false);
  });

  it('spots an opening-balance entry by its source type', () => {
    expect(isOpeningBalanceEntry({ sourceType: 'opening_balance' })).toBe(true);
    expect(isOpeningBalanceEntry({ sourceType: 'journal_entry' })).toBe(false);
  });
});
