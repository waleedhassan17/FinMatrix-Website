// ═══════════════════════════════════════════════════════
// FinMatrix Web — Budget Network
// ═══════════════════════════════════════════════════════
// `@RequiresFeature('budgets')`. The server lets staff READ budgets; this
// console keeps them owner-only (absent from the staff nav, route-guarded),
// and every write is @Roles('admin') anyway.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import type { Budget, BudgetStatus, BudgetVsActual, PrefillLine } from '@/models/budget';
import { listRows } from '@/serializers/inventorySerializer';
import { mapBudget, mapPrefill, mapVsActual } from '@/serializers/budgetSerializer';

export interface BudgetWriteBody {
  name: string;
  fiscalYear: number;
  status: BudgetStatus;
  lines: Array<{ accountId: string; monthlyAmounts: number[] }>;
}

export const getBudgets = async (params: { fiscalYear?: number } = {}): Promise<Budget[]> => {
  try {
    const response = await api.get('/budgets', { params });
    return listRows(unwrapEnvelope(response.data)).map(mapBudget);
  } catch (e) {
    throw toApiError(e);
  }
};

export const getBudget = async (id: string): Promise<Budget> => {
  try {
    const response = await api.get(`/budgets/${id}`);
    return mapBudget(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** Each line against the account's posted general-ledger movement for the fiscal year. */
export const getBudgetVsActual = async (id: string): Promise<BudgetVsActual> => {
  try {
    const response = await api.get(`/budgets/${id}/vs-actual`);
    return mapVsActual(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * "Start from last year's actuals": per-account monthly actuals for a fiscal
 * year, revenue and expense accounts with activity only. Read-only.
 */
export const getBudgetPrefill = async (fiscalYear: number): Promise<PrefillLine[]> => {
  try {
    const response = await api.get('/budgets/prefill', { params: { fiscalYear } });
    return mapPrefill(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const createBudget = async (body: BudgetWriteBody): Promise<Budget> => {
  try {
    const response = await api.post('/budgets', body);
    return mapBudget(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const updateBudget = async (id: string, body: Partial<BudgetWriteBody>): Promise<Budget> => {
  try {
    const response = await api.patch(`/budgets/${id}`, body);
    return mapBudget(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const deleteBudget = async (id: string): Promise<void> => {
  try {
    await api.delete(`/budgets/${id}`);
  } catch (e) {
    throw toApiError(e);
  }
};
