import { describe, expect, it } from 'vitest';

import type { Account } from '@/models/account';
import { pickAccount } from '@/pages/journalEntries/OpeningBalancePage';

const acct = (over: Partial<Account>): Account => ({
  id: 'x',
  accountNumber: '9999',
  name: 'x',
  type: 'asset',
  subType: 'Other Asset',
  parentId: null,
  description: '',
  openingBalance: 0,
  balance: 0,
  isActive: true,
  isSystemAccount: false,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('opening balance shortcuts', () => {
  it('find Cash by its role, wherever a migration has numbered it', () => {
    const chart = [
      acct({ id: 'bank', accountNumber: '1000', name: 'Checking', subType: 'Bank', systemRole: 'bank' }),
      acct({ id: 'cash', accountNumber: '10100', name: 'Cash on Hand', subType: 'Cash', systemRole: 'cash' }),
    ];
    // 1000 is the owner's checking account now: the role wins over the old number.
    expect(pickAccount(chart, { roles: ['cash'], codes: ['1000'] })?.id).toBe('cash');
  });

  it('fall back to the default number when the server sends no roles', () => {
    const chart = [acct({ id: 'cash', accountNumber: '1000', name: 'Cash', subType: 'Cash' })];
    expect(pickAccount(chart, { roles: ['cash'], codes: ['1000'] })?.id).toBe('cash');
  });
});
