// ═══════════════════════════════════════════════════════
// FinMatrix Web — Chart of Accounts model
// ═══════════════════════════════════════════════════════
// The chart every other module posts to. Admin-only: staff can READ it (they
// need account names to bank a payment) but the screen itself is out of reach.
//
// Written against the NestJS DTO and service. Three things the mobile app gets
// wrong and this does not:
//
//   * the field is `accountNumber`, not `code`, and `openingBalance`, not
//     `balance` — the app sends the wrong names and they are silently dropped,
//     so its opening balances never posted at all.
//   * `subType` is the HUMAN LABEL ('Accounts Receivable', 'Opening Balance
//     Equity'), checked by the server against `ACCOUNT_SUB_TYPES` for the
//     chosen type. The app sends snake_case values, every one of which fails
//     `INVALID_SUB_TYPE`. Because the stored value IS the label there is no
//     label↔value mapping here, and so none of the lossiness the app has when
//     it tries to recover a label for editing.
//   * there is no `normalBalance` and no `isSystemAccount` to send.
//     `isSystemAccount` comes BACK — the server computes it per request from
//     the set of accounts auto-posting depends on — but it is never an input.

import { toDecimal } from '@/utils/money';

export type AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'revenue'
  | 'expense';

export interface Account {
  id: string;
  /** The code field is `accountNumber`, not `code`. Immutable after creation. */
  accountNumber: string;
  name: string;
  /** The field is `type`, not `accountType`. Immutable after creation. */
  type: AccountType;
  /** A human label from `ACCOUNT_SUB_TYPES`, not a slug. */
  subType: string;
  parentId: string | null;
  description: string;
  /** What the account started at. Set once, on creation. */
  openingBalance: number;
  /** Current balance, moved by postings. Never written directly. */
  balance: number;
  isActive: boolean;
  /**
   * Computed server-side per request, not a column: true for the accounts
   * auto-posting depends on. Read-only — never sent.
   */
  isSystemAccount: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountFormData {
  accountNumber: string;
  name: string;
  type: AccountType;
  subType: string;
  parentId: string;
  description: string;
  /** Create only — `update()` does not read it. */
  openingBalance: string;
  isActive: boolean;
}

/** Statement order: balance sheet first, then income statement. */
export const ACCOUNT_TYPE_ORDER: readonly AccountType[] = [
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses',
};

/** Singular, for a form label or a single account's description. */
export const ACCOUNT_TYPE_SINGULAR: Record<AccountType, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expense',
};

/**
 * Plain-English help, because "asset" and "equity" are not words most people
 * running a warehouse use. The app shows the bare enum.
 */
export const ACCOUNT_TYPE_HINTS: Record<AccountType, string> = {
  asset: 'What the business owns — cash, stock, money owed to you.',
  liability: 'What the business owes — suppliers, tax, loans.',
  equity: "The owner's stake — money put in, profit kept in.",
  revenue: 'Money the business earns.',
  expense: 'What it costs to run — rent, wages, goods sold.',
};

/**
 * An exact mirror of the server's `ACCOUNT_SUB_TYPES`. These strings are sent
 * verbatim and compared with `includes()`, so a typo here is a 400, not a
 * mislabel — which is why this list is duplicated rather than derived.
 */
export const ACCOUNT_SUB_TYPES: Record<AccountType, readonly string[]> = {
  asset: [
    'Cash',
    'Bank',
    'Accounts Receivable',
    'Inventory',
    'Prepaid',
    'Fixed Asset',
    'Other Asset',
  ],
  liability: [
    'Accounts Payable',
    'Credit Card',
    'Payroll Liability',
    'Tax Payable',
    'Notes Payable',
    'Other Liability',
  ],
  equity: [
    'Owner Equity',
    'Retained Earnings',
    'Owner Draws',
    'Opening Balance Equity',
    'Other Equity',
  ],
  revenue: ['Sales', 'Service', 'Interest', 'Other Revenue'],
  expense: [
    'Cost of Goods',
    'Operating',
    'Payroll',
    'Tax',
    'Depreciation',
    'Other Expense',
  ],
};

export const isValidSubType = (type: AccountType, subType: string): boolean =>
  ACCOUNT_SUB_TYPES[type].includes(subType);

