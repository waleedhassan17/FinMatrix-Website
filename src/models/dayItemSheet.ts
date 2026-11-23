// ═══════════════════════════════════════════════════════
// FinMatrix Web — Item-wise sales (the Day Summary's item sheet)
// ═══════════════════════════════════════════════════════
// The server sends one flat row per item (and per service or charge). Here
// they are grouped, sorted and searched, and the same groups feed the screen,
// the CSV and the PDF — so a printed sheet and the one on screen agree.

import type { ReportRow, ReportSection } from '@/features/reports/reportPdfTable';
import { dayChange, dayLongLabel } from '@/models/daySummary';
import { formatQty } from '@/models/inventory';
import { csvAmount, type CsvRow } from '@/models/reportCsv';
import type { DayItemSheet, DayItemSheetRow } from '@/serializers/daySummarySerializer';
import { formatMoney } from '@/utils/money';

export const ITEM_GROUPINGS = ['category', 'agency', 'none'] as const;
export type ItemGrouping = (typeof ITEM_GROUPINGS)[number];

export const ITEM_SORTS = ['code', 'name', 'value', 'net'] as const;
export type ItemSort = (typeof ITEM_SORTS)[number];

export const ITEM_SORT_LABELS: Record<ItemSort, string> = {
  code: 'Code',
  name: 'Name',
  value: 'Net sales',
  net: 'Net units',
};

export const GROUPING_LABELS: Record<ItemGrouping, string> = {
  category: 'Category',
  agency: 'Agency',
  none: 'None',
};

export const UNCATEGORIZED = 'Uncategorized';
export const NO_AGENCY = 'No agency';
export const SERVICES_GROUP = 'Services & other charges';

export interface SheetTotals {
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
}

