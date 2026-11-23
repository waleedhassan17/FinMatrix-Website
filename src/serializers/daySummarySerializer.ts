// ═══════════════════════════════════════════════════════
// FinMatrix Web — Day Summary serializer
// ═══════════════════════════════════════════════════════
// GET /reports/day-summary, /reports/day-summary/entries and the digest
// schedule. Every field is coerced rather than trusted, the same way the
// dashboard serializer reads its payload: a missing number is 0, never NaN.

import { toNumber, type MoneyInput } from '@/utils/money';

export const DAY_DOC_KINDS = [
  'invoice',
  'sales_order',
  'estimate',
  'receipt',
  'credit_memo',
  'bill',
  'purchase_order',
  'vendor_payment',
  'vendor_credit',
] as const;
export type DayDocKind = (typeof DAY_DOC_KINDS)[number];

/** The Day Book filters beyond a single document type. */
export const DAY_ENTRY_FILTERS = ['all', 'backdated', 'drafts', 'voided', 'cancelled'] as const;
export type DayEntryFilter = (typeof DAY_ENTRY_FILTERS)[number] | DayDocKind;

/** How the Day Book is ordered; `newest` (by entry time) is the default. */
export const DAY_ENTRY_SORTS = ['newest', 'oldest', 'amount_desc', 'amount_asc'] as const;
export type DayEntrySort = (typeof DAY_ENTRY_SORTS)[number];

export interface DayFigure {
  count: number;
  total: number;
}

export interface DayKpi extends DayFigure {
  previousDay: DayFigure;
  sameDayLastWeek: DayFigure;
  /** The 7 days ending on the summary's date, oldest first. */
  trend: number[];
}

export interface DayDocumentRow extends DayFigure {
  kind: DayDocKind;
}

export interface DayMethodRow {
  method: string;
  received: number;
  paid: number;
}

export interface DayPartyRow extends DayFigure {
  id: string;
  name: string;
}

export interface DayItemRow {
  itemId: string | null;
  name: string;
  quantity: number;
  total: number;
}

export interface DayHourRow {
  /** 0–23, company time. */
  hour: number;
  sales: number;
  salesCount: number;
  received: number;
  receivedCount: number;
}

export interface DayUserRow {
  userId: string | null;
  name: string;
  invoices: DayFigure;
  salesOrders: DayFigure;
  estimates: DayFigure;
  receipts: DayFigure;
  documents: number;
}

export interface DayMember {
  id: string;
  name: string;
  role: string;
}

export interface DaySummary {
  date: string;
  today: string;
  timezone: string;
  currency: string;
  scope: { ownOnly: boolean; createdBy: { id: string; name: string } | null };
  kinds: DayDocKind[];
  headline: {
    sales: DayKpi;
    received: DayKpi;
    orders: DayKpi | null;
    purchases: DayKpi;
  };
  trendDates: string[];
  documents: DayDocumentRow[];
  sales: {
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    unpaid: number;
    /** Customer returns (credit memos) dated the day, tax included. */
    returns: number;
    /** total − returns. */
    net: number;
  };
  cash: { methods: DayMethodRow[]; received: number; paid: number; net: number };
  topCustomers: DayPartyRow[];
  topItems: DayItemRow[];
  /** 24 rows: the day's sales and receipts by the hour they were entered. */
  hourly: DayHourRow[];
  team: DayUserRow[] | null;
  members: DayMember[] | null;
  profit: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    expenses: number;
    netIncome: number;
  } | null;
  attention: {
    backdated: number;
    drafts: number;
    cancelledOrders: number;
    voided: DayFigure | null;
  };
  isEmpty: boolean;
  generatedAt: string;
}

export interface DayEntry {
  kind: DayDocKind;
  id: string;
  number: string | null;
  date: string;
  createdAt: string;
  partyId: string | null;
  partyName: string | null;
  amount: number;
  status: string | null;
  createdBy: { id: string; name: string } | null;
  backdated: boolean;
  counted: boolean;
  deleted: boolean;
}

