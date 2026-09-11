// ═══════════════════════════════════════════════════════
// FinMatrix Web — Budget serializer
// ═══════════════════════════════════════════════════════
// Budget lines carry their twelve months as a numeric JSON array; totals are
// decimal strings. Account details ride along under a few different names
// depending on the route (accountNumber/accountCode, name/accountName), so all
// of them are read.

import type {
  Budget,
  BudgetLine,
  BudgetStatus,
  BudgetVsActual,
  PrefillLine,
  VsActualRow,
} from '@/models/budget';
import { toNumber } from '@/utils/money';

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown): number => toNumber(v as never);

const twelve = (v: unknown): number[] => {
  const arr = Array.isArray(v) ? v.map(num) : [];
  while (arr.length < 12) arr.push(0);
  return arr.slice(0, 12);
};

const status = (v: unknown): BudgetStatus =>
  v === 'active' || v === 'closed' ? v : 'draft';

export const mapBudgetLine = (raw: unknown): BudgetLine => {
  const r = asRaw(raw);
  const account = asRaw(r.account);
  const months = twelve(r.monthlyAmounts);
  return {
    id: str(r.id),
    accountId: str(r.accountId),
    accountNumber: str(r.accountNumber ?? r.accountCode ?? account.accountNumber),
    accountName: str(r.accountName ?? account.name),
    accountType: str(r.accountType ?? account.type),
    monthlyAmounts: months,
    annualTotal: r.annualTotal !== undefined ? num(r.annualTotal) : months.reduce((s, v) => s + v, 0),
  };
};

export const mapBudget = (raw: unknown): Budget => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    name: str(r.name),
    fiscalYear: num(r.fiscalYear),
    status: status(r.status),
    totalBudget: num(r.totalBudget),
    createdAt: str(r.createdAt),
    lines: Array.isArray(r.lines) ? r.lines.map(mapBudgetLine) : [],
  };
};

const mapRow = (raw: unknown): VsActualRow => {
  const r = asRaw(raw);
  return {
    accountId: str(r.accountId),
    accountCode: str(r.accountCode),
    accountName: str(r.accountName),
    accountType: str(r.accountType),
    budgeted: num(r.budgeted),
    actual: num(r.actual),
    variance: num(r.variance),
    percentUsed: num(r.percentUsed),
    months: (Array.isArray(r.months) ? r.months : []).map((m) => {
      const x = asRaw(m);
      return {
        month: num(x.month),
        budgeted: num(x.budgeted),
        actual: num(x.actual),
        variance: num(x.variance),
      };
    }),
  };
};

export const mapVsActual = (raw: unknown): BudgetVsActual => {
  const r = asRaw(raw);
  const b = asRaw(r.budget);
  const t = asRaw(r.totals);
  return {
    budget: { id: str(b.id), name: str(b.name), fiscalYear: num(b.fiscalYear), status: status(b.status) },
    rows: (Array.isArray(r.rows) ? r.rows : []).map(mapRow),
    totals: { budgeted: num(t.budgeted), actual: num(t.actual), variance: num(t.variance) },
  };
};

export const mapPrefill = (raw: unknown): PrefillLine[] =>
  (Array.isArray(asRaw(raw).lines) ? (asRaw(raw).lines as unknown[]) : []).map((l) => {
    const r = asRaw(l);
    return {
      accountId: str(r.accountId),
      accountCode: str(r.accountCode),
      accountName: str(r.accountName),
      accountType: str(r.accountType),
      monthlyAmounts: twelve(r.monthlyAmounts),
      annualTotal: num(r.annualTotal),
    };
  });
