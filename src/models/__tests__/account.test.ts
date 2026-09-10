import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_SUB_TYPES,
  ACCOUNT_TYPE_ORDER,
  accountNumberRangeText,
  buildAccountTree,
  checkDeactivation,
  descendantIds,
  emptyAccountForm,
  flattenAccountNodes,
  isAccountNumberInRange,
  isValidSubType,
  nextAccountNumber,
  normalBalanceFor,
  parentOptionsFor,
  suggestAccountNumbers,
  validateAccountForm,
  type Account,
  type AccountFormData,
  type AccountType,
} from '@/models/account';

const account = (over: Partial<Account> = {}): Account => ({
  id: 'a-1',
  accountNumber: '6000',
  name: 'Rent Expense',
  type: 'expense',
  subType: 'Operating',
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

const form = (over: Partial<AccountFormData> = {}): AccountFormData => ({
  ...emptyAccountForm('expense'),
  accountNumber: '6500',
  name: 'Marketing',
  subType: 'Operating',
  ...over,
});

describe('ACCOUNT_SUB_TYPES', () => {
  // These strings are compared with includes() server-side, so a typo is a 400
  // rather than a mislabel. The seeded chart is the proof they are exact.
  it('covers every account type', () => {
    for (const type of ACCOUNT_TYPE_ORDER) {
      expect(ACCOUNT_SUB_TYPES[type].length).toBeGreaterThan(0);
    }
  });

  it('holds the sub-types the seeded chart actually uses', () => {
    const seeded: [AccountType, string][] = [
      ['asset', 'Cash'],
      ['asset', 'Bank'],
      ['asset', 'Accounts Receivable'],
      ['asset', 'Inventory'],
      ['asset', 'Other Asset'],
      ['liability', 'Accounts Payable'],
      ['liability', 'Tax Payable'],
      ['liability', 'Other Liability'],
      ['equity', 'Owner Equity'],
      ['equity', 'Retained Earnings'],
      ['equity', 'Opening Balance Equity'],
      ['revenue', 'Sales'],
      ['expense', 'Cost of Goods'],
      ['expense', 'Operating'],
      ['expense', 'Payroll'],
    ];
    for (const [type, subType] of seeded) {
      expect(isValidSubType(type, subType)).toBe(true);
    }
  });

  it('rejects a sub-type borrowed from another type', () => {
    expect(isValidSubType('expense', 'Cash')).toBe(false);
    expect(isValidSubType('asset', 'Operating')).toBe(false);
  });

  it('rejects the snake_case values the mobile app sends', () => {
    // Every one of these fails INVALID_SUB_TYPE server-side.
    expect(isValidSubType('asset', 'accounts_receivable')).toBe(false);
    expect(isValidSubType('equity', 'opening_balance_equity')).toBe(false);
  });
});

describe('normalBalanceFor', () => {
  it('is debit for asset and expense', () => {
    expect(normalBalanceFor('asset')).toBe('debit');
    expect(normalBalanceFor('expense')).toBe('debit');
  });

  it('is credit for liability, equity and revenue', () => {
    expect(normalBalanceFor('liability')).toBe('credit');
    expect(normalBalanceFor('equity')).toBe('credit');
    expect(normalBalanceFor('revenue')).toBe('credit');
  });
});

describe('isAccountNumberInRange', () => {
  it('accepts the seeded chart’s own numbers', () => {
    expect(isAccountNumberInRange('1000', 'asset')).toBe(true);
    expect(isAccountNumberInRange('2000', 'liability')).toBe(true);
    expect(isAccountNumberInRange('3900', 'equity')).toBe(true);
    expect(isAccountNumberInRange('4000', 'revenue')).toBe(true);
    expect(isAccountNumberInRange('6400', 'expense')).toBe(true);
  });

  it('refuses a number belonging to another type’s range', () => {
    expect(isAccountNumberInRange('1500', 'expense')).toBe(false);
    expect(isAccountNumberInRange('6000', 'asset')).toBe(false);
  });

  it('refuses a non-numeric number', () => {
    expect(isAccountNumberInRange('60A0', 'expense')).toBe(false);
    expect(isAccountNumberInRange('', 'expense')).toBe(false);
  });

  it('names the range in words for the error message', () => {
    expect(accountNumberRangeText('expense')).toBe('5000–7999');
  });
});

describe('suggestAccountNumbers', () => {
  const chart = [
    account({ id: 'a', accountNumber: '1000', type: 'asset', subType: 'Cash' }),
    account({ id: 'b', accountNumber: '1010', type: 'asset', subType: 'Bank' }),
    account({ id: 'c', accountNumber: '6000', type: 'expense', subType: 'Operating' }),
    account({ id: 'd', accountNumber: '6100', type: 'expense', subType: 'Operating' }),
  ];

  it('continues past the highest number of the same sub-type', () => {
    // Operating tops out at 6100, so the next is 6110 — beside its siblings
    // rather than at the top of the expenses.
    expect(suggestAccountNumbers('expense', 'Operating', chart, 2)).toEqual([
      '6110',
      '6120',
    ]);
  });

  it('starts at the type base for a sub-type with no accounts yet', () => {
    expect(suggestAccountNumbers('expense', 'Depreciation', chart, 2)).toEqual([
      '5000',
      '5010',
    ]);
  });

  it('skips numbers already used', () => {
    // 5000 is taken by COGS, so the sweep from the base steps over it.
    const withCogs = [
      ...chart,
      account({ id: 'e', accountNumber: '5000', type: 'expense', subType: 'Cost of Goods' }),
    ];
    expect(suggestAccountNumbers('expense', 'Tax', withCogs, 1)).toEqual(['5010']);
  });

  it('never leaves the type’s range', () => {
    const suggestions = suggestAccountNumbers('revenue', 'Sales', chart, 5);
    for (const s of suggestions) {
      expect(isAccountNumberInRange(s, 'revenue')).toBe(true);
    }
  });

  it('ignores an out-of-range account when finding the highest', () => {
    // A bad 9000 expense account must not push suggestions outside 5000–7999.
    const skewed = [
      account({ id: 'x', accountNumber: '9000', type: 'expense', subType: 'Operating' }),
    ];
    expect(isAccountNumberInRange(nextAccountNumber('expense', 'Operating', skewed), 'expense')).toBe(
      true,
    );
  });

  it('still answers when the 10-step grid is exhausted', () => {
    // Every multiple of 10 in the revenue range taken: fall back to a 1-step
    // sweep rather than returning nothing.
    const packed: Account[] = [];
    for (let n = 4000; n <= 4990; n += 10) {
      packed.push(account({ id: `r${n}`, accountNumber: String(n), type: 'revenue', subType: 'Sales' }));
    }
    const next = nextAccountNumber('revenue', 'Sales', packed);
    expect(next).toBe('4001');
    expect(isAccountNumberInRange(next, 'revenue')).toBe(true);
  });

  it('gives the first suggestion as nextAccountNumber', () => {
    expect(nextAccountNumber('expense', 'Operating', chart)).toBe('6110');
  });
});

describe('buildAccountTree', () => {
  it('groups by type in statement order, skipping empty types', () => {
    const groups = buildAccountTree([
      account({ id: 'e', accountNumber: '6000', type: 'expense' }),
      account({ id: 'a', accountNumber: '1000', type: 'asset', subType: 'Cash' }),
      account({ id: 'r', accountNumber: '4000', type: 'revenue', subType: 'Sales' }),
    ]);
    expect(groups.map((g) => g.type)).toEqual(['asset', 'revenue', 'expense']);
  });

  it('orders siblings by number, numerically', () => {
    const groups = buildAccountTree([
      account({ id: 'b', accountNumber: '6100' }),
      account({ id: 'a', accountNumber: '6000' }),
      account({ id: 'c', accountNumber: '6020' }),
    ]);
    expect(groups[0].roots.map((n) => n.account.accountNumber)).toEqual([
      '6000',
      '6020',
      '6100',
    ]);
  });

  it('nests children under their parent and records the depth', () => {
    const groups = buildAccountTree([
      account({ id: 'parent', accountNumber: '6000' }),
      account({ id: 'child', accountNumber: '6010', parentId: 'parent' }),
      account({ id: 'grandchild', accountNumber: '6011', parentId: 'child' }),
    ]);

    const flat = flattenAccountNodes(groups[0].roots);
    expect(flat.map((n) => [n.account.id, n.depth])).toEqual([
      ['parent', 0],
      ['child', 1],
      ['grandchild', 2],
    ]);
  });

  it('surfaces an account whose parent is missing as a root', () => {
    // A bad parentId must never make an account disappear from the chart.
    const groups = buildAccountTree([
      account({ id: 'orphan', accountNumber: '6010', parentId: 'gone' }),
    ]);
    expect(groups[0].roots.map((n) => n.account.id)).toEqual(['orphan']);
  });

  it('surfaces an account whose parent is a different type as a root', () => {
    const groups = buildAccountTree([
      account({ id: 'asset', accountNumber: '1000', type: 'asset', subType: 'Cash' }),
      account({ id: 'expense', accountNumber: '6000', type: 'expense', parentId: 'asset' }),
    ]);
    const expenseGroup = groups.find((g) => g.type === 'expense')!;
    expect(expenseGroup.roots.map((n) => n.account.id)).toEqual(['expense']);
  });

  it('survives a two-account cycle without losing either or hanging', () => {
    const groups = buildAccountTree([
      account({ id: 'a', accountNumber: '6000', parentId: 'b' }),
      account({ id: 'b', accountNumber: '6100', parentId: 'a' }),
    ]);
    expect(groups[0].roots.map((n) => n.account.id).sort()).toEqual(['a', 'b']);
  });

  it('survives an account parented to itself', () => {
    const groups = buildAccountTree([
      account({ id: 'self', accountNumber: '6000', parentId: 'self' }),
    ]);
    expect(groups[0].roots).toHaveLength(1);
  });

  it('counts every account of a type, nesting included', () => {
    const groups = buildAccountTree([
      account({ id: 'parent', accountNumber: '6000' }),
      account({ id: 'child', accountNumber: '6010', parentId: 'parent' }),
    ]);
    expect(groups[0].count).toBe(2);
  });

  it('sums balances flat — a parent does not absorb its children', () => {
    // The server's own summary sums every account flat; rolling up here would
    // disagree with it and with the Balance Sheet.
    const groups = buildAccountTree([
      account({ id: 'parent', accountNumber: '6000', balance: 100 }),
      account({ id: 'child', accountNumber: '6010', parentId: 'parent', balance: 50 }),
    ]);
    expect(groups[0].total).toBe(150);
    expect(groups[0].roots[0].account.balance).toBe(100);
  });

  it('is empty for an empty chart', () => {
    expect(buildAccountTree([])).toEqual([]);
  });
});

describe('descendantIds and parentOptionsFor', () => {
  const chart = [
    account({ id: 'parent', accountNumber: '6000' }),
    account({ id: 'child', accountNumber: '6010', parentId: 'parent' }),
    account({ id: 'grandchild', accountNumber: '6011', parentId: 'child' }),
    account({ id: 'other', accountNumber: '6200' }),
  ];

  it('walks the whole subtree', () => {
    expect([...descendantIds(chart, 'parent')].sort()).toEqual([
      'child',
      'grandchild',
    ]);
  });

  it('is empty for a leaf', () => {
    expect(descendantIds(chart, 'grandchild').size).toBe(0);
  });

  it('offers same-type accounts as parents', () => {
    expect(parentOptionsFor(chart, 'expense', '').map((o) => o.value)).toEqual([
      'parent',
      'child',
      'grandchild',
      'other',
    ]);
  });

  it('never offers the account itself or anything below it', () => {
    // Picking a descendant would make a loop, which the server does not check
    // and which would orphan the subtree from the chart.
    const values = parentOptionsFor(chart, 'expense', 'parent').map((o) => o.value);
    expect(values).toEqual(['other']);
  });

  it('offers nothing from another type', () => {
    expect(parentOptionsFor(chart, 'asset', '')).toEqual([]);
  });
});

describe('checkDeactivation', () => {
  it('allows an ordinary empty account to be switched off', () => {
    expect(checkDeactivation(account()).allowed).toBe(true);
  });

  it('refuses a system account and says why', () => {
    const check = checkDeactivation(
      account({ accountNumber: '1000', name: 'Cash', isSystemAccount: true }),
    );
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/automatically/);
  });

  it('refuses an account still holding a balance', () => {
    const check = checkDeactivation(account({ balance: 250 }));
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/Balance Sheet/);
  });

  it('refuses a negative balance too', () => {
    expect(checkDeactivation(account({ balance: -250 })).allowed).toBe(false);
  });

  it('ignores rounding dust', () => {
    expect(checkDeactivation(account({ balance: 0.001 })).allowed).toBe(true);
  });

  it('always allows re-activating', () => {
    // Re-activating is unguarded server-side, balance or not.
    expect(
      checkDeactivation(
        account({ isActive: false, balance: 500, isSystemAccount: true }),
      ).allowed,
    ).toBe(true);
  });
});

