// ═══════════════════════════════════════════════════════
// FinMatrix Web — Payroll serializer
// ═══════════════════════════════════════════════════════
// Amounts arrive as decimal strings ("50000.0000"). An employee's deduction is
// stored as JSON — `{amount}` from the current API, an array of `{amount}` from
// older data — and is flattened to one per-period figure here.

import type {
  Employee,
  EmployeeStatus,
  PayFrequency,
  PayrollItem,
  PayrollRun,
  PayrollRunStatus,
} from '@/models/payroll';
import { toNumber } from '@/utils/money';

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown): number => toNumber(v as never);

const deductionOf = (d: unknown): number => {
  if (Array.isArray(d)) return d.reduce((s: number, x) => s + num(asRaw(x).amount), 0);
  return num(asRaw(d).amount);
};

export const mapEmployee = (raw: unknown): Employee => {
  const r = asRaw(raw);
  const status = str(r.status);
  const freq = str(r.payFrequency);
  return {
    id: str(r.id),
    firstName: str(r.firstName),
    lastName: str(r.lastName),
    email: str(r.email),
    phone: str(r.phone),
    department: str(r.department),
    position: str(r.position),
    hireDate: str(r.hireDate).slice(0, 10),
    status: (status === 'inactive' || status === 'terminated' ? status : 'active') as EmployeeStatus,
    payType: r.payType === 'hourly' ? 'hourly' : 'salary',
    salary: num(r.salary),
    hourlyRate: num(r.hourlyRate),
    payFrequency: (freq === 'weekly' || freq === 'biweekly' ? freq : 'monthly') as PayFrequency,
    deductionAmount: deductionOf(r.deductions),
    createdAt: str(r.createdAt),
  };
};

export const mapPayrollItem = (raw: unknown): PayrollItem => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    employeeId: str(r.employeeId),
    employeeName: str(r.employeeName),
    hours: num(r.hours),
    gross: num(r.gross),
    deductions: num(r.deductions),
    net: num(r.net),
  };
};

export const mapPayrollRun = (raw: unknown): PayrollRun => {
  const r = asRaw(raw);
  const status = str(r.status);
  return {
    id: str(r.id),
    payPeriod: str(r.payPeriod),
    periodStart: str(r.periodStart).slice(0, 10),
    periodEnd: str(r.periodEnd).slice(0, 10),
    payDate: str(r.payDate).slice(0, 10),
    totalGross: num(r.totalGross),
    totalDeductions: num(r.totalDeductions),
    totalNet: num(r.totalNet),
    status: (status === 'paid' || status === 'processed' ? status : 'draft') as PayrollRunStatus,
    journalEntryId: r.journalEntryId ? String(r.journalEntryId) : null,
    createdAt: str(r.createdAt),
    items: Array.isArray(r.items) ? r.items.map(mapPayrollItem) : [],
  };
};
