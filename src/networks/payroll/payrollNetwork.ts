// ═══════════════════════════════════════════════════════
// FinMatrix Web — Payroll Network
// ═══════════════════════════════════════════════════════
// Owner only: every route is @Roles('admin') and @RequiresFeature('payroll').
// Staff never reach these screens (absent from their nav, route-guarded), and
// the server 403s them regardless.

import { api, authedBlob, authedBlobUrl, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import type { EmployeeStatus, Employee, PayrollRun } from '@/models/payroll';
import { listRows } from '@/serializers/inventorySerializer';
import { mapEmployee, mapPayrollRun } from '@/serializers/payrollSerializer';

// ─── Employees ──────────────────────────────────────────

export const getEmployees = async (
  params: { status?: EmployeeStatus; search?: string } = {},
): Promise<Employee[]> => {
  try {
    const response = await api.get('/employees', { params: { page: 1, limit: 100, ...params } });
    return listRows(unwrapEnvelope(response.data)).map(mapEmployee);
  } catch (e) {
    throw toApiError(e);
  }
};

export const getEmployee = async (id: string): Promise<Employee> => {
  try {
    const response = await api.get(`/employees/${id}`);
    return mapEmployee(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const createEmployee = async (body: Record<string, string>): Promise<Employee> => {
  try {
    const response = await api.post('/employees', body);
    return mapEmployee(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const updateEmployee = async (
  id: string,
  body: Record<string, string>,
): Promise<Employee> => {
  try {
    const response = await api.patch(`/employees/${id}`, body);
    return mapEmployee(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** Refused (EMPLOYEE_HAS_PAYROLL_HISTORY) once they have been paid — set them inactive instead. */
export const deleteEmployee = async (id: string): Promise<void> => {
  try {
    await api.delete(`/employees/${id}`);
  } catch (e) {
    throw toApiError(e);
  }
};

// ─── Runs ───────────────────────────────────────────────

export const getPayrollRuns = async (): Promise<PayrollRun[]> => {
  try {
    const response = await api.get('/payroll/runs');
    return listRows(unwrapEnvelope(response.data)).map(mapPayrollRun);
  } catch (e) {
    throw toApiError(e);
  }
};

export const getPayrollRun = async (id: string): Promise<PayrollRun> => {
  try {
    const response = await api.get(`/payroll/runs/${id}`);
    return mapPayrollRun(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Build a DRAFT run. Nothing posts until it is processed. With no `items` the
 * server pays every active employee; hourly staff default to 160 hours.
 * Refused when the same pay period has already been paid.
 */
export const createPayrollRun = async (body: {
  payPeriod: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  items?: Array<{ employeeId: string; hours?: string }>;
}): Promise<PayrollRun> => {
  try {
    const response = await api.post('/payroll/runs', body);
    return mapPayrollRun(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** Post the run's journal entry and mark it paid. Row-locked server-side, so it can never post twice. */
export const processPayrollRun = async (id: string): Promise<PayrollRun> => {
  try {
    const response = await api.post(`/payroll/runs/${id}/process`, {});
    return mapPayrollRun(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** Drafts only — a paid run is part of the books. */
export const deletePayrollRun = async (id: string): Promise<void> => {
  try {
    await api.delete(`/payroll/runs/${id}`);
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * One employee's official payslip for a paid run, as an object URL the caller
 * revokes. Figures come off the posted run, so the PDF ties to the ledger.
 */
export const getPayslipPdfUrl = (runId: string, employeeId: string): Promise<string> =>
  authedBlobUrl(`/payroll/runs/${runId}/payslip/${employeeId}/pdf`);

/** The same payslip as a file, for printing, downloading or sharing it. */
export const getPayslipPdf = (runId: string, employeeId: string): Promise<Blob> =>
  authedBlob(`/payroll/runs/${runId}/payslip/${employeeId}/pdf`);
