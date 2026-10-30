// ═══════════════════════════════════════════════════════
// FinMatrix Web — Investigation serializers (reports v2)
// ═══════════════════════════════════════════════════════
// The drill-downs behind a statement line: an account's register, what moved
// it between two periods, the retained-earnings rollforward and the cash rows
// behind a cash-flow line. All four are envelope routes (`{ success, data }`),
// which is why none of them names its rows `data` — the interceptor would lift
// the array and drop every sibling. Rows arrive as `entries`; a bare array is
// still tolerated, for the reason statementLineEntriesSerializer gives.

import { asRaw, str } from '@/serializers/documentLines';
import { numberOrNull } from '@/serializers/kpiSerializer';
import type { ReportRangeMeta, StatementLineEntry } from '@/serializers/reportSerializers';
import { toNumber } from '@/utils/money';

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const rowsOf = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  const r = asRaw(payload);
  return list(r.entries).length ? list(r.entries) : list(r.data);
};

const mapRange = (raw: unknown): ReportRangeMeta => {
  const r = asRaw(raw);
  return { startDate: str(r.startDate), endDate: str(r.endDate) };
};

/** The document columns every drill row shares with the P&L drill-down. */
const mapDocumentRow = (raw: unknown): StatementLineEntry => {
  const e = asRaw(raw);
  return {
    id: str(e.id),
    date: str(e.date),
    reference: str(e.reference),
    memo: str(e.memo),
    debit: toNumber(e.debit as never),
    credit: toNumber(e.credit as never),
    amount: toNumber(e.amount as never),
    sourceType: str(e.sourceType),
    sourceId: str(e.sourceId),
    sourceLabel: str(e.sourceLabel, 'Journal entry'),
    documentNumber: str(e.documentNumber) || str(e.reference),
    counterpartyName: str(e.counterpartyName),
  };
};

// ═══════════════════════════════════════════════════════
// Account register — GET /reports/accounts/:code/register
// ═══════════════════════════════════════════════════════

export interface RegisterEntry extends StatementLineEntry {
  /**
   * The balance after this row, signed by the account's normal balance. The
   * server computes it with a window over the whole range, so it is right on
   * every page — never re-accumulated here.
   */
  runningBalance: number;
}

export interface AccountRegister {
  account: {
    accountCode: string;
    accountName: string;
    accountType: string;
    subType: string;
  };
  range: ReportRangeMeta;
  /** Signed by normal balance, like every figure here. */
  openingBalance: number;
  /** 'cumulative' for balance-sheet accounts, 'fiscalYearToDate' for P&L ones. */
  openingBasis: string;
  periodDebit: number;
  periodCredit: number;
  /** The period's movement, signed like the entries; null from a server that omits it. */
  periodNet: number | null;
  closingBalance: number;
  entries: RegisterEntry[];
  total: number;
  page: number;
  limit: number;
}

export const accountRegisterSerializer = (payload: unknown): AccountRegister => {
  const r = asRaw(payload);
  const account = asRaw(r.account);
  return {
    account: {
      // Accept the account fields flat as well as nested — the P&L drill sends
      // them flat, and the two routes are siblings.
      accountCode: str(account.accountCode ?? r.accountCode),
      accountName: str(account.accountName ?? r.accountName),
      accountType: str(account.accountType ?? r.accountType),
      subType: str(account.subType ?? r.subType),
    },
    range: mapRange(r.range),
    openingBalance: toNumber(r.openingBalance as never),
    openingBasis: str(r.openingBasis),
    periodDebit: toNumber(r.periodDebit as never),
    periodCredit: toNumber(r.periodCredit as never),
    periodNet: numberOrNull(r.periodNet),
    closingBalance: toNumber(r.closingBalance as never),
    entries: rowsOf(payload).map((raw) => ({
      ...mapDocumentRow(raw),
      runningBalance: toNumber(asRaw(raw).runningBalance as never),
    })),
    total: toNumber(r.total as never),
    page: toNumber(r.page as never) || 1,
    limit: toNumber(r.limit as never) || 50,
  };
};

