import { describe, expect, it } from 'vitest';

import {
  describeAccountKind,
  isMoneyAccount,
  misfiledMoneyAccounts,
  moneyAccountLabel,
  suggestAccountNumbers,
  suggestedMoneyKind,
  validateAccountForm,
  emptyAccountForm,
  type Account,
} from '@/models/account';

const account = (over: Partial<Account>): Account => ({
  id: 'a',
  accountNumber: '1000',
  name: 'Cash',
  type: 'asset',
  subType: 'Cash',
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

const CHART: Account[] = [
  account({ id: 'cash', accountNumber: '1000', name: 'Cash', subType: 'Cash', isSystemAccount: true }),
  account({ id: 'bank', accountNumber: '1010', name: 'Business Checking', subType: 'Bank', isSystemAccount: true }),
  account({ id: 'ar', accountNumber: '1100', name: 'Accounts Receivable', subType: 'Accounts Receivable' }),
  account({ id: 'meezan', accountNumber: '5010', name: 'MEEZAN BANK', type: 'expense', subType: 'Other Expense' }),
  account({ id: 'fees', accountNumber: '6450', name: 'Bank Charges', type: 'expense', subType: 'Operating' }),
  account({ id: 'old', accountNumber: '1040', name: 'Closed Bank', subType: 'Bank', isActive: false }),
];

describe('isMoneyAccount — exactly what the server lets a payment use', () => {
  it('is an active asset of kind Cash or Bank', () => {
    expect(isMoneyAccount(CHART[0])).toBe(true);
    expect(isMoneyAccount(CHART[1])).toBe(true);
  });

  it('is not receivables, an expense, or a closed bank', () => {
    expect(isMoneyAccount(CHART[2])).toBe(false);
    expect(isMoneyAccount(CHART[3])).toBe(false);
    expect(isMoneyAccount(CHART[5])).toBe(false);
  });
});

describe('suggestedMoneyKind — a name that reads like a bank or cash account', () => {
  it.each([
    ['MEEZAN BANK', 'Bank'],
    ['MCB Current Account', 'Bank'],
    ['Allied Bank Ltd', 'Bank'],
    ['HBL', 'Bank'],
    ['Bank Al Habib', 'Bank'],
    ['JazzCash wallet', 'Bank'],
    ['Petty Cash', 'Cash'],
    ['Cash in hand', 'Cash'],
  ])('%s → %s', (name, kind) => {
    expect(suggestedMoneyKind(name)).toBe(kind);
  });

  it.each([
    'Bank Charges',
    'Bank service fees',
    'MCB Loan',
    'Meezan Car Ijarah',
    'HBL Credit Card',
    'Rent Expense',
    'Cash Discount',
    'Habibullah Traders',
    '',
  ])('%s is not one', (name) => {
    expect(suggestedMoneyKind(name)).toBe(null);
  });
});

describe('misfiledMoneyAccounts — why "Meezan Bank" is missing from Pay from', () => {
  it('names a bank saved as an expense, and nothing that is fine', () => {
    expect(misfiledMoneyAccounts(CHART).map((a) => a.id)).toEqual(['meezan']);
  });

  it('says how it is set up now', () => {
    expect(describeAccountKind(CHART[3])).toBe('an Expense (Other Expense)');
    expect(describeAccountKind(account({ type: 'liability', subType: 'Other Liability' }))).toBe(
      'a Liability (Other Liability)',
    );
  });
});

describe('moneyAccountLabel — where a payment went', () => {
  it('names the account', () => {
    expect(moneyAccountLabel(CHART, 'bank')).toBe('1010 · Business Checking');
  });

  it('reads a record from before the choice as Cash', () => {
    expect(moneyAccountLabel(CHART, null)).toBe('1000 · Cash');
  });
});

describe('a new bank account is numbered beside the others', () => {
  it('suggests 1020 after 1010', () => {
    const open = CHART.filter((a) => a.id !== 'old');
    expect(suggestAccountNumbers('asset', 'Bank', open, 3)).toEqual(['1020', '1030', '1040']);
  });

  it('goes past a closed bank, which still owns its number', () => {
    expect(suggestAccountNumbers('asset', 'Bank', CHART, 3)).toEqual(['1050', '1060', '1070']);
  });
});

describe('validateAccountForm on an account whose type may still change', () => {
  const form = {
    ...emptyAccountForm('asset'),
    name: 'Meezan Bank',
    subType: 'Bank',
    accountNumber: '5010',
  };

  it('checks the number against the new type when the structure is editable', () => {
    expect(
      validateAccountForm(form, CHART, { isEditing: true, editingId: 'meezan', structureEditable: true })
        .accountNumber,
    ).toMatch(/1000–1999/);
  });

  it('leaves a fixed number alone', () => {
    expect(
      validateAccountForm(form, CHART, { isEditing: true, editingId: 'meezan' }).accountNumber,
    ).toBeUndefined();
  });
});