describe('validateAccountForm', () => {
  const chart = [{ id: 'existing', accountNumber: '6000' }];

  it('accepts a complete form', () => {
    expect(validateAccountForm(form(), chart)).toEqual({});
  });

  it('requires an account number', () => {
    expect(validateAccountForm(form({ accountNumber: '' }), chart).accountNumber).toBe(
      'Account number is required',
    );
  });

  it('requires digits only', () => {
    expect(validateAccountForm(form({ accountNumber: '65A0' }), chart).accountNumber).toBe(
      'Use digits only',
    );
  });

  it('requires at least 2 digits, mirroring the DTO', () => {
    expect(validateAccountForm(form({ accountNumber: '6' }), chart).accountNumber).toBe(
      'Use at least 2 digits',
    );
  });

  it('refuses a number already in the chart', () => {
    expect(validateAccountForm(form({ accountNumber: '6000' }), chart).accountNumber).toBe(
      'That number is already used',
    );
  });

  it('refuses a number outside the type’s range, naming the range', () => {
    // The server does NOT check this, so the client is the only keeper of it.
    expect(
      validateAccountForm(form({ accountNumber: '1500' }), chart).accountNumber,
    ).toBe('Expenses run from 5000–7999');
  });

  it('requires a name of at least 2 characters', () => {
    expect(validateAccountForm(form({ name: '' }), chart).name).toBe(
      'Name is required',
    );
    expect(validateAccountForm(form({ name: 'A' }), chart).name).toBe(
      'Use at least 2 characters',
    );
  });

  it('requires a sub-type', () => {
    expect(validateAccountForm(form({ subType: '' }), chart).subType).toBeTruthy();
  });

  it('catches a sub-type left over from a different type', () => {
    // Reachable by choosing Operating, then switching the type to Asset.
    expect(
      validateAccountForm(form({ type: 'asset', accountNumber: '1500' }), chart)
        .subType,
    ).toBeTruthy();
  });

  it('refuses an account as its own parent', () => {
    expect(
      validateAccountForm(form({ parentId: 'me' }), chart, {
        isEditing: true,
        editingId: 'me',
      }).parentId,
    ).toBeTruthy();
  });

  it('accepts a blank opening balance', () => {
    expect(validateAccountForm(form({ openingBalance: '' }), chart)).toEqual({});
  });

  it('accepts a negative opening balance', () => {
    // A credit-normal account opened the other way round is legitimate.
    expect(
      validateAccountForm(form({ openingBalance: '-500.25' }), chart),
    ).toEqual({});
  });

  it('refuses an unparseable opening balance', () => {
    expect(
      validateAccountForm(form({ openingBalance: '1,000' }), chart).openingBalance,
    ).toBe('Enter a number');
  });

  it('skips the immutable number rules when editing', () => {
    // accountNumber is immutable on update, so validating it would block a save
    // over a value the user cannot change — including its own duplicate.
    const errors = validateAccountForm(
      form({ accountNumber: '6000' }),
      chart,
      { isEditing: true, editingId: 'existing' },
    );
    expect(errors.accountNumber).toBe(undefined);
  });
});