/** The sub-type is both the value and the label, so one list serves both. */
export const subTypeOptions = (
  type: AccountType,
): { value: string; label: string }[] =>
  ACCOUNT_SUB_TYPES[type].map((s) => ({ value: s, label: s }));

/**
 * Which way a type's balance runs. Asset and expense grow with a debit;
 * everything else grows with a credit.
 *
 * Not a field — the server has no `normalBalance` column and derives this the
 * same way when it posts an opening balance. It is here to EXPLAIN a figure,
 * never to be sent.
 */
export const normalBalanceFor = (type: AccountType): 'debit' | 'credit' =>
  type === 'asset' || type === 'expense' ? 'debit' : 'credit';

// ═══════════════════════════════════════════════════════
// Numbering
// ═══════════════════════════════════════════════════════

/**
 * The numbering convention, taken from the chart the server seeds: assets
 * 1000–1999, liabilities 2000–2999, equity 3000–3999, revenue 4000–4999,
 * expenses 5000–7999.
 *
 * **The server does not check this.** It validates only that the number is at
 * least 2 characters and unique within the company. So this is a convention the
 * client is the sole keeper of — which is the argument for enforcing it here,
 * not for treating it as advisory: a 1500 expense account sorts into the middle
 * of the assets on every report that orders by number, and nothing downstream
 * will ever complain.
 */
export const ACCOUNT_TYPE_RANGES: Record<
  AccountType,
  { min: number; max: number }
> = {
  asset: { min: 1000, max: 1999 },
  liability: { min: 2000, max: 2999 },
  equity: { min: 3000, max: 3999 },
  revenue: { min: 4000, max: 4999 },
  expense: { min: 5000, max: 7999 },
};

export const accountNumberRangeText = (type: AccountType): string => {
  const { min, max } = ACCOUNT_TYPE_RANGES[type];
  return `${min}–${max}`;
};

export const isAccountNumberInRange = (
  accountNumber: string,
  type: AccountType,
): boolean => {
  if (!/^\d+$/.test(accountNumber)) return false;
  const n = Number(accountNumber);
  const { min, max } = ACCOUNT_TYPE_RANGES[type];
  return n >= min && n <= max;
};

/**
 * Free numbers to offer for a new account, derived from the chart the company
 * actually has rather than from a hard-coded table of sub-type ranges.
 *
 * It starts just past the highest number already used by this sub-type — so a
 * second Bank account lands beside the first rather than at the top of the
 * assets — and falls back to the type's base when the sub-type is new. Steps of
 * 10 leave room to slot related accounts in later, which is why the seeded
 * chart is spaced that way.
 */
export const suggestAccountNumbers = (
  type: AccountType,
  subType: string,
  accounts: readonly Pick<Account, 'accountNumber' | 'type' | 'subType'>[],
  count = 5,
): string[] => {
  const { min, max } = ACCOUNT_TYPE_RANGES[type];
  const used = new Set(accounts.map((a) => a.accountNumber));

  const sameSubType = accounts
    .filter((a) => a.type === type && a.subType === subType)
    .map((a) => Number(a.accountNumber))
    .filter((n) => Number.isFinite(n) && n >= min && n <= max);

  // Round up to the next multiple of 10 so suggestions stay on the grid.
  const highest = sameSubType.length > 0 ? Math.max(...sameSubType) : null;
  const start =
    highest === null ? min : Math.floor(highest / 10) * 10 + 10;

  const out: string[] = [];
  for (let n = Math.max(start, min); n <= max && out.length < count; n += 10) {
    const candidate = String(n);
    if (!used.has(candidate)) out.push(candidate);
  }

  // A sub-type crowded up against the top of its range still needs an answer,
  // so fall back to sweeping the whole range one at a time.
  if (out.length === 0) {
    for (let n = min; n <= max && out.length < count; n += 1) {
      const candidate = String(n);
      if (!used.has(candidate)) out.push(candidate);
    }
  }

  return out;
};

export const nextAccountNumber = (
  type: AccountType,
  subType: string,
  accounts: readonly Pick<Account, 'accountNumber' | 'type' | 'subType'>[],
): string => suggestAccountNumbers(type, subType, accounts, 1)[0] ?? '';

// ═══════════════════════════════════════════════════════
// Tree
// ═══════════════════════════════════════════════════════

export interface AccountNode {
  account: Account;
  depth: number;
  children: AccountNode[];
}