export interface DayEntriesPage {
  date: string;
  filter: DayEntryFilter;
  q: string | null;
  sort: DayEntrySort;
  /** This page's rows. */
  items: DayEntry[];
  /** Rows matching the filter and search, across every page. */
  total: number;
  /** Their amounts the day's totals count, across every page. */
  countedTotal: number;
  /** Their amounts the totals leave out (drafts, voids, cancelled). */
  excludedTotal: number;
  page: number;
  limit: number;
  pages: number;
}

/** What the item sheet compares itself with. */
export const DAY_ITEM_COMPARES = ['previous', 'lastWeek'] as const;
export type DayItemCompare = (typeof DAY_ITEM_COMPARES)[number];

/**
 * One line of the item-wise sales sheet: a stock item, or a service or charge
 * named by its wording. `net` = sold + free − returned; `value` is net sales
 * (before tax, after the invoice's discount, less returns).
 */
export interface DayItemSheetRow {
  kind: 'item' | 'service';
  itemId: string | null;
  code: string | null;
  name: string;
  unit: string | null;
  category: string | null;
  agency: string | null;
  sold: number;
  free: number;
  returned: number;
  net: number;
  value: number;
  returnsValue: number;
  /** Owner only. */
  cost: number | null;
  profit: number | null;
  margin: number | null;
  costMissing: boolean;
  /** Net sales in the comparison period; null when none was asked for. */
  compareValue: number | null;
}

/** Sold only in the comparison period: counted in a group's comparison. */
export interface DayItemCompareOnly {
  kind: 'item' | 'service';
  itemId: string | null;
  name: string;
  category: string | null;
  agency: string | null;
  compareValue: number;
}

export interface DayReorderRow {
  itemId: string;
  code: string;
  name: string;
  unit: string | null;
  onHand: number;
  reorderPoint: number;
  reorderQuantity: number;
  outOfStock: boolean;
}

export interface DayItemSheet {
  from: string;
  to: string;
  today: string;
  currency: string;
  scope: DaySummary['scope'];
  compare: DayItemCompare | null;
  compareFrom: string | null;
  compareTo: string | null;
  rows: DayItemSheetRow[];
  compareOnly: DayItemCompareOnly[];
  totals: {
    lines: number;
    sold: number;
    free: number;
    returned: number;
    net: number;
    value: number;
    returnsValue: number;
    cost: number | null;
    profit: number | null;
    margin: number | null;
    compareValue: number | null;
  };
  hasFree: boolean;
  showCost: boolean;
  reconciliation: { salesBeforeTax: number; returns: number; netSales: number; matches: boolean };
  /** Null when the plan keeps no stock. */
  reorder: DayReorderRow[] | null;
  generatedAt: string;
}

export interface DaySummarySchedule {
  enabled: boolean;
  hour: number;
  email: boolean;
  timezone: string;
  lastSent: string | null;
}

type Raw = Record<string, unknown>;

