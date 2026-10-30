// ═══════════════════════════════════════════════════════
// FinMatrix Web — Insight serializers (reports v2)
// ═══════════════════════════════════════════════════════
// Financial health, inventory health and the owner cockpit. Every ratio and
// day-count here is computed once, on the server, in reports-kpi.service.ts;
// these mappers only coerce and default. A KPI the server could not compute
// stays null — see kpiSerializer.

import type { BudgetVsActual } from '@/models/budget';
import type { BusinessInsight, InsightTone } from '@/models/insights';
import { mapVsActual } from '@/serializers/budgetSerializer';
import { asRaw, str } from '@/serializers/documentLines';
import {
  assessmentSerializer,
  kpiMapSerializer,
  kpiOrNumber,
  numberOrNull,
  type Kpi,
  type KpiAssessment,
} from '@/serializers/kpiSerializer';
import type { ReportRangeMeta } from '@/serializers/reportSerializers';
import { toNumber } from '@/utils/money';

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const mapRange = (raw: unknown): ReportRangeMeta => {
  const r = asRaw(raw);
  return { startDate: str(r.startDate), endDate: str(r.endDate) };
};

// ═══════════════════════════════════════════════════════
// Financial health — GET /reports/financial-health?asOfDate
// ═══════════════════════════════════════════════════════

export interface FinancialHealth {
  asOfDate: string;
  /** Keyed by KPI key: workingCapital, currentRatio, quickRatio, debtToEquity, dso, … */
  kpis: Record<string, Kpi>;
}

export const financialHealthSerializer = (payload: unknown): FinancialHealth => {
  const r = asRaw(payload);
  const kpis = kpiMapSerializer(payload);
  const first = Object.values(kpis)[0];
  return { asOfDate: str(r.asOfDate, first?.asOfDate ?? ''), kpis };
};

// ═══════════════════════════════════════════════════════
// Inventory health — GET /reports/inventory-health?asOfDate
// ═══════════════════════════════════════════════════════

export interface BelowReorderItem {
  itemId: string;
  name: string;
  sku: string;
  qtyOnHand: number;
  reorderPoint: number;
  reorderQuantity: number;
  /** max(reorderQuantity, reorderPoint − qtyOnHand), from the server. */
  suggestedOrderQty: number;
  /** Null when the record could not value the item — shown as "—", never 0. */
  stockValue: number | null;
}

export interface StockAgeBucket {
  key: string;
  label: string;
  value: number;
  count: number;
}

export interface DeadStockItem {
  itemId: string;
  name: string;
  sku: string;
  qty: number;
  /** Null when the record could not value the item — shown as "—", never 0. */
  value: number | null;
  /** Null when the item has never gone out. */
  lastOutboundDate: string | null;
}

export interface LocationValue {
  location: string;
  value: number;
  count: number;
}

export interface InventoryHealth {
  asOfDate: string;
  belowReorder: BelowReorderItem[];
  /** Days since last inbound: 0–30 / 31–90 / 91–180 / 180+. */
  aging: StockAgeBucket[];
  /** Days since last outbound, the same buckets (empty from a server that sends one series). */
  agingOutbound: StockAgeBucket[];
  deadStock: { items: DeadStockItem[]; totalValue: number };
  turnover: Kpi | null;
  dio: Kpi | null;
  /** 'Unassigned' for stock with no location. */
  byLocation: LocationValue[];
}

const AGE_LABELS: Record<string, string> = {
  d0_30: '0–30 days',
  d31_90: '31–90 days',
  d91_180: '91–180 days',
  d180_plus: 'Over 180 days',
  noMovement: 'No movement recorded',
};

/** Buckets as an array of `{ key, label, value, count }` or a keyed map of them. */
const mapAgeBuckets = (raw: unknown): StockAgeBucket[] => {
  const one = (key: string, v: unknown): StockAgeBucket => {
    const b = asRaw(v);
    const k = str(b.key, key);
    return {
      key: k,
      label: str(b.label, AGE_LABELS[k] ?? k),
      value: toNumber(b.value as never),
      count: toNumber(b.count as never),
    };
  };
  if (Array.isArray(raw)) return raw.map((b, i) => one(`b${i}`, b));
  const r = asRaw(raw);
  const buckets = Array.isArray(r.buckets) ? (r.buckets as unknown[]) : null;
  if (buckets) return buckets.map((b, i) => one(`b${i}`, b));
  return Object.entries(r).map(([key, value]) => one(key, value));
};

