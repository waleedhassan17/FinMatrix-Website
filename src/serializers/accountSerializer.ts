// ═══════════════════════════════════════════════════════
// FinMatrix Web — Chart of Accounts Serializer
// ═══════════════════════════════════════════════════════

import type {
  Account,
  AccountFormData,
  AccountType,
} from '@/models/account';
import { asRaw, str } from '@/serializers/documentLines';
import { toDecimal, toNumber } from '@/utils/money';

export const mapAccount = (raw: unknown): Account => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    // `accountNumber` is the real column. `code` is accepted because the mobile
    // serializer defends against it and some responses have been seen with it —
    // reading both costs nothing and a blank account number breaks sorting,
    // grouping and the duplicate check all at once.
    accountNumber: str(r.accountNumber ?? r.code),
    name: str(r.name),
    type: (str(r.type) || 'asset') as AccountType,
    subType: str(r.subType),
    parentId: r.parentId ? str(r.parentId) : null,
    description: str(r.description),
    openingBalance: toNumber(r.openingBalance as never),
    balance: toNumber(r.balance as never),
    isActive: r.isActive === undefined ? true : Boolean(r.isActive),
    isSystemAccount: Boolean(r.isSystemAccount),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
};

export interface AccountSummary {
  totals: Record<AccountType, number>;
  counts: Record<AccountType, number>;
  totalAccounts: number;
}

const ZERO_BY_TYPE = (): Record<AccountType, number> => ({
  asset: 0,
  liability: 0,
  equity: 0,
  revenue: 0,
  expense: 0,
});

/**
 * `GET /accounts` → `{accounts, summary}`, unpaginated.
 *
 * Nested with no top-level `data` key, so the envelope keeps it whole. A bare
 * array and a `{data}` shape are both tolerated so the picker calls that share
 * this mapper cannot break on a shape change.
 */
export const accountListSerializer = (
  payload: unknown,
): { accounts: Account[]; summary: AccountSummary } => {
  const d = asRaw(payload);
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(d.accounts)
      ? d.accounts
      : Array.isArray(d.data)
        ? d.data
        : [];

  const rawSummary = asRaw(d.summary);
  const totals = ZERO_BY_TYPE();
  const counts = ZERO_BY_TYPE();

  const rawTotals = asRaw(rawSummary.totals);
  const rawCounts = asRaw(rawSummary.counts);
  for (const type of Object.keys(totals) as AccountType[]) {
    totals[type] = toNumber(rawTotals[type] as never);
    counts[type] = toNumber(rawCounts[type] as never);
  }

  const accounts = rows.map(mapAccount);

  return {
    accounts,
    summary: {
      totals,
      counts,
      // Falls back to the row count rather than 0, so a missing summary cannot
      // make a populated chart read as empty.
      totalAccounts:
        rawSummary.totalAccounts === undefined
          ? accounts.length
          : toNumber(rawSummary.totalAccounts as never),
    },
  };
};

/** One general-ledger row against an account. */
export interface AccountLedgerRow {
  id: string;
  date: string;
  reference: string;
  memo: string;
  debit: number;
  credit: number;
  /**
   * The running balance AFTER this row, supplied by the server. Not derived
   * here: the rows come back newest-first and paginated, so a client-side
   * running total would restart on every page and read as wrong.
   */
  balance: number;
  sourceType: string;
  sourceId: string;
}

export const mapAccountLedgerRow = (raw: unknown): AccountLedgerRow => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    date: str(r.date),
    reference: str(r.reference),
    memo: str(r.memo),
    debit: toNumber(r.debit as never),
    credit: toNumber(r.credit as never),
    balance: toNumber(r.balance as never),
    sourceType: str(r.sourceType),
    sourceId: str(r.sourceId),
  };
};

/** `GET /accounts/:id` → `{account, recentEntries}` — the last 10 GL rows. */
export const accountDetailSerializer = (
  payload: unknown,
): { account: Account | null; recentEntries: AccountLedgerRow[] } => {
  const d = asRaw(payload);
  const rawAccount = d.account ?? (d.id ? d : null);
  return {
    account: rawAccount ? mapAccount(rawAccount) : null,
    recentEntries: Array.isArray(d.recentEntries)
      ? d.recentEntries.map(mapAccountLedgerRow)
      : [],
  };
};

// ═══════════════════════════════════════════════════════
// Form → API
// ═══════════════════════════════════════════════════════

export interface AccountWritePayload {
  accountNumber?: string;
  name: string;
  type?: AccountType;
  subType: string;
  /**
   * `null` clears the parent; `undefined` leaves it alone. The distinction is
   * real: the service writes `dto.parentId ?? null` whenever the key is
   * present, so only an explicit null detaches a sub-account.
   */
  parentId?: string | null;
  description?: string;
  openingBalance?: string;
  isActive?: boolean;
}

/**
 * Form → create payload.
 *
 * What is deliberately absent is the point of this function. The mobile app
 * sends `code`, `balance`, `normalBalance`, `isSystemAccount` and `companyId`;
 * not one of those is on `CreateAccountDto`, so every one is stripped — which is
 * why the app's opening balances never posted. The real names are
 * `accountNumber` and `openingBalance`; `normalBalance` is derived server-side
 * from the type, `isSystemAccount` is computed per request, and the company
 * comes from the token.
 *
 * `parentId` is omitted rather than sent as null or "": it is
 * `@IsOptional() @IsUUID()`, and both alternatives fail validation.
 */
export const accountFormToCreatePayload = (
  form: AccountFormData,
): AccountWritePayload => {
  const payload: AccountWritePayload = {
    accountNumber: form.accountNumber.trim(),
    name: form.name.trim(),
    type: form.type,
    subType: form.subType,
  };

  if (form.parentId) payload.parentId = form.parentId;

  const description = form.description.trim();
  if (description) payload.description = description;

  // Sent only when it is a real figure. A zero opening balance posts no journal
  // entry server-side, so sending "0" and omitting it are equivalent — but
  // omitting says what was meant.
  const opening = toDecimal(form.openingBalance);
  if (form.openingBalance.trim() !== '' && !opening.isZero()) {
    payload.openingBalance = opening.toFixed(2);
  }

  return payload;
};

/**
 * Form → update payload.
 *
 * `accountNumber`, `type` and `openingBalance` are left out entirely.
 * `PartialType(CreateAccountDto)` means the DTO would ACCEPT all three, but
 * `update()` never reads them — so sending them looks like an edit that
 * silently does nothing. The opening balance especially: it already posted its
 * journal entry at creation, and changing the field would not move it.
 *
 * Blank strings ARE sent here, unlike on create: `description: ''` is how the
 * user clears a description, and the service distinguishes undefined (leave
 * alone) from a value (write it).
 *
 * `parentId` is sent as **null**, not undefined, when the picker is cleared.
 * `undefined` disappears from the JSON altogether, so the service would never
 * see the key and a sub-account could never be detached. Null passes
 * `@IsOptional()` — which skips validation for null as well as undefined — and
 * lands on the `?? null` branch.
 */
export const accountFormToUpdatePayload = (
  form: AccountFormData,
): AccountWritePayload => ({
  name: form.name.trim(),
  subType: form.subType,
  parentId: form.parentId || null,
  description: form.description.trim(),
  isActive: form.isActive,
});
