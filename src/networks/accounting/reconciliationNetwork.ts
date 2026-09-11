// ═══════════════════════════════════════════════════════
// FinMatrix Web — Bank Reconciliation network
// ═══════════════════════════════════════════════════════
// Every route is `@Roles('admin')` and `@RequiresFeature('bankReconciliation')`,
// so staff and companies on a tier without the feature get 403 from all of them.
// The screens are absent from the staff nav for the same reason.

import type {
  CreateReconciliationPayload,
  ReconcilableAccount,
  Reconciliation,
  ReconciliationDetail,
  UnreconciledSet,
} from '@/models/reconciliation';
import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  mapReconciliation,
  reconcilableAccountsSerializer,
  reconciliationDetailSerializer,
  reconciliationListSerializer,
  unreconciledSerializer,
} from '@/serializers/reconciliationSerializer';

/** Cash and Bank accounts, with book balance and last-reconciled state. */
export const getReconcilableAccounts = async (): Promise<ReconcilableAccount[]> => {
  try {
    const response = await api.get('/reconciliations/accounts');
    return reconcilableAccountsSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Unreconciled rows up to the statement date, plus the carried-in beginning
 * balance. Passing the statement date matters: a row dated after it belongs to
 * the next statement, and the server refuses to clear it on this one.
 */
export const getUnreconciled = async (
  accountId: string,
  endDate?: string,
): Promise<UnreconciledSet> => {
  try {
    const response = await api.get('/reconciliations/unreconciled', {
      params: { accountId, ...(endDate ? { endDate } : {}) },
    });
    return unreconciledSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Save-and-resume: persist in-progress ticks on the ledger rows themselves, so
 * leaving the screen mid-reconciliation loses nothing. Marks only — no ledger
 * impact, and rows already stamped by a finished reconciliation are never
 * touched. `PATCH`, not `POST`, and not the finish action.
 */
export const markCleared = async (
  accountId: string,
  marks: Array<{ entryId: string; cleared: boolean }>,
): Promise<{ updated: number }> => {
  try {
    const response = await api.patch('/reconciliations/mark', { accountId, marks });
    const d = unwrapEnvelope<{ updated?: number }>(response.data);
    return { updated: Number(d?.updated ?? 0) };
  } catch (e) {
    throw toApiError(e);
  }
};

export const getReconciliations = async (accountId?: string): Promise<Reconciliation[]> => {
  try {
    const response = await api.get('/reconciliations', {
      params: accountId ? { accountId } : {},
    });
    return reconciliationListSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** The reconciliation report: cleared rows, outstanding items and their total. */
export const getReconciliationById = async (id: string): Promise<ReconciliationDetail> => {
  try {
    const response = await api.get(`/reconciliations/${id}`);
    return reconciliationDetailSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Finish. The server recomputes the difference and refuses anything but zero
 * (`RECONCILIATION_OUT_OF_BALANCE`), a statement dated before the last one
 * (`RECONCILIATION_OUT_OF_ORDER`), and rows dated after the statement
 * (`CLEARED_ENTRY_AFTER_STATEMENT`). On success the cleared rows are stamped and
 * locked. It posts no journal entry.
 */
export const createReconciliation = async (
  payload: CreateReconciliationPayload,
): Promise<Reconciliation> => {
  try {
    const response = await api.post('/reconciliations', payload);
    return mapReconciliation(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Undo — release the rows so they can be reconciled again. Only the account's
 * most recent reconciliation can be undone (`RECONCILIATION_NOT_LATEST`), and the
 * server records it in the operational audit trail.
 */
export const undoReconciliation = async (id: string): Promise<void> => {
  try {
    await api.delete(`/reconciliations/${id}`);
  } catch (e) {
    throw toApiError(e);
  }
};
