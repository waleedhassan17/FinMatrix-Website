// ═══════════════════════════════════════════════════════
// FinMatrix Web — Bank Reconciliation serializer
// ═══════════════════════════════════════════════════════
// Every amount the reconciliation API returns is a STRING — two decimals on the
// computed fields, four on the stored reconciliation columns — so every one goes
// through `toNumber`. A figure that slipped through as a string would concatenate
// instead of add the first time anything summed it.

import type {
  ReconcilableAccount,
  Reconciliation,
  ReconciliationDetail,
  ReconEntry,
  UnreconciledSet,
} from '@/models/reconciliation';
import { asRaw, str } from '@/serializers/documentLines';
import { toDecimal, toNumber } from '@/utils/money';

const nullableNumber = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : toNumber(v as never);

const nullableString = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);

export const mapReconEntry = (raw: unknown): ReconEntry => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    date: str(r.date).slice(0, 10),
    reference: str(r.reference),
    memo: str(r.memo),
    sourceType: str(r.sourceType),
    // Kept, unlike the app, which drops it: it is what ties a ledger row back
    // to the document that posted it.
    sourceId: str(r.sourceId),
    debit: toNumber(r.debit as never),
    credit: toNumber(r.credit as never),
    // The server sends the signed amount; derive it only if an older response
    // lacks it, so a row can never be read as zero.
    amount:
      r.amount !== undefined
        ? toNumber(r.amount as never)
        : toDecimal(r.debit as never).minus(toDecimal(r.credit as never)).toNumber(),
    // Literally `true` — the reconciliation report's rows carry no flag at all.
    cleared: r.cleared === true,
  };
};

const mapEntries = (v: unknown): ReconEntry[] =>
  Array.isArray(v) ? v.map(mapReconEntry) : [];

export const mapReconcilableAccount = (raw: unknown): ReconcilableAccount => {
  const r = asRaw(raw);
  return {
    accountId: str(r.accountId),
    accountNumber: str(r.accountNumber),
    name: str(r.name),
    subType: str(r.subType),
    bookBalance: toNumber(r.bookBalance as never),
    lastReconciledDate: nullableString(r.lastReconciledDate),
    lastReconciledBalance: nullableNumber(r.lastReconciledBalance),
  };
};

/** `GET /reconciliations/accounts` — a bare array, tolerated wrapped too. */
export const reconcilableAccountsSerializer = (payload: unknown): ReconcilableAccount[] => {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(asRaw(payload).data)
      ? (asRaw(payload).data as unknown[])
      : [];
  return rows.map(mapReconcilableAccount);
};

export const unreconciledSerializer = (payload: unknown): UnreconciledSet => {
  const r = asRaw(payload);
  return {
    accountId: str(r.accountId),
    accountName: str(r.accountName),
    accountNumber: str(r.accountNumber),
    beginningBalance: toNumber(r.beginningBalance as never),
    lastStatementDate: nullableString(r.lastStatementDate),
    lastStatementEndingBalance: nullableNumber(r.lastStatementEndingBalance),
    beginningMismatch: nullableNumber(r.beginningMismatch),
    entries: mapEntries(r.entries),
  };
};

export const mapReconciliation = (raw: unknown): Reconciliation => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    accountId: str(r.accountId),
    statementDate: str(r.statementDate).slice(0, 10),
    statementEndingBalance: toNumber(r.statementEndingBalance as never),
    beginningBalance: toNumber(r.beginningBalance as never),
    clearedBalance: toNumber(r.clearedBalance as never),
    difference: toNumber(r.difference as never),
    clearedCount: toNumber(r.clearedCount as never),
    status: str(r.status) || 'completed',
    notes: str(r.notes),
    createdBy: str(r.createdBy),
    reconciledAt: str(r.reconciledAt),
    createdAt: str(r.createdAt),
  };
};

/** `GET /reconciliations` — `{data}`; the envelope may or may not flatten it. */
export const reconciliationListSerializer = (payload: unknown): Reconciliation[] => {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(asRaw(payload).data)
      ? (asRaw(payload).data as unknown[])
      : [];
  return rows.map(mapReconciliation);
};

export const reconciliationDetailSerializer = (payload: unknown): ReconciliationDetail => {
  const r = asRaw(payload);
  return {
    ...mapReconciliation(r),
    entries: mapEntries(r.entries),
    outstanding: mapEntries(r.outstanding),
    outstandingTotal: toNumber(r.outstandingTotal as never),
  };
};
