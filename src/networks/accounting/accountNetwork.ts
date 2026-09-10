// ═══════════════════════════════════════════════════════
// FinMatrix Web — Accounts (lookup only)
// ═══════════════════════════════════════════════════════
// Module 15 builds the Chart of Accounts. All that exists here is the list
// call the payment form needs for its deposit-to picker — the same shape of
// dependency the invoice line editor has on inventory items.
//
// GET /accounts is `@Roles('admin','staff')`, so staff can read the chart even
// though `chartOfAccounts.manage` keeps them out of the screen. That is correct:
// they need account names to bank a payment, not the ability to edit the chart.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import { asRaw, str } from '@/serializers/documentLines';
import { toNumber } from '@/utils/money';

export type AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'revenue'
  | 'expense';

export interface Account {
  id: string;
  /** The code field is `accountNumber`, not `code`. */
  accountNumber: string;
  name: string;
  /** The field is `type`, not `accountType`. */
  type: AccountType;
  subType: string;
  balance: number;
  isActive: boolean;
  /** Computed server-side, not a column. Seeded accounts cannot be removed. */
  isSystemAccount: boolean;
}

const mapAccount = (raw: unknown): Account => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    accountNumber: str(r.accountNumber),
    name: str(r.name),
    type: (str(r.type) || 'asset') as AccountType,
    subType: str(r.subType),
    balance: toNumber(r.balance as never),
    isActive: r.isActive === undefined ? true : Boolean(r.isActive),
    isSystemAccount: Boolean(r.isSystemAccount),
  };
};

/**
 * List accounts.
 *
 * Unlike the transactional lists, this endpoint is **nested** —
 * `{accounts, summary}` with no top-level `data` key — so the envelope
 * preserves it whole. It is also unpaginated, which makes it fine for a picker.
 */
export const getAccounts = async (params?: {
  type?: AccountType;
  subType?: string;
  search?: string;
  isActive?: boolean;
}): Promise<Account[]> => {
  try {
    const response = await api.get('/accounts', { params });
    const data = unwrapEnvelope(response.data);
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(asRaw(data).accounts)
        ? (asRaw(data).accounts as unknown[])
        : Array.isArray(asRaw(data).data)
          ? (asRaw(data).data as unknown[])
          : [];
    return rows.map(mapAccount);
  } catch (e) {
    throw toApiError(e);
  }
};

/** The two asset sub-types that represent money on hand. */
export const MONEY_SUB_TYPES = ['Cash', 'Bank'] as const;

/**
 * Accounts a payment can be deposited into.
 *
 * `subType` is a single exact-match query param, so there is no one call that
 * returns Cash and Bank together — we ask for the assets and filter here.
 *
 * The filtering matters: the server validates an explicit `bankAccountId` for
 * tenant ownership ONLY. It does not check the account is an asset, or active,
 * so an unfiltered picker would happily let someone deposit a receipt into a
 * revenue account.
 */
export const getDepositAccounts = async (): Promise<Account[]> => {
  const accounts = await getAccounts({ type: 'asset', isActive: true });
  return accounts.filter(
    (a) =>
      a.isActive &&
      (MONEY_SUB_TYPES as readonly string[]).includes(a.subType),
  );
};

/**
 * Asset sub-types a bill line may legitimately be coded to, alongside every
 * expense account. Ported from the app's bill form: buying a fixed asset or
 * prepaying rent is a payable too, even though neither is an expense yet.
 */
export const BILLABLE_ASSET_SUB_TYPES = [
  'Inventory',
  'Fixed Asset',
  'Prepaid',
  'Other Asset',
] as const;

/**
 * Accounts a bill line can be coded to.
 *
 * Bill lines carry an `accountId`, not an `itemId` — a bill has no inventory
 * linkage at all. Without a supplied account the server falls back to the
 * company's COGS account, and if that lookup fails the whole bill is refused
 * with `ACCOUNT_REQUIRED`, so the form always sends one explicitly.
 */
export const getBillableAccounts = async (): Promise<Account[]> => {
  const [expenses, assets] = await Promise.all([
    getAccounts({ type: 'expense', isActive: true }),
    getAccounts({ type: 'asset', isActive: true }),
  ]);

  return [
    ...expenses.filter((a) => a.isActive),
    ...assets.filter(
      (a) =>
        a.isActive &&
        (BILLABLE_ASSET_SUB_TYPES as readonly string[]).includes(a.subType),
    ),
  ].sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
};