const obj = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const int = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const money = (v: unknown): number => {
  try {
    const n = toNumber((v ?? 0) as MoneyInput);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
};
const isKind = (v: unknown): v is DayDocKind =>
  typeof v === 'string' && (DAY_DOC_KINDS as readonly string[]).includes(v);

const figure = (v: unknown): DayFigure => {
  const r = obj(v);
  return { count: int(r.count), total: money(r.total) };
};

const kpi = (v: unknown): DayKpi => {
  const r = obj(v);
  return {
    ...figure(r),
    previousDay: figure(r.previousDay),
    sameDayLastWeek: figure(r.sameDayLastWeek),
    trend: arr(r.trend).map(money),
  };
};

const person = (v: unknown): { id: string; name: string } | null => {
  const r = obj(v);
  const id = strOrNull(r.id);
  return id ? { id, name: str(r.name, 'Unnamed') } : null;
};

export const daySummarySerializer = (raw: unknown): DaySummary => {
  const r = obj(raw);
  const headline = obj(r.headline);
  const scope = obj(r.scope);
  const sales = obj(r.sales);
  const cash = obj(r.cash);
  const attention = obj(r.attention);
  const profit = r.profit ? obj(r.profit) : null;
  return {
    date: str(r.date),
    today: str(r.today),
    timezone: str(r.timezone, 'Asia/Karachi'),
    currency: str(r.currency, 'PKR'),
    scope: { ownOnly: scope.ownOnly === true, createdBy: person(scope.createdBy) },
    kinds: arr(r.kinds).filter(isKind),
    headline: {
      sales: kpi(headline.sales),
      received: kpi(headline.received),
      orders: headline.orders ? kpi(headline.orders) : null,
      purchases: kpi(headline.purchases),
    },
    trendDates: arr(r.trendDates).map((d) => str(d)),
    documents: arr(r.documents)
      .map(obj)
      .filter((d) => isKind(d.kind))
      .map((d) => ({ kind: d.kind as DayDocKind, ...figure(d) })),
    sales: {
      subtotal: money(sales.subtotal),
      discount: money(sales.discount),
      tax: money(sales.tax),
      total: money(sales.total),
      unpaid: money(sales.unpaid),
      returns: money(sales.returns),
      // An older server sends no `net`: nothing was netted, so it is the total.
      net: sales.net === undefined ? money(sales.total) : money(sales.net),
    },
    cash: {
      methods: arr(cash.methods)
        .map(obj)
        .map((m) => ({ method: str(m.method, 'other'), received: money(m.received), paid: money(m.paid) })),
      received: money(cash.received),
      paid: money(cash.paid),
      net: money(cash.net),
    },
    topCustomers: arr(r.topCustomers)
      .map(obj)
      .map((c) => ({ id: str(c.id), name: str(c.name, 'Unnamed customer'), ...figure(c) })),
    topItems: arr(r.topItems)
      .map(obj)
      .map((i) => ({
        itemId: strOrNull(i.itemId),
        name: str(i.name, 'Item'),
        quantity: money(i.quantity),
        total: money(i.total),
      })),
    hourly: (() => {
      const byHour = new Map(arr(r.hourly).map(obj).map((h) => [int(h.hour), h]));
      return Array.from({ length: 24 }, (_, hour) => {
        const h = byHour.get(hour) ?? {};
        return {
          hour,
          sales: money(h.sales),
          salesCount: int(h.salesCount),
          received: money(h.received),
          receivedCount: int(h.receivedCount),
        };
      });
    })(),
    team: Array.isArray(r.team)
      ? r.team.map(obj).map((t) => ({
          userId: strOrNull(t.userId),
          name: str(t.name, 'Unnamed'),
          invoices: figure(t.invoices),
          salesOrders: figure(t.salesOrders),
          estimates: figure(t.estimates),
          receipts: figure(t.receipts),
          documents: int(t.documents),
        }))
      : null,
    members: Array.isArray(r.members)
      ? r.members.map(obj).map((m) => ({ id: str(m.id), name: str(m.name, 'Unnamed'), role: str(m.role) }))
      : null,
    profit: profit
      ? {
          revenue: money(profit.revenue),
          cogs: money(profit.cogs),
          grossProfit: money(profit.grossProfit),
          expenses: money(profit.expenses),
          netIncome: money(profit.netIncome),
        }
      : null,
    attention: {
      backdated: int(attention.backdated),
      drafts: int(attention.drafts),
      cancelledOrders: int(attention.cancelledOrders),
      voided: attention.voided ? figure(attention.voided) : null,
    },
    isEmpty: r.isEmpty === true,
    generatedAt: str(r.generatedAt),
  };
};

export const dayEntriesSerializer = (raw: unknown): DayEntriesPage => {
  const r = obj(raw);
  return {
    date: str(r.date),
    filter: (str(r.filter, 'all') as DayEntryFilter) || 'all',
    items: arr(r.items)
      .map(obj)
      .filter((e) => isKind(e.kind))
      .map((e) => ({
        kind: e.kind as DayDocKind,
        id: str(e.id),
        number: strOrNull(e.number),
        date: str(e.date),
        createdAt: str(e.createdAt),
        partyId: strOrNull(e.partyId),
        partyName: strOrNull(e.partyName),
        amount: money(e.amount),
        status: strOrNull(e.status),
        createdBy: person(e.createdBy),
        backdated: e.backdated === true,
        counted: e.counted !== false,
        deleted: e.deleted === true,
      })),
    total: int(r.total),
    countedTotal: money(r.countedTotal),
    excludedTotal: money(r.excludedTotal),
    q: strOrNull(r.q),
    sort: (DAY_ENTRY_SORTS as readonly string[]).includes(String(r.sort)) ? (r.sort as DayEntrySort) : 'newest',
    page: int(r.page) || 1,
    limit: int(r.limit) || 50,
    pages: int(r.pages),
  };
};

const moneyOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : money(v));
const lineKind = (v: unknown): 'item' | 'service' => (v === 'service' ? 'service' : 'item');