export interface SheetGroup {
  key: string;
  label: string;
  /** Services and charges are always their own group, last. */
  services: boolean;
  /** "Uncategorized" / "No agency": items with no group of their own. */
  ungrouped: boolean;
  rows: DayItemSheetRow[];
  totals: SheetTotals;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** profit / value as a percentage, 1 dp, or null without a value. */
export const marginOf = (profit: number, value: number): number | null =>
  Math.abs(value) < 0.005 ? null : Math.round((profit / value) * 1000) / 10;

/** Totals of some rows, plus what the comparison period had for their group. */
const totalsOf = (rows: DayItemSheetRow[], showCost: boolean, compareValue: number | null): SheetTotals => {
  const sum = (pick: (r: DayItemSheetRow) => number) => r2(rows.reduce((t, r) => t + pick(r), 0));
  const value = sum((r) => r.value);
  // Gross profit and margin are the stock items': a service or charge carries
  // no cost of goods, so it adds sales but no profit line of its own.
  const itemValue = sum((r) => (r.kind === 'item' ? r.value : 0));
  const hasItems = rows.some((r) => r.kind === 'item');
  const cost = showCost && hasItems ? sum((r) => r.cost ?? 0) : null;
  const profit = cost === null ? null : r2(itemValue - cost);
  return {
    lines: rows.length,
    sold: sum((r) => r.sold),
    free: sum((r) => r.free),
    returned: sum((r) => r.returned),
    net: sum((r) => r.net),
    value,
    returnsValue: sum((r) => r.returnsValue),
    cost,
    profit,
    margin: profit === null ? null : marginOf(profit, itemValue),
    compareValue,
  };
};

const groupOf = (
  row: {
    kind: 'item' | 'service';
    category: string | null;
    agency: string | null;
  },
  by: ItemGrouping,
): { key: string; label: string; services: boolean; ungrouped: boolean } => {
  if (row.kind === 'service')
    return {
      key: 'services',
      label: SERVICES_GROUP,
      services: true,
      ungrouped: false,
    };
  if (by === 'none') return { key: 'all', label: 'Items', services: false, ungrouped: false };
  const raw = (by === 'category' ? row.category : row.agency)?.trim() ?? '';
  if (!raw) {
    return {
      key: 'none',
      label: by === 'category' ? UNCATEGORIZED : NO_AGENCY,
      services: false,
      ungrouped: true,
    };
  }
  // "Nestle Powder" and "NESTLE  POWDER" are one group: spelling is free text.
  return {
    key: `g:${raw.toLowerCase().replace(/\s+/g, ' ')}`,
    label: raw,
    services: false,
    ungrouped: false,
  };
};

const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const byCode = (a: DayItemSheetRow, b: DayItemSheetRow) => {
  if (a.code && b.code) return naturalCompare(a.code, b.code) || naturalCompare(a.name, b.name);
  if (a.code) return -1;
  if (b.code) return 1;
  return naturalCompare(a.name, b.name);
};

const ROW_ORDER: Record<ItemSort, (a: DayItemSheetRow, b: DayItemSheetRow) => number> = {
  code: byCode,
  name: (a, b) => naturalCompare(a.name, b.name) || byCode(a, b),
  value: (a, b) => b.value - a.value || byCode(a, b),
  net: (a, b) => b.net - a.net || b.value - a.value || byCode(a, b),
};

const matches = (q: string, row: { name: string; code?: string | null }) =>
  !q || row.name.toLowerCase().includes(q) || (row.code ?? '').toLowerCase().includes(q);

/**
 * The sheet as groups: each with its rows (sorted) and subtotal, items before
 * services, the ungrouped bucket last among the items. A search keeps only the
 * matching lines, and the totals follow what is shown.
 */
export function groupItemSheet(
  sheet: DayItemSheet,
  opts: { groupBy: ItemGrouping; sort: ItemSort; q?: string },
): { groups: SheetGroup[]; totals: SheetTotals; filtered: boolean } {
  const q = (opts.q ?? '').trim().toLowerCase();
  const rows = sheet.rows.filter((r) => matches(q, r));
  const comparing = sheet.compare !== null;

  const groups = new Map<string, SheetGroup & { before: number }>();
  const ensure = (g: ReturnType<typeof groupOf>) => {
    let found = groups.get(g.key);
    if (!found) {
      found = {
        ...g,
        rows: [],
        totals: totalsOf([], sheet.showCost, null),
        before: 0,
      };
      groups.set(g.key, found);
    }
    return found;
  };
  for (const r of rows) {
    const g = ensure(groupOf(r, opts.groupBy));
    g.rows.push(r);
    g.before += r.compareValue ?? 0;
  }
  // What sold only in the comparison period still counts in its group's
  // comparison — but adds no group of its own.
  if (comparing) {
    for (const c of sheet.compareOnly) {
      if (!matches(q, c)) continue;
      const g = groups.get(groupOf(c, opts.groupBy).key);
      if (g) g.before += c.compareValue;
    }
  }

  const ordered = [...groups.values()].map((g) => ({
    key: g.key,
    label: g.label,
    services: g.services,
    ungrouped: g.ungrouped,
    rows: [...g.rows].sort(ROW_ORDER[opts.sort]),
    totals: totalsOf(g.rows, sheet.showCost, comparing ? r2(g.before) : null),
  }));
  const bySize = opts.sort === 'value' || opts.sort === 'net';
  ordered.sort(
    (a, b) =>
      Number(a.services) - Number(b.services) ||
      Number(a.ungrouped) - Number(b.ungrouped) ||
      (bySize ? (opts.sort === 'net' ? b.totals.net - a.totals.net : b.totals.value - a.totals.value) : 0) ||
      naturalCompare(a.label, b.label),
  );

  const filtered = q !== '';
  const compareTotal = comparing
    ? filtered
      ? r2(ordered.reduce((t, g) => t + (g.totals.compareValue ?? 0), 0))
      : sheet.totals.compareValue
    : null;
  return {
    groups: ordered,
    totals: totalsOf(rows, sheet.showCost, compareTotal),
    filtered,
  };
}

/** "Thursday, 26 November 2026", or "25 Oct – 26 Oct 2026" for a range. */
export const sheetPeriodLabel = (from: string, to: string): string => {
  if (!from) return '—';
  if (!to || from === to) return dayLongLabel(from);
  const d = (iso: string) => new Date(`${iso}T00:00:00`);
  const short = (iso: string) => d(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const year = (iso: string) => d(iso).getFullYear();
  return year(from) === year(to)
    ? `${short(from)} – ${short(to)} ${year(to)}`
    : `${short(from)} ${year(from)} – ${short(to)} ${year(to)}`;
};

/** "+12%", "−8%", "New" or null — the change against the comparison period. */
export const sheetChange = (current: number, previous: number | null) =>
  previous === null ? null : dayChange(current, previous);

/** Quantities print without needless decimals; 0 prints as a dash. */
export const qtyCell = (n: number): string => (Math.abs(n) < 0.00005 ? '–' : formatQty(n));

const marginText = (m: number | null): string => (m === null ? '' : `${m.toFixed(1)}%`);

// ─── Exports ─────────────────────────────────────────────────────────────

interface Cols {
  free: boolean;
  cost: boolean;
  compare: boolean;
}

const colsOf = (sheet: DayItemSheet): Cols => ({
  free: sheet.hasFree,
  cost: sheet.showCost,
  compare: sheet.compare !== null,
});

/** The CSV: one row per line under its group heading, subtotals, the total. */
export const itemSheetCsvRows = (
  sheet: DayItemSheet,
  view: { groupBy: ItemGrouping; sort: ItemSort; q?: string },
): CsvRow[] => {
  const c = colsOf(sheet);
  const { groups, totals } = groupItemSheet(sheet, view);
  const head = [
    'Code',
    'Item',
    'Unit',
    'Sold',
    ...(c.free ? ['Free'] : []),
    'Returned',
    'Net units',
    'Net sales',
    ...(c.cost ? ['Cost', 'Gross profit', 'Margin %'] : []),
    ...(c.compare ? ['Compared'] : []),
  ];
  const figures = (t: Omit<SheetTotals, 'lines' | 'returnsValue'>): string[] => [
    String(t.sold),
    ...(c.free ? [String(t.free)] : []),
    String(t.returned),
    String(t.net),
    csvAmount(t.value),
    ...(c.cost ? [csvAmount(t.cost), csvAmount(t.profit), t.margin === null ? '' : t.margin.toFixed(1)] : []),
    ...(c.compare ? [csvAmount(t.compareValue)] : []),
  ];
  const out: CsvRow[] = [head];
  for (const g of groups) {
    out.push([g.label]);
    for (const r of g.rows) out.push([r.code ?? '', r.name, r.unit ?? '', ...figures(r)]);
    out.push(['', `Total ${g.label}`, '', ...figures(g.totals)]);
  }
  out.push(['', 'Grand total', '', ...figures(totals)]);
  out.push([]);
  out.push([
    'Net sales tie',
    `Invoices before tax ${csvAmount(sheet.reconciliation.salesBeforeTax)} less returns ${csvAmount(sheet.reconciliation.returns)} = ${csvAmount(sheet.reconciliation.netSales)}`,
  ]);
  return out;
};

/** The sheet as one PDF table, laid out like a distributor's sales summary. */
export const itemSheetPdfSection = (
  sheet: DayItemSheet,
  view: { groupBy: ItemGrouping; sort: ItemSort; q?: string },
  title = 'Item-wise sales',
): ReportSection => {
  const c = colsOf(sheet);
  const { groups, totals } = groupItemSheet(sheet, view);
  const cells = (t: Omit<SheetTotals, 'lines' | 'returnsValue'>) => [
    qtyCell(t.sold),
    ...(c.free ? [qtyCell(t.free)] : []),
    qtyCell(t.returned),
    qtyCell(t.net),
    t.value,
    ...(c.cost ? [t.profit, marginText(t.margin)] : []),
  ];
  const rows: ReportRow[] = [];
  for (const g of groups) {
    rows.push({ cells: [g.label], heading: true });
    for (const r of g.rows) {
      rows.push({ cells: [r.code ?? '', r.name, ...cells(r)], depth: 1 });
    }
    rows.push({
      cells: ['', `Total ${g.label}`, ...cells(g.totals)],
      total: true,
      bold: true,
    });
  }
  rows.push({
    cells: ['', 'Grand total', ...cells(totals)],
    grand: true,
    bold: true,
  });
  return {
    title,
    columns: [
      { header: 'Code', flex: 2 },
      { header: 'Item', flex: 5 },
      { header: 'Sold', align: 'right' },
      ...(c.free ? [{ header: 'Free', align: 'right' as const }] : []),
      { header: 'Returned', align: 'right' },
      { header: 'Net units', align: 'right' },
      { header: 'Net sales', align: 'right', flex: 2 },
      ...(c.cost
        ? [
            { header: 'Gross profit', align: 'right' as const, flex: 2 },
            { header: 'Margin', align: 'right' as const },
          ]
        : []),
    ],
    rows,
  };
};

/** Lines for a WhatsApp summary: the top three groups by net sales. */
export const itemShareLines = (sheet: DayItemSheet, groupBy: ItemGrouping = 'category'): string[] => {
  const { groups } = groupItemSheet(sheet, { groupBy, sort: 'value' });
  const top = groups.filter((g) => !g.services && g.totals.value > 0).slice(0, 3);
  if (top.length === 0) return [];
  return [
    'Top product groups:',
    ...top.map((g) => `• ${g.label} — ${formatMoney(g.totals.value)} (${formatQty(g.totals.net)} units)`),
  ];
};

/** Share of rows with no category, to suggest setting categories. */
export const uncategorizedShare = (sheet: DayItemSheet): number => {
  const items = sheet.rows.filter((r) => r.kind === 'item');
  if (items.length === 0) return 0;
  return items.filter((r) => !r.category?.trim()).length / items.length;
};
