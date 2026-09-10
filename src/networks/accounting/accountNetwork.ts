// ═══════════════════════════════════════════════════════
// FinMatrix Web — Chart of Accounts
// ═══════════════════════════════════════════════════════
// Reads are `@Roles('admin','staff')`; every write is `@Roles('admin')`. That
// split is deliberate and not a maker-checker case: staff need account names to
// bank a payment or code a bill line, but the chart itself is an owner's
// document, so there is no approval path here — `chartOfAccounts.manage` is
// REFUSED for staff rather than REQUEST, and the route is absent from their nav.

import type { Account, AccountFormData, AccountType } from '@/models/account';
import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  accountDetailSerializer,
  accountFormToCreatePayload,
  accountFormToUpdatePayload,
  accountListSerializer,
  mapAccount,
  mapAccountLedgerRow,
  type AccountLedgerRow,
  type AccountSummary,
} from '@/serializers/accountSerializer';
import { asRaw } from '@/serializers/documentLines';
import { toNumber } from '@/utils/money';

// Re-exported so the four picker call sites that import `Account` from here
// keep working. The type's home is `@/models/account`.
export type { Account, AccountType } from '@/models/account';
export type { AccountLedgerRow, AccountSummary };

export interface ListAccountsParams {
  type?: AccountType;
  subType?: string;
  search?: string;
  isActive?: boolean;
}

/**
 * List accounts with the type summary.
 *
 * Unlike the transactional lists this is **nested** — `{accounts, summary}`
 * with no top-level `data` key — so the envelope preserves it whole. It is also
 * unpaginated, which is what makes it usable as a picker source.
 */
export const getAccountsWithSummary = async (
  params?: ListAccountsParams,
): Promise<{ accounts: Account[]; summary: AccountSummary }> => {
  try {
    const response = await api.get('/accounts', { params });
    return accountListSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** The accounts alone — what every picker wants. */
export const getAccounts = async (
  params?: ListAccountsParams,
): Promise<Account[]> => (await getAccountsWithSummary(params)).accounts;

/** `{account, recentEntries}` — the account plus its last 10 GL rows. */
export const getAccountById = async (
  accountId: string,
): Promise<{ account: Account | null; recentEntries: AccountLedgerRow[] }> => {
  try {
    const response = await api.get(`/accounts/${accountId}`);
    return accountDetailSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const createAccount = async (form: AccountFormData): Promise<Account> => {
  try {
    const response = await api.post('/accounts', accountFormToCreatePayload(form));
    return mapAccount(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const updateAccount = async (
  accountId: string,
  form: AccountFormData,
): Promise<Account> => {
  try {
    const response = await api.patch(
      `/accounts/${accountId}`,
      accountFormToUpdatePayload(form),
    );
    return mapAccount(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Flip `isActive`. No body — the server reads the current value and inverts it,
 * so there is nothing to send and nothing to get wrong.
 *
 * It can refuse: a system account or one still holding a balance answers 400.
 * `checkDeactivation` predicts both so the control is explained rather than
 * offered and then rejected.
 */
export const toggleAccountActive = async (accountId: string): Promise<Account> => {
  try {
    const response = await api.patch(`/accounts/${accountId}/toggle`);
    return mapAccount(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Delete an account. Refused for a system account, one with posted ledger
 * history, or one that still has sub-accounts — deactivation is the intended
 * way to retire an account that has been used.
 */
export const deleteAccount = async (accountId: string): Promise<void> => {
  try {
    await api.delete(`/accounts/${accountId}`);
  } catch (e) {
    throw toApiError(e);
  }
};

export interface AccountTransactionsPage {
  rows: AccountLedgerRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Paginated GL rows for one account, newest first.
 *
 * The response is `{data, pagination}`. The pagination block is read here,
 * before `unwrapEnvelope` could flatten the rows away from it — the app ignores
 * it and hard-codes 50 rows, which silently hides the rest of the history on any
 * account with real traffic.
 */
export const getAccountTransactions = async (
  accountId: string,
  params: { page?: number; limit?: number } = {},
): Promise<AccountTransactionsPage> => {
  try {
    const response = await api.get(`/accounts/${accountId}/transactions`, {
      params,
    });
    const body = asRaw(response.data);
    // The rows sit under `data`, which is also the envelope's own key — so read
    // the raw body first and fall back to the unwrapped form.
    const container = asRaw(body.data).data !== undefined ? asRaw(body.data) : body;
    const rawRows = Array.isArray(container.data) ? container.data : [];
    const pagination = asRaw(container.pagination);

    const limit = toNumber(pagination.limit as never) || params.limit || 50;
    const total = toNumber(pagination.total as never);

    return {
      rows: rawRows.map(mapAccountLedgerRow),
      page: toNumber(pagination.page as never) || params.page || 1,
      limit,
      total,
      totalPages:
        toNumber(pagination.totalPages as never) ||
        Math.max(1, Math.ceil(total / limit)),
    };
  } catch (e) {
    throw toApiError(e);
  }
};

// ═══════════════════════════════════════════════════════
// Purpose-built picker lists
// ═══════════════════════════════════════════════════════

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
    (a) => a.isActive && (MONEY_SUB_TYPES as readonly string[]).includes(a.subType),
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

/**
 * Accounts a vendor-credit line may be coded to: the billable set, **minus
 * Inventory**.
 *
 * Inventory is reachable on a bill but refused here. A credit line that names
 * an item credits 1200 and relieves the stock in the same transaction; a
 * money-only line pointed at 1200 would credit the control account while the
 * subledger stayed put, so the server rejects it outright with
 * `INVENTORY_LINE_NEEDS_ITEM`. Filtering the picker means the user never gets
 * to choose the option that cannot work.
 */
export const getVendorCreditAccounts = async (): Promise<Account[]> => {
  const accounts = await getBillableAccounts();
  return accounts.filter((a) => a.subType !== 'Inventory');
};

/**
 * Every active account, for the journal-entry line picker.
 *
 * A manual journal entry may touch anything — that is what makes it manual —
 * so this is the one picker that does not narrow by type. Inactive accounts are
 * excluded because posting to one fails with `ACCOUNT_INACTIVE`.
 */
export const getPostableAccounts = async (): Promise<Account[]> => {
  const accounts = await getAccounts({ isActive: true });
  return accounts
    .filter((a) => a.isActive)
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
};