export interface AccountTypeGroup {
  type: AccountType;
  label: string;
  roots: AccountNode[];
  /** Every account of this type, nesting ignored. */
  count: number;
  /** Straight sum of the accounts' own balances — NOT a roll-up. */
  total: number;
}

/**
 * The parent this account can actually be drawn under, or null for a root.
 *
 * Three ways a stored `parentId` is unusable, and all three make the account a
 * root rather than hiding it. An account that vanishes from the chart because
 * of a bad pointer is far worse than one drawn at the wrong indent:
 *   - the parent is not in the list (deleted, or filtered out by a search)
 *   - the parent is a different type, so it is not even in this group
 *   - following the chain comes back to this account — a cycle
 */
const effectiveParentId = (
  account: Account,
  byId: Map<string, Account>,
): string | null => {
  if (!account.parentId || account.parentId === account.id) return null;

  const parent = byId.get(account.parentId);
  if (!parent || parent.type !== account.type) return null;

  const seen = new Set<string>([account.id]);
  let cursor: Account | undefined = parent;
  while (cursor) {
    if (seen.has(cursor.id)) return null;
    seen.add(cursor.id);
    if (!cursor.parentId) break;
    cursor = byId.get(cursor.parentId);
  }

  return account.parentId;
};

const byNumber = (a: Account, b: Account) =>
  a.accountNumber.localeCompare(b.accountNumber, undefined, { numeric: true });

/**
 * Group by type in statement order, nest by parent, order siblings by number.
 *
 * Parent balances are NOT rolled up: the server's own summary sums every
 * account flat, and showing a parent holding its children's money would
 * disagree with both that summary and the Balance Sheet.
 */
export const buildAccountTree = (
  accounts: readonly Account[],
): AccountTypeGroup[] => {
  const byId = new Map(accounts.map((a) => [a.id, a]));

  const childrenOf = new Map<string, Account[]>();
  const rootsOf = new Map<AccountType, Account[]>();

  for (const account of accounts) {
    const parentId = effectiveParentId(account, byId);
    if (parentId) {
      const siblings = childrenOf.get(parentId);
      if (siblings) siblings.push(account);
      else childrenOf.set(parentId, [account]);
    } else {
      const roots = rootsOf.get(account.type);
      if (roots) roots.push(account);
      else rootsOf.set(account.type, [account]);
    }
  }

  const toNode = (account: Account, depth: number): AccountNode => ({
    account,
    depth,
    children: (childrenOf.get(account.id) ?? [])
      .slice()
      .sort(byNumber)
      .map((child) => toNode(child, depth + 1)),
  });

  return ACCOUNT_TYPE_ORDER.filter((type) =>
    accounts.some((a) => a.type === type),
  ).map((type) => {
    const ofType = accounts.filter((a) => a.type === type);
    return {
      type,
      label: ACCOUNT_TYPE_LABELS[type],
      roots: (rootsOf.get(type) ?? []).slice().sort(byNumber).map((a) => toNode(a, 0)),
      count: ofType.length,
      total: ofType.reduce((sum, a) => sum + a.balance, 0),
    };
  });
};

/** Flatten a group's tree back into render order, indents preserved. */
export const flattenAccountNodes = (nodes: readonly AccountNode[]): AccountNode[] =>
  nodes.flatMap((node) => [node, ...flattenAccountNodes(node.children)]);

/**
 * Everything below this account. Used to keep the parent picker from offering a
 * choice that would make a loop — which the server does not check, and which
 * would orphan the whole subtree from the chart.
 */
export const descendantIds = (
  accounts: readonly Account[],
  accountId: string,
): Set<string> => {
  const out = new Set<string>();
  const queue = [accountId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const a of accounts) {
      if (a.parentId === current && !out.has(a.id)) {
        out.add(a.id);
        queue.push(a.id);
      }
    }
  }
  return out;
};

/**
 * Accounts that may parent this one: same type, not itself, not below it.
 *
 * Same type because a sub-account of a different type would be drawn in another
 * section of the chart and roll up into the wrong statement line.
 */
export const parentOptionsFor = (
  accounts: readonly Account[],
  type: AccountType,
  editingId: string,
): { value: string; label: string }[] => {
  const barred = editingId ? descendantIds(accounts, editingId) : new Set<string>();
  return accounts
    .filter((a) => a.type === type && a.id !== editingId && !barred.has(a.id))
    .slice()
    .sort(byNumber)
    .map((a) => ({ value: a.id, label: `${a.accountNumber} · ${a.name}` }));
};

