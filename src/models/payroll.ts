// ═══════════════════════════════════════════════════════
// FinMatrix Web — Payroll model
// ═══════════════════════════════════════════════════════
// Pure: types, validation, and the pay arithmetic — mirrored from
// PayrollService so a run can be previewed before the server builds it.
//
//   gross (salaried) = annual salary ÷ periods per year (52 / 26 / 12)
//   gross (hourly)   = hourly rate × hours (the server assumes 160 if none)
//   deductions       = the employee's fixed amount per period
//   net              = gross − deductions
//
// Processing a run posts ONE journal entry for it:
//   Dr 6200 Salary Expense      gross
//   Cr 1000 Cash                net
//   Cr 2310 Payroll Liabilities deductions (only when there are any)

import { isoDate } from '@/models/document';
import { Decimal, toDecimal } from '@/utils/money';

export type PayType = 'salary' | 'hourly';
export type PayFrequency = 'weekly' | 'biweekly' | 'monthly';
export type EmployeeStatus = 'active' | 'inactive' | 'terminated';
export type PayrollRunStatus = 'draft' | 'processed' | 'paid';

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  hireDate: string;
  status: EmployeeStatus;
  payType: PayType;
  /** ANNUAL salary — divided by the periods in a year for each run. */
  salary: number;
  hourlyRate: number;
  payFrequency: PayFrequency;
  /** Withheld every period. */
  deductionAmount: number;
  createdAt: string;
}

export interface PayrollItem {
  id: string;
  employeeId: string;
  employeeName: string;
  hours: number;
  gross: number;
  deductions: number;
  net: number;
}

export interface PayrollRun {
  id: string;
  payPeriod: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  status: PayrollRunStatus;
  journalEntryId: string | null;
  createdAt: string;
  items: PayrollItem[];
}

export const PAY_FREQUENCY_OPTIONS: ReadonlyArray<{ value: PayFrequency; label: string }> = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'biweekly', label: 'Every two weeks' },
  { value: 'weekly', label: 'Weekly' },
];

export const EMPLOYEE_STATUS_OPTIONS: ReadonlyArray<{ value: EmployeeStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'terminated', label: 'Terminated' },
];

export const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
};

/** What the server assumes for an hourly employee with no hours entered. */
export const DEFAULT_HOURS = 160;

export const fullName = (e: Pick<Employee, 'firstName' | 'lastName'>): string =>
  `${e.firstName} ${e.lastName}`.trim();

/** One period's gross pay, exactly as PayrollService.grossFor computes it. */
export const periodGross = (
  e: Pick<Employee, 'payType' | 'salary' | 'hourlyRate' | 'payFrequency'>,
  hours: number = DEFAULT_HOURS,
): Decimal =>
  e.payType === 'hourly'
    ? toDecimal(e.hourlyRate).times(hours || 0)
    : toDecimal(e.salary).dividedBy(PERIODS_PER_YEAR[e.payFrequency] ?? 12);

export interface PayPreview {
  gross: Decimal;
  deductions: Decimal;
  net: Decimal;
}

export const periodPay = (
  e: Pick<Employee, 'payType' | 'salary' | 'hourlyRate' | 'payFrequency' | 'deductionAmount'>,
  hours: number = DEFAULT_HOURS,
): PayPreview => {
  const gross = periodGross(e, hours);
  const deductions = toDecimal(e.deductionAmount);
  return { gross, deductions, net: gross.minus(deductions) };
};

/** Totals for a set of lines, at 2 dp — what the run will show once built. */
export const previewTotals = (lines: PayPreview[]) =>
  lines.reduce(
    (t, l) => ({
      gross: t.gross.plus(l.gross),
      deductions: t.deductions.plus(l.deductions),
      net: t.net.plus(l.net),
    }),
    { gross: new Decimal(0), deductions: new Decimal(0), net: new Decimal(0) },
  );

// ─── Runs ───────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * A calendar month as a pay period: `2026-09` → "September 2026", the 1st to
 * the last day, paid on the last day. The server keys "already paid" on the
 * payPeriod string, so the label must be stable.
 */
export const monthPeriod = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return {
    payPeriod: `${MONTHS[m - 1]} ${y}`,
    periodStart: isoDate(start),
    periodEnd: isoDate(end),
    payDate: isoDate(end),
  };
};

