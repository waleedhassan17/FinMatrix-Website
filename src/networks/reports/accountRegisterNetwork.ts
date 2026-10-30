// ═══════════════════════════════════════════════════════
// FinMatrix Web — Account register and movement (reports v2)
// ═══════════════════════════════════════════════════════
// The drill-down behind any statement line that reports one account: the
// balance sheet, the trial balance and the investigate panel all open these.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import type { ReportRange } from '@/models/reportPeriod';
import {
  accountMovementSerializer,
  accountRegisterSerializer,
  type AccountMovement,
  type AccountRegister,
} from '@/serializers/reportInvestigateSerializers';

/**
 * One account's postings over a range, oldest first, with an opening balance,
 * a running balance on every row and a closing balance.
 *
 * `accountCode` is the account NUMBER off the statement line, as for the P&L
 * drill. The running balance is computed by the server over the whole range,
 * so page 3's first row continues page 2's last exactly. An unknown code is a
 * 404 (ACCOUNT_NOT_FOUND), never an empty register — "no such account" and
 * "no activity" are different answers.
 */
export const getAccountRegister = async (
  accountCode: string,
  range: ReportRange,
  page = 1,
  limit = 50,
): Promise<AccountRegister> => {
  try {
    const response = await api.get(
      `/reports/accounts/${encodeURIComponent(accountCode)}/register`,
      {
        params: {
          startDate: range.startDate,
          endDate: range.endDate,
          page,
          limit,
          order: 'asc',
        },
      },
    );
    return accountRegisterSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * What moved one account in `range` against `compare`, by counterparty and by
 * document type, sorted by the size of the change.
 *
 * `compare` is optional. Without it the server compares with the preceding
 * period of equal length; an as-of comparison (balance sheet at two dates)
 * reads the window's own `current` movement instead, which is the change in
 * the balance between the two dates.
 */
export const getAccountMovement = async (
  accountCode: string,
  range: ReportRange,
  compare: ReportRange | null,
  limit = 10,
): Promise<AccountMovement> => {
  try {
    const params: Record<string, string | number> = {
      startDate: range.startDate,
      endDate: range.endDate,
      limit,
    };
    if (compare) {
      params.compareStartDate = compare.startDate;
      params.compareEndDate = compare.endDate;
    }
    const response = await api.get(
      `/reports/accounts/${encodeURIComponent(accountCode)}/movement`,
      { params },
    );
    return accountMovementSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