// ═══════════════════════════════════════════════════════
// Deactivation
// ═══════════════════════════════════════════════════════

export interface DeactivationCheck {
  allowed: boolean;
  reason: string;
}

/**
 * Whether this account can be switched off, and if not, why.
 *
 * Both refusals mirror `assertCanDeactivate` server-side. Checking them here is
 * not belt-and-braces: the alternative is a button that looks available and
 * answers with a 400 naming an account the user was not thinking about.
 * Re-activating is always allowed.
 */
export const checkDeactivation = (
  account: Pick<Account, 'accountNumber' | 'name' | 'balance' | 'isSystemAccount' | 'isActive'>,
): DeactivationCheck => {
  if (!account.isActive) return { allowed: true, reason: '' };

  if (account.isSystemAccount) {
    return {
      allowed: false,
      reason:
        'Invoices, payments, bills, tax and payroll post to this account ' +
        'automatically, so it has to stay switched on.',
    };
  }

  if (Math.abs(account.balance) >= 0.01) {
    return {
      allowed: false,
      reason:
        'This account still holds a balance. Move it elsewhere first — ' +
        'switching the account off would leave that money on the Balance ' +
        'Sheet with no way to correct it.',
    };
  }

  return { allowed: true, reason: '' };
};

// ═══════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════

/**
 * Field errors for the account form, keyed by field name. Empty means valid.
 *
 * `isEditing` turns off the two immutable fields' rules: the server ignores
 * `accountNumber` and `type` on update, so validating them would block a save
 * over a value the user cannot change.
 */
export const validateAccountForm = (
  form: AccountFormData,
  accounts: readonly Pick<Account, 'id' | 'accountNumber'>[],
  options: { isEditing: boolean; editingId?: string } = { isEditing: false },
): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (!options.isEditing) {
    const number = form.accountNumber.trim();
    if (!number) {
      errors.accountNumber = 'Account number is required';
    } else if (!/^\d+$/.test(number)) {
      errors.accountNumber = 'Use digits only';
    } else if (number.length < 2) {
      // Mirrors the DTO's @MinLength(2).
      errors.accountNumber = 'Use at least 2 digits';
    } else if (
      accounts.some(
        (a) => a.accountNumber === number && a.id !== options.editingId,
      )
    ) {
      errors.accountNumber = 'That number is already used';
    } else if (!isAccountNumberInRange(number, form.type)) {
      errors.accountNumber = `${ACCOUNT_TYPE_LABELS[form.type]} run from ${accountNumberRangeText(form.type)}`;
    }
  }

  const name = form.name.trim();
  if (!name) errors.name = 'Name is required';
  else if (name.length < 2) errors.name = 'Use at least 2 characters';

  if (!form.subType) {
    errors.subType = 'Choose what kind of account this is';
  } else if (!isValidSubType(form.type, form.subType)) {
    // Reachable by changing type after choosing a sub-type.
    errors.subType = `Not a valid kind of ${ACCOUNT_TYPE_SINGULAR[form.type].toLowerCase()} account`;
  }

  if (form.parentId && form.parentId === options.editingId) {
    errors.parentId = 'An account cannot be its own parent';
  }

  if (form.openingBalance.trim() !== '') {
    if (!/^-?\d*\.?\d+$/.test(form.openingBalance.trim())) {
      errors.openingBalance = 'Enter a number';
    }
  }

  return errors;
};

/** A blank form, typed so the sub-type starts cleared rather than guessed. */
export const emptyAccountForm = (
  type: AccountType = 'expense',
): AccountFormData => ({
  accountNumber: '',
  name: '',
  type,
  subType: '',
  parentId: '',
  description: '',
  openingBalance: '',
  isActive: true,
});

export const accountToFormData = (account: Account): AccountFormData => ({
  accountNumber: account.accountNumber,
  name: account.name,
  type: account.type,
  subType: account.subType,
  parentId: account.parentId ?? '',
  description: account.description,
  // Shown but locked on edit: the opening balance already posted its journal
  // entry, and `update()` never reads the field.
  openingBalance: toDecimal(account.openingBalance).toFixed(2),
  isActive: account.isActive,
});

/** Account 3900, which every opening balance offsets against. */
export const ACCT_OPENING_BALANCE_EQUITY = '3900';