export const inventoryHealthSerializer = (payload: unknown): InventoryHealth => {
  const r = asRaw(payload);
  // `deadStock` as `{ items, totalValue }` or as a bare list beside `deadStockValue`.
  const dead = r.deadStock;
  const deadItems = Array.isArray(dead) ? dead : list(asRaw(dead).items);
  const deadTotal = Array.isArray(dead)
    ? r.deadStockValue
    : (asRaw(dead).totalValue ?? r.deadStockValue);
  return {
    asOfDate: str(r.asOfDate),
    belowReorder: list(r.belowReorder).map((raw) => {
      const i = asRaw(raw);
      return {
        itemId: str(i.itemId),
        name: str(i.name ?? i.itemName),
        sku: str(i.sku),
        qtyOnHand: toNumber(i.qtyOnHand as never),
        reorderPoint: toNumber(i.reorderPoint as never),
        reorderQuantity: toNumber(i.reorderQuantity as never),
        suggestedOrderQty: toNumber(i.suggestedOrderQty as never),
        stockValue: numberOrNull(i.stockValue),
      };
    }),
    // `{ byLastInbound, byLastOutbound }` in the contract; a bare list (or map)
    // is read as the inbound series.
    aging: mapAgeBuckets(asRaw(r.aging).byLastInbound ?? r.aging),
    agingOutbound: Array.isArray(asRaw(r.aging).byLastOutbound) ? mapAgeBuckets(asRaw(r.aging).byLastOutbound) : [],
    deadStock: {
      items: deadItems.map((raw) => {
        const i = asRaw(raw);
        return {
          itemId: str(i.itemId),
          name: str(i.name ?? i.itemName),
          sku: str(i.sku),
          qty: toNumber((i.qty ?? i.qtyOnHand) as never),
          value: numberOrNull(i.value ?? i.stockValue),
          lastOutboundDate: i.lastOutboundDate ? str(i.lastOutboundDate) : null,
        };
      }),
      totalValue: toNumber(deadTotal as never),
    },
    turnover: kpiOrNumber(r.turnover, 'turnover', 'Inventory turnover', 'ratio'),
    dio: kpiOrNumber(r.dio, 'dio', 'Days inventory outstanding', 'days'),
    byLocation: list(r.byLocation).map((raw) => {
      const l = asRaw(raw);
      return {
        location: str(l.location ?? l.name, 'Unassigned') || 'Unassigned',
        value: toNumber(l.value as never),
        count: toNumber(l.count as never),
      };
    }),
  };
};

// ═══════════════════════════════════════════════════════
// Owner cockpit — GET /reports/analytics?startDate&endDate
// ═══════════════════════════════════════════════════════

/** One month of the cockpit's GL-based series. Zero-filled by the server. */
export interface CockpitMonth {
  period: string;
  label: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netIncome: number;
  operatingCashFlow: number;
  /** Null for a month the server has no closing for. */
  endingCash: number | null;
}

export interface CockpitExpense {
  accountCode: string;
  label: string;
  amount: number;
  /** Share of operating expenses (0–100), from the server; null for a credit. */
  sharePct: number | null;
}

export interface CockpitCustomer {
  customerId: string;
  name: string;
  amount: number;
  /** Share of invoiced sales (0–100), from the server. */
  sharePct: number | null;
  invoices: number;
}

export interface OwnerCockpit {
  range: ReportRangeMeta;
  /** The immediately preceding period of equal length, chosen by the server. */
  comparisonRange: ReportRangeMeta;
  series: CockpitMonth[];
  /** revenue, grossMarginPct, netMarginPct, operatingExpenses, operatingCashFlow,
   *  endingCash, runwayMonths, dso, dpo, dio, ccc — each with prior and change. */
  kpis: Record<string, Kpi>;
  /** Top 8 accounts plus 'Other', as the server folds them. */
  expenseByAccount: CockpitExpense[];
  salesByCustomer: {
    /** 'invoice basis' — sales from invoice subtotals, not the ledger. */
    basis: string;
    customers: CockpitCustomer[];
    /** Customers past the top ten, folded by the server. */
    other: { count: number; amount: number; sharePct: number | null } | null;
    top5SharePct: number | null;
    /** The top-five share against its rule of thumb. */
    assessment: KpiAssessment | null;
    total: number;
    /** What the basis means, in the server's words. */
    note: string;
  };
  budgetVsActual: BudgetVsActual | null;
  health: FinancialHealth | null;
  /** What stands out, most pressing first — the server's sentences. Empty from an older server. */
  insights: BusinessInsight[];
}