// ═══════════════════════════════════════════════════════
// Account movement — GET /reports/accounts/:code/movement
// ═══════════════════════════════════════════════════════

export interface MovementSlice {
  /** The counterparty, or the document type; 'Unattributed' for rows with neither. */
  label: string;
  current: number;
  prior: number;
  change: number;
}

export interface AccountMovement {
  current: number;
  prior: number;
  change: number;
  /** Sorted by |change|; Σ change = change. */
  byCounterparty: MovementSlice[];
  bySourceType: MovementSlice[];
}

const mapSlice = (labelKey: 'name' | 'sourceLabel') => (raw: unknown): MovementSlice => {
  const s = asRaw(raw);
  return {
    label: str(s[labelKey] ?? s.label, 'Unattributed') || 'Unattributed',
    current: toNumber(s.current as never),
    prior: toNumber(s.prior as never),
    change: toNumber(s.change as never),
  };
};

export const accountMovementSerializer = (payload: unknown): AccountMovement => {
  const r = asRaw(payload);
  return {
    current: toNumber(r.current as never),
    prior: toNumber(r.prior as never),
    change: toNumber(r.change as never),
    byCounterparty: list(r.byCounterparty).map(mapSlice('name')),
    bySourceType: list(r.bySourceType).map(mapSlice('sourceLabel')),
  };
};

// ═══════════════════════════════════════════════════════
// Retained earnings — GET /reports/balance-sheet/retained-earnings
// ═══════════════════════════════════════════════════════

export interface RetainedEarningsYear {
  /** e.g. 'FY2025' or '2025' — whatever the server labels it. */
  fiscalYear: string;
  startDate: string;
  endDate: string;
  netIncome: number;
}

export interface RetainedEarningsRollforward {
  fiscalYearStart: string;
  /** What has been posted to 3100 directly (closing entries, adjustments). */
  postedTo3100: number;
  byFiscalYear: RetainedEarningsYear[];
  /** Equals the balance sheet's Retained Earnings line. */
  total: number;
}

export const retainedEarningsSerializer = (payload: unknown): RetainedEarningsRollforward => {
  const r = asRaw(payload);
  return {
    fiscalYearStart: str(r.fiscalYearStart),
    postedTo3100: toNumber(r.postedTo3100 as never),
    byFiscalYear: list(r.byFiscalYear).map((raw) => {
      const y = asRaw(raw);
      return {
        fiscalYear: str(y.fiscalYear),
        startDate: str(y.startDate),
        endDate: str(y.endDate),
        netIncome: toNumber(y.netIncome as never),
      };
    }),
    total: toNumber(r.total as never),
  };
};

// ═══════════════════════════════════════════════════════
// Cash-flow line — GET /reports/cash-flow/lines/:lineKey/entries
// ═══════════════════════════════════════════════════════

export interface CashFlowLineEntry extends StatementLineEntry {
  /** The part of the cash row classified into this line. Σ = the line amount. */
  allocatedAmount: number;
  /** Below 100 when one payment was split across lines; null when whole. */
  allocationPct: number | null;
}

export interface CashFlowLineEntries {
  lineKey: string;
  label: string;
  range: ReportRangeMeta;
  /** The line's figure over the whole range, when the server sends it. */
  lineAmount: number | null;
  entries: CashFlowLineEntry[];
  total: number;
  page: number;
  limit: number;
}

export const cashFlowLineEntriesSerializer = (payload: unknown): CashFlowLineEntries => {
  const r = asRaw(payload);
  return {
    lineKey: str(r.lineKey),
    label: str(r.label),
    range: mapRange(r.range),
    lineAmount: numberOrNull(r.lineAmount),
    entries: rowsOf(payload).map((raw) => {
      const e = asRaw(raw);
      const allocated = numberOrNull(e.allocatedAmount);
      const row = mapDocumentRow(raw);
      return {
        ...row,
        allocatedAmount: allocated ?? row.amount,
        allocationPct: numberOrNull(e.allocationPct),
      };
    }),
    total: toNumber(r.total as never),
    page: toNumber(r.page as never) || 1,
    limit: toNumber(r.limit as never) || 50,
  };
};
