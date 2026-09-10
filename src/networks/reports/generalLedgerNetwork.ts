// ═══════════════════════════════════════════════════════
// FinMatrix Web — General Ledger
// ═══════════════════════════════════════════════════════
// The only two report endpoints NOT under /reports — the ledger is its own
// module. Both are @Roles('admin','staff').

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import type { ReportRange } from '@/models/reportPeriod';
import {
  generalLedgerSerializer,
  ledgerAccountsSerializer,
  type GeneralLedgerReport,
  type LedgerAccountsReport,
} from '@/serializers/reportSerializers';

/**
 * The chronological ledger, optionally narrowed to one account.
 *
 * `account` is the account **CODE** (`1000`), not a UUID — the service compares it
 * against `accounts.account_number`. Passing an id silently matches nothing and
 * returns an empty ledger with a 200, so the picker must send codes.
 *
 * Reads `journal_entry_lines` joined to their accounts, filtered to
 * `status = 'posted'`, so every row has a real journal entry behind it and
 * `sourceId` can be drilled into. It used to synthesise entries from documents
 * against six hard-coded accounts, which reported every bill as Cost of Goods Sold
 * and omitted manual journals entirely — worth knowing if older screenshots
 * disagree with this.
 *
 * **Not paginated.** The whole period comes back in one body, oldest first, with a
 * per-account running `balance` on each row that depends on that ordering. Paging
 * is the client's job; re-sorting is nobody's.
 */
export const getGeneralLedger = async (
  range: ReportRange,
  accountCode?: string,
): Promise<GeneralLedgerReport> => {
  try {
    const response = await api.get('/ledger', {
      params: {
        startDate: range.startDate,
        endDate: range.endDate,
        // Omitted rather than sent empty, which would filter to a nonexistent
        // account instead of meaning "all".
        ...(accountCode ? { account: accountCode } : {}),
      },
    });
    return generalLedgerSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Per-account totals for the period — the account picker's source.
 *
 * Already carries each account's debit, credit, net balance and entry count, so
 * the picker needs no second call to the chart of accounts and shows only accounts
 * that actually moved.
 */
export const getLedgerAccounts = async (
  range: ReportRange,
): Promise<LedgerAccountsReport> => {
  try {
    const response = await api.get('/ledger/accounts', {
      params: { startDate: range.startDate, endDate: range.endDate },
    });
    return ledgerAccountsSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
