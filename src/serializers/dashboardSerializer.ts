// ═══════════════════════════════════════════════════════
// FinMatrix Web — Dashboard Serializer
// ═══════════════════════════════════════════════════════
// Defensive raw→model mapping, ported from the app's
// src/serializers/adminDashboardSerializer.ts.
//
// Every field is read through a coercion rather than trusted. TypeORM emits
// DECIMAL columns as strings, so `totalRevenue` arrives as "125000.00" about as
// often as 125000 — and `Number(undefined)` is NaN, which renders as "NaN" in a
// KPI tile if nobody checks.

import { toNumber, type MoneyInput } from '@/utils/money';

export interface RecentTransaction {
  id: string;
  type: 'invoice' | 'bill' | 'payment' | 'other';
  description: string;
  date: string;
  amount: number;
  status: string;
}

export interface DashboardAlert {
  id: string;
  severity: 'info' | 'warning' | 'danger';
  message: string;
}

/** Delivery orders by status, company-wide. */
export interface DeliveryCounts {
  pending: number;
  assigned: number;
  inTransit: number;
  delivered: number;
  failed: number;
  total: number;
}

export interface DashboardData {
  totalRevenue: number;
  totalExpenses: number;
  /** Money customers owe us. */
  outstandingAR: number;
  /** Money we owe vendors. */
  pendingAP: number;
  /** Revenue minus expenses for the period. Derived, not sent. */
  netIncome: number;
  inventoryItems: number;
  deliveries: DeliveryCounts;
  recentTransactions: RecentTransaction[];
  alerts: DashboardAlert[];
  period?: { startDate?: string; endDate?: string } | null;
  /** True when the company has no transactions at all — show the checklist. */
  isEmpty: boolean;
}

const num = (v: MoneyInput): number => toNumber(v);

const asArray = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as Record<string, unknown>[]) : [];

const TXN_TYPES = new Set(['invoice', 'bill', 'payment']);

const transactionSerializer = (
  raw: Record<string, unknown>,
): RecentTransaction => {
  const type = String(raw.type ?? 'other');
  return {
    id: String(raw.id ?? ''),
    type: (TXN_TYPES.has(type) ? type : 'other') as RecentTransaction['type'],
    description: String(
      raw.description ?? raw.invoiceNumber ?? raw.number ?? raw.id ?? '',
    ),
    date: String(raw.date ?? raw.invoiceDate ?? raw.issueDate ?? ''),
    amount: num(raw.amount as MoneyInput) || num(raw.total as MoneyInput),
    status: String(raw.status ?? 'draft'),
  };
};

// The server names severities by colour (red / amber / blue), the same words
// the app's AlertBanner keys on. Reading only the semantic names turned every
// alert into `info`, so an overdue invoice rendered like a delivery notice.
const SEVERITY: Record<string, DashboardAlert['severity']> = {
  red: 'danger',
  amber: 'warning',
  blue: 'info',
  danger: 'danger',
  warning: 'warning',
  info: 'info',
};

const alertSerializer = (
  raw: Record<string, unknown>,
  index: number,
): DashboardAlert => ({
  id: String(raw.id ?? index),
  severity: SEVERITY[String(raw.severity)] ?? 'info',
  message: String(raw.message ?? raw.text ?? ''),
});

const deliveryCounts = (breakdown: unknown, total: unknown): DeliveryCounts => {
  const b = (breakdown ?? {}) as Record<string, unknown>;
  const counts = {
    pending: num(b.pending as MoneyInput),
    assigned: num(b.assigned as MoneyInput),
    inTransit: num(b.in_transit as MoneyInput),
    delivered: num(b.delivered as MoneyInput),
    failed: num(b.failed as MoneyInput),
  };
  return {
    ...counts,
    // The server's own total also counts cancelled and unassigned orders, which
    // none of the fields above carry. Summed as a fallback only.
    total:
      num(total as MoneyInput) ||
      Object.values(counts).reduce((t, n) => t + n, 0),
  };
};

export const dashboardSerializer = (raw: unknown): DashboardData => {
  // The app unwraps one more level here (`summaryRaw?.data ?? summaryRaw`)
  // because the summary has been seen double-wrapped. Cheap to keep.
  const outer = (raw ?? {}) as Record<string, unknown>;
  const d = ((outer.data as Record<string, unknown>) ?? outer) || {};

  const totalRevenue = num(d.totalRevenue as MoneyInput);
  const totalExpenses = num(d.totalExpenses as MoneyInput);
  const outstandingAR = num(d.outstandingAR as MoneyInput);
  const pendingAP = num(d.pendingAP as MoneyInput);
  const recentTransactions = asArray(d.recentTransactions).map(
    transactionSerializer,
  );

  return {
    totalRevenue,
    totalExpenses,
    outstandingAR,
    pendingAP,
    // Derived rather than read: the endpoint does not send a net income field,
    // and computing it here keeps the tile consistent with the P&L, which
    // derives it the same way.
    netIncome: totalRevenue - totalExpenses,
    inventoryItems: num(d.inventoryItems as MoneyInput),
    deliveries: deliveryCounts(d.deliveryBreakdown, d.deliveryTotal),
    recentTransactions,
    alerts: asArray(d.alerts).map(alertSerializer),
    period: (d.period as DashboardData['period']) ?? null,
    isEmpty:
      totalRevenue === 0 &&
      totalExpenses === 0 &&
      outstandingAR === 0 &&
      pendingAP === 0 &&
      recentTransactions.length === 0,
  };
};