export const dayItemSheetSerializer = (raw: unknown): DayItemSheet => {
  const r = obj(raw);
  const scope = obj(r.scope);
  const totals = obj(r.totals);
  const tie = obj(r.reconciliation);
  const compare = (DAY_ITEM_COMPARES as readonly string[]).includes(String(r.compare))
    ? (r.compare as DayItemCompare)
    : null;
  return {
    from: str(r.from),
    to: str(r.to, str(r.from)),
    today: str(r.today),
    currency: str(r.currency, 'PKR'),
    scope: { ownOnly: scope.ownOnly === true, createdBy: person(scope.createdBy) },
    compare,
    compareFrom: strOrNull(r.compareFrom),
    compareTo: strOrNull(r.compareTo),
    rows: arr(r.rows)
      .map(obj)
      .map((x) => ({
        kind: lineKind(x.kind),
        itemId: strOrNull(x.itemId),
        code: strOrNull(x.code),
        name: str(x.name, 'Item'),
        unit: strOrNull(x.unit),
        category: strOrNull(x.category),
        agency: strOrNull(x.agency),
        sold: money(x.sold),
        free: money(x.free),
        returned: money(x.returned),
        net: money(x.net),
        value: money(x.value),
        returnsValue: money(x.returnsValue),
        cost: moneyOrNull(x.cost),
        profit: moneyOrNull(x.profit),
        margin: moneyOrNull(x.margin),
        costMissing: x.costMissing === true,
        compareValue: moneyOrNull(x.compareValue),
      })),
    compareOnly: arr(r.compareOnly)
      .map(obj)
      .map((x) => ({
        kind: lineKind(x.kind),
        itemId: strOrNull(x.itemId),
        name: str(x.name, 'Item'),
        category: strOrNull(x.category),
        agency: strOrNull(x.agency),
        compareValue: money(x.compareValue),
      })),
    totals: {
      lines: int(totals.lines),
      sold: money(totals.sold),
      free: money(totals.free),
      returned: money(totals.returned),
      net: money(totals.net),
      value: money(totals.value),
      returnsValue: money(totals.returnsValue),
      cost: moneyOrNull(totals.cost),
      profit: moneyOrNull(totals.profit),
      margin: moneyOrNull(totals.margin),
      compareValue: moneyOrNull(totals.compareValue),
    },
    hasFree: r.hasFree === true,
    showCost: r.showCost === true,
    reconciliation: {
      salesBeforeTax: money(tie.salesBeforeTax),
      returns: money(tie.returns),
      netSales: money(tie.netSales),
      matches: tie.matches === true,
    },
    reorder: Array.isArray(r.reorder)
      ? r.reorder.map(obj).map((x) => ({
          itemId: str(x.itemId),
          code: str(x.code),
          name: str(x.name, 'Item'),
          unit: strOrNull(x.unit),
          onHand: money(x.onHand),
          reorderPoint: money(x.reorderPoint),
          reorderQuantity: money(x.reorderQuantity),
          outOfStock: x.outOfStock === true,
        }))
      : null,
    generatedAt: str(r.generatedAt),
  };
};

export const dayScheduleSerializer = (raw: unknown): DaySummarySchedule => {
  const r = obj(raw);
  const hour = int(r.hour);
  return {
    enabled: r.enabled === true,
    hour: hour >= 0 && hour <= 23 ? hour : 21,
    email: r.email !== false,
    timezone: str(r.timezone, 'Asia/Karachi'),
    lastSent: strOrNull(r.lastSent),
  };
};