export const RUN_STATUS_LABEL: Record<PayrollRunStatus, string> = {
  draft: 'Draft',
  processed: 'Processed',
  paid: 'Paid',
};

/**
 * What a run allows. A draft can be processed or thrown away; once paid it has
 * a journal entry behind it, so it can issue payslips and nothing else.
 */
export const runActions = (run: Pick<PayrollRun, 'status'>) => ({
  process: run.status === 'draft',
  remove: run.status === 'draft',
  payslips: run.status === 'paid',
});

// ─── Employee form ──────────────────────────────────────

export interface EmployeeForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  hireDate: string;
  payType: PayType;
  salary: string;
  hourlyRate: string;
  payFrequency: PayFrequency;
  deductionAmount: string;
  status: EmployeeStatus;
}

export const emptyEmployeeForm = (): EmployeeForm => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  department: '',
  position: '',
  hireDate: '',
  payType: 'salary',
  salary: '',
  hourlyRate: '',
  payFrequency: 'monthly',
  deductionAmount: '',
  status: 'active',
});

const numText = (n: number) => (n ? String(n) : '');

export const employeeToForm = (e: Employee): EmployeeForm => ({
  firstName: e.firstName,
  lastName: e.lastName,
  email: e.email,
  phone: e.phone,
  department: e.department,
  position: e.position,
  hireDate: e.hireDate,
  payType: e.payType,
  salary: numText(e.salary),
  hourlyRate: numText(e.hourlyRate),
  payFrequency: e.payFrequency,
  deductionAmount: numText(e.deductionAmount),
  status: e.status,
});

const MONEY = /^\d+(\.\d{1,2})?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: string) => v.replace(/[,\s]/g, '');

export const validateEmployee = (form: EmployeeForm): Partial<Record<keyof EmployeeForm, string>> => {
  const e: Partial<Record<keyof EmployeeForm, string>> = {};
  if (!form.firstName.trim()) e.firstName = 'First name is required.';
  if (!form.lastName.trim()) e.lastName = 'Last name is required.';
  if (form.email.trim() && !EMAIL.test(form.email.trim())) e.email = 'Enter a valid email address.';

  const rateField = form.payType === 'hourly' ? 'hourlyRate' : 'salary';
  const rate = clean(form[rateField]);
  if (!MONEY.test(rate) || !toDecimal(rate).greaterThan(0)) {
    e[rateField] =
      form.payType === 'hourly' ? 'Enter the hourly rate.' : 'Enter the annual salary.';
  }

  const ded = clean(form.deductionAmount || '0');
  if (!MONEY.test(ded)) {
    e.deductionAmount = 'Enter an amount of 0 or more.';
  } else if (!e[rateField]) {
    // A deduction larger than a period's pay would post negative net pay —
    // a credit to Cash for money that was never paid out.
    const gross = periodGross(
      {
        payType: form.payType,
        salary: toDecimal(clean(form.salary || '0')).toNumber(),
        hourlyRate: toDecimal(clean(form.hourlyRate || '0')).toNumber(),
        payFrequency: form.payFrequency,
      },
      DEFAULT_HOURS,
    );
    if (toDecimal(ded).greaterThan(gross)) {
      e.deductionAmount = 'The deduction is more than one period’s gross pay.';
    }
  }
  return e;
};

/** Create/UpdateEmployeeDto. Only the rate for the chosen pay type is meaningful; the other goes as 0. */
export const employeePayload = (form: EmployeeForm, editing = false) => {
  const money = (v: string) => (MONEY.test(clean(v)) ? toDecimal(clean(v)).toString() : '0');
  const body: Record<string, string> = {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    payType: form.payType,
    salary: form.payType === 'salary' ? money(form.salary) : '0',
    hourlyRate: form.payType === 'hourly' ? money(form.hourlyRate) : '0',
    payFrequency: form.payFrequency,
    deductionAmount: money(form.deductionAmount || '0'),
  };
  for (const key of ['email', 'phone', 'department', 'position', 'hireDate'] as const) {
    const v = form[key].trim();
    if (v) body[key] = v;
  }
  if (editing) body.status = form.status;
  return body;
};