const TONES: ReadonlySet<string> = new Set(['negative', 'warning', 'positive', 'neutral']);

export const insightsSerializer = (raw: unknown): BusinessInsight[] =>
  list(raw)
    .map((item) => {
      const i = asRaw(item);
      const report = asRaw(i.report);
      const params = Object.fromEntries(
        Object.entries(asRaw(report.params)).map(([k, v]) => [k, str(v)]),
      );
      return {
        key: str(i.key),
        tone: (TONES.has(str(i.tone)) ? str(i.tone) : 'neutral') as InsightTone,
        title: str(i.title),
        detail: str(i.detail),
        report: { key: str(report.key), params },
      };
    })
    .filter((i) => i.title);

const SERIES_KEYS = [
  'revenue',
  'cogs',
  'grossProfit',
  'operatingExpenses',
  'netIncome',
  'operatingCashFlow',
  'endingCash',
] as const;

/**
 * The monthly series, as an array of month rows or as one array per measure
 * (`{ revenue: [{ period, label, value }], … }`). Both become month rows.
 */
const mapSeries = (raw: unknown): CockpitMonth[] => {
  const blank = (period: string, label: string): CockpitMonth => ({
    period,
    label,
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    operatingExpenses: 0,
    netIncome: 0,
    operatingCashFlow: 0,
    endingCash: 0,
  });
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      const m = asRaw(item);
      const row = blank(str(m.period ?? m.month), str(m.label));
      for (const k of SERIES_KEYS) {
        if (k === 'endingCash') row.endingCash = numberOrNull(m.endingCash);
        else row[k] = toNumber(m[k] as never);
      }
      return row;
    });
  }
  const r = asRaw(raw);
  const months = new Map<string, CockpitMonth>();
  for (const k of SERIES_KEYS) {
    list(r[k]).forEach((point, i) => {
      const p = asRaw(point);
      const period = str(p.period ?? p.month, String(i));
      const row = months.get(period) ?? blank(period, str(p.label));
      row[k] = toNumber(p.value as never);
      months.set(period, row);
    });
  }
  return [...months.values()];
};

export const ownerCockpitSerializer = (payload: unknown): OwnerCockpit => {
  const r = asRaw(payload);
  const sales = asRaw(r.salesByCustomer);
  const customers = Array.isArray(r.salesByCustomer)
    ? (r.salesByCustomer as unknown[])
    : list(sales.customers ?? sales.top ?? sales.rows);
  return {
    range: mapRange(r.range),
    comparisonRange: mapRange(r.comparisonRange ?? r.priorRange),
    series: mapSeries(r.series),
    kpis: kpiMapSerializer(r.kpis ?? {}),
    expenseByAccount: list(r.expenseByAccount).map((raw) => {
      const e = asRaw(raw);
      return {
        accountCode: str(e.accountCode),
        label: str(e.label ?? e.accountName, 'Other'),
        amount: toNumber(e.amount as never),
        sharePct: numberOrNull(e.sharePct),
      };
    }),
    salesByCustomer: {
      // `label` is the words ('invoice basis'); `basis` the code ('invoice').
      basis: str(sales.label) || str(sales.basis, 'invoice basis'),
      note: str(sales.note),
      other:
        sales.other && toNumber(asRaw(sales.other).count as never) > 0
          ? {
              count: toNumber(asRaw(sales.other).count as never),
              amount: toNumber(asRaw(sales.other).amount as never),
              sharePct: numberOrNull(asRaw(sales.other).sharePct),
            }
          : null,
      customers: customers.map((raw) => {
        const c = asRaw(raw);
        return {
          customerId: str(c.customerId),
          name: str(c.name ?? c.customerName, 'Unknown'),
          amount: toNumber(c.amount as never),
          sharePct: numberOrNull(c.sharePct),
          invoices: toNumber(c.invoices as never),
        };
      }),
      top5SharePct: numberOrNull(sales.top5SharePct ?? r.top5SharePct),
      assessment: assessmentSerializer(sales.assessment),
      total: toNumber(sales.total as never),
    },
    budgetVsActual: r.budgetVsActual ? mapVsActual(r.budgetVsActual) : null,
    health: r.health ? financialHealthSerializer(r.health) : null,
    insights: insightsSerializer(r.insights),
  };
};
