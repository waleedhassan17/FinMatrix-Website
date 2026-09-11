import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HOURS,
  emptyEmployeeForm,
  employeePayload,
  monthPeriod,
  periodGross,
  periodPay,
  previewTotals,
  runActions,
  validateEmployee,
  type EmployeeForm,
} from '@/models/payroll';
import { mapEmployee, mapPayrollRun } from '@/serializers/payrollSerializer';

const salaried = { payType: 'salary' as const, salary: 1_200_000, hourlyRate: 0, payFrequency: 'monthly' as const };
const hourly = { payType: 'hourly' as const, salary: 0, hourlyRate: 500, payFrequency: 'monthly' as const };

const form = (over: Partial<EmployeeForm> = {}): EmployeeForm => ({
  ...emptyEmployeeForm(),
  firstName: 'Ayesha',
  lastName: 'Khan',
  salary: '1200000',
  ...over,
});

describe('pay arithmetic (mirrors PayrollService)', () => {
  it('divides an annual salary by the periods in a year', () => {
    expect(periodGross(salaried).toNumber()).toBe(100_000);
    expect(periodGross({ ...salaried, payFrequency: 'biweekly' }).toFixed(4)).toBe('46153.8462');
    expect(periodGross({ ...salaried, payFrequency: 'weekly' }).toFixed(4)).toBe('23076.9231');
  });

  it('multiplies an hourly rate by hours, defaulting to 160', () => {
    expect(DEFAULT_HOURS).toBe(160);
    expect(periodGross(hourly).toNumber()).toBe(80_000);
    expect(periodGross(hourly, 100).toNumber()).toBe(50_000);
  });

  it('nets the fixed deduction off gross, and totals lines exactly', () => {
    const a = periodPay({ ...salaried, deductionAmount: 5000 });
    const b = periodPay({ ...hourly, deductionAmount: 0 }, 120);
    expect(a.net.toNumber()).toBe(95_000);
    const t = previewTotals([a, b]);
    expect(t.gross.toNumber()).toBe(160_000);
    expect(t.deductions.toNumber()).toBe(5000);
    expect(t.net.toNumber()).toBe(155_000);
  });
});

describe('runs', () => {
  it('turns a month into a stable pay period', () => {
    expect(monthPeriod('2026-09')).toEqual({
      payPeriod: 'September 2026',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      payDate: '2026-09-30',
    });
    expect(monthPeriod('2028-02').periodEnd).toBe('2028-02-29');
  });

  it('lets a draft be processed or removed, and only a paid run issue payslips', () => {
    expect(runActions({ status: 'draft' })).toEqual({ process: true, remove: true, payslips: false });
    expect(runActions({ status: 'paid' })).toEqual({ process: false, remove: false, payslips: true });
  });
});

describe('employee form', () => {
  it('requires names and the rate for the chosen pay type', () => {
    const e = validateEmployee(form({ firstName: '', salary: '' }));
    expect(e.firstName).toBeTruthy();
    expect(e.salary).toMatch(/annual salary/);
    expect(validateEmployee(form({ payType: 'hourly', hourlyRate: '' })).hourlyRate).toBeTruthy();
  });

  it('refuses a deduction larger than a period’s gross (negative net pay)', () => {
    expect(validateEmployee(form({ deductionAmount: '100001' })).deductionAmount).toBeTruthy();
    expect(validateEmployee(form({ deductionAmount: '100000' }))).toEqual({});
  });

  it('sends only the rate for the chosen pay type, and status only on edit', () => {
    const body = employeePayload(form({ hourlyRate: '900', deductionAmount: '1,500', department: ' Sales ' }));
    expect(body).toMatchObject({ payType: 'salary', salary: '1200000', hourlyRate: '0', deductionAmount: '1500', department: 'Sales' });
    expect(body).not.toHaveProperty('status');
    expect(body).not.toHaveProperty('email');
    expect(employeePayload(form({ status: 'inactive' }), true).status).toBe('inactive');
  });
});

describe('payroll serializer', () => {
  it('flattens deductions from either JSON shape', () => {
    expect(mapEmployee({ deductions: { amount: 2500 } }).deductionAmount).toBe(2500);
    expect(mapEmployee({ deductions: [{ amount: 1000 }, { amount: '500' }] }).deductionAmount).toBe(1500);
    expect(mapEmployee({ deductions: null }).deductionAmount).toBe(0);
  });

  it('reads a run with decimal-string totals and named items', () => {
    const run = mapPayrollRun({
      id: 'r1',
      payPeriod: 'September 2026',
      totalGross: '180000.0000',
      totalDeductions: '5000.0000',
      totalNet: '175000.0000',
      status: 'paid',
      journalEntryId: 'je-1',
      items: [{ id: 'i1', employeeId: 'e1', employeeName: 'Ayesha Khan', hours: '0', gross: '100000.0000', deductions: '5000', net: '95000' }],
    });
    expect(run.totalNet).toBe(175_000);
    expect(run.journalEntryId).toBe('je-1');
    expect(run.items[0]).toMatchObject({ employeeName: 'Ayesha Khan', gross: 100_000, net: 95_000 });
    expect(mapPayrollRun({}).status).toBe('draft');
  });
});
