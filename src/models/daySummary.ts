// ═══════════════════════════════════════════════════════
// FinMatrix Web — Day Summary model
// ═══════════════════════════════════════════════════════
// Pure helpers behind the Day Summary page: names and links for each document
// type, the change against a comparison day, what needs attention, and the
// rows the CSV, the PDF and the WhatsApp text are built from — one list each,
// so the screen and its exports cannot disagree.

import type { CsvRow } from '@/models/reportCsv';
import { csvAmount } from '@/models/reportCsv';
import type { ReportSection } from '@/features/reports/reportPdfTable';
import type {
  DayDocKind,
  DayEntry,
  DayEntryFilter,
  DayEntrySort,
  DayFigure,
  DayHourRow,
  DayKpi,
  DaySummary,
} from '@/serializers/daySummarySerializer';
import { formatMoney } from '@/utils/money';

export interface KindMeta {
  /** "Invoices" — a tile's heading. */
  label: string;
  /** "invoice" / "invoices" — in sentences. */
  one: string;
  many: string;
  /** The detail page, or null when the document has no page of its own. */
  path: ((id: string) => string) | null;
}

export const KIND_META: Record<DayDocKind, KindMeta> = {
  invoice: { label: 'Invoices', one: 'invoice', many: 'invoices', path: (id) => `/invoices/${id}` },
  sales_order: {
    label: 'Sales orders',
    one: 'sales order',
    many: 'sales orders',
    path: (id) => `/sales-orders/${id}`,
  },
  estimate: { label: 'Quotations', one: 'quotation', many: 'quotations', path: (id) => `/estimates/${id}` },
  receipt: { label: 'Receipts', one: 'receipt', many: 'receipts', path: (id) => `/payments/${id}` },
  credit_memo: {
    label: 'Credit notes',
    one: 'credit note',
    many: 'credit notes',
    path: (id) => `/credit-memos/${id}`,
  },
  bill: { label: 'Bills', one: 'bill', many: 'bills', path: (id) => `/bills/${id}` },
  purchase_order: {
    label: 'Purchase orders',
    one: 'purchase order',
    many: 'purchase orders',
    path: (id) => `/purchase-orders/${id}`,
  },
  // Vendor payments have no page of their own on the web.
  vendor_payment: { label: 'Vendor payments', one: 'vendor payment', many: 'vendor payments', path: null },
  vendor_credit: {
    label: 'Vendor credits',
    one: 'vendor credit',
    many: 'vendor credits',
    path: (id) => `/vendor-credits/${id}`,
  },
};

export const count = (n: number, kind: DayDocKind): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? KIND_META[kind].one : KIND_META[kind].many}`;

/**
 * Money as Day Summary shows it: the full amount, with a true minus sign (−)
 * like the compact figures, so a negative never reads as a hyphen.
 */
export const dayMoney = (n: number): string => formatMoney(n).replace(/^-/, '−');

/** "Pakistan Standard Time" — the company's zone in words (the IANA name if unknown). */
export const zoneLabel = (timeZone: string): string => {
  try {
    const part = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'long' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName');
    return part?.value ?? timeZone;
  } catch {
    return timeZone;
  }
};

/**
 * "14:05" — when a document was entered, on the company's clock (not the
 * device's), so a Day Book read abroad still matches the hourly chart.
 */
export const entryTime = (iso: string, timeZone?: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });
  } catch {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
};

/** Where a Day Book row opens; null for a deleted document or one with no page. */
export const entryHref = (entry: Pick<DayEntry, 'kind' | 'id' | 'deleted'>): string | null => {
  if (entry.deleted || !entry.id) return null;
  const path = KIND_META[entry.kind].path;
  return path ? path(encodeURIComponent(entry.id)) : null;
};

export const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  check: 'Cheque',
  credit_card: 'Card',
  other: 'Other',
};
export const methodLabel = (m: string): string => METHOD_LABELS[m] ?? m.replace(/_/g, ' ');

// ─── Days ────────────────────────────────────────────────────────────────

const parse = (iso: string) => new Date(`${iso}T00:00:00`);

/** "Thursday, 19 November 2026". */
export const dayLongLabel = (iso: string): string =>
  iso
    ? parse(iso).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';

/** "Thu 19 Nov". */
export const dayShortLabel = (iso: string): string => {
  if (!iso) return '—';
  const d = parse(iso);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`;
};

/** "Today", "Yesterday", or the weekday — the day bar's headline. */
export const relativeDayName = (date: string, today: string, yesterday: string): string => {
  if (date === today) return 'Today';
  if (date === yesterday) return 'Yesterday';
  return parse(date).toLocaleDateString('en-GB', { weekday: 'long' });
};

// ─── Comparisons ─────────────────────────────────────────────────────────

export const COMPARE_KEYS = ['yesterday', 'lastWeek'] as const;
export type CompareKey = (typeof COMPARE_KEYS)[number];

export const compareLabel = (key: CompareKey): string =>
  key === 'yesterday' ? 'vs the day before' : 'vs same day last week';

export const comparedFigure = (k: DayKpi, key: CompareKey): DayFigure =>
  key === 'yesterday' ? k.previousDay : k.sameDayLastWeek;

/**
 * "+12%" / "−8%" against the comparison day, or "New" when there was nothing
 * then, or null when there is nothing either day (no arrow for 0 → 0).
 */
export const dayChange = (
  current: number,
  previous: number,
): { text: string; up: boolean } | null => {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return { text: 'New', up: true };
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(pct);
  if (rounded === 0) return { text: '0%', up: true };
  return { text: `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}%`, up: rounded > 0 };
};

// ─── Needs attention ─────────────────────────────────────────────────────

export interface AttentionItem {
  key: string;
  /** The Day Book filter the line narrows to… */
  filter?: DayEntryFilter;
  /** …or, for something outside the day's documents, the page that lists it. */
  href?: string;
  label: string;
  detail: string;
  count: number;
}

/** The checks an owner should look at, only those with something in them. */
export const attentionItems = (s: DaySummary): AttentionItem[] => {
  const a = s.attention;
  const out: AttentionItem[] = [];
  const buying = s.kinds.includes('purchase_order');
  if (a.backdated > 0) {
    out.push({
      key: 'backdated',
      filter: 'backdated',
      count: a.backdated,
      label: `${a.backdated} back-dated ${a.backdated === 1 ? 'entry' : 'entries'}`,
      detail: 'Entered on this day but dated earlier — check they belong to the earlier day.',
    });
  }
  if (a.drafts > 0) {
    out.push({
      key: 'drafts',
      filter: 'drafts',
      count: a.drafts,
      label: `${a.drafts} ${a.drafts === 1 ? 'draft' : 'drafts'} not posted`,
      detail: buying
        ? 'Draft invoices and bills are not in the books, and draft purchase orders have not gone to the supplier.'
        : 'Draft invoices and bills are not in the books until they are posted.',
    });
  }
  if (a.voided && a.voided.count > 0) {
    out.push({
      key: 'voided',
      filter: 'voided',
      count: a.voided.count,
      label: `${a.voided.count} voided or deleted (${dayMoney(a.voided.total)})`,
      detail: 'Documents cancelled on this day, and who did it.',
    });
  }
  if (a.cancelledOrders > 0) {
    const n = a.cancelledOrders;
    out.push({
      key: 'cancelled',
      filter: 'cancelled',
      count: n,
      label: buying
        ? `${n} ${n === 1 ? 'order' : 'orders'} cancelled or withdrawn`
        : `${n} sales ${n === 1 ? 'order' : 'orders'} cancelled`,
      detail: buying
        ? 'Sales orders that will not be delivered, and purchase orders called off before anything arrived.'
        : 'Orders dated this day that will not be delivered.',
    });
  }
  const overdue = s.purchasing?.position?.overdue;
  if (overdue && overdue.count > 0) {
    out.push({
      key: 'overdue-pos',
      href: '/purchase-orders',
      count: overdue.count,
      label: `${overdue.count} purchase ${overdue.count === 1 ? 'order' : 'orders'} overdue`,
      detail: `${dayMoney(overdue.total)} still to arrive${
        overdue.oldest ? `, expected since ${dayShortLabel(overdue.oldest)}` : ''
      } — chase the supplier or close it.`,
    });
  }
  return out;
};

export const filterLabel = (f: DayEntryFilter): string => {
  switch (f) {
    case 'all':
      return 'All documents';
    case 'backdated':
      return 'Back-dated entries';
    case 'drafts':
      return 'Drafts';
    case 'voided':
      return 'Voided or deleted';
    case 'cancelled':
      return 'Cancelled orders';
    default:
      return KIND_META[f].label;
  }
};

/** "newest first" — the Day Book's order, in words. */
export const sortLabel = (s: DayEntrySort): string =>
  ({
    newest: 'newest first',
    oldest: 'oldest first',
    amount_desc: 'largest first',
    amount_asc: 'smallest first',
  })[s];

/** The Day Book page sizes on offer; the first is the default. */
export const DAY_BOOK_PAGE_SIZES = [25, 50, 100] as const;

// ─── Exports ─────────────────────────────────────────────────────────────

/** The headline figures in screen order: selling, then buying. */
export const headlineRows = (s: DaySummary): Array<[string, DayKpi]> => {
  const h = s.headline;
  const rows: Array<[string, DayKpi | null]> = [
    ['Sales', h.sales],
    ['Money received', h.received],
    ['Orders booked', h.orders],
    ['POs placed', h.purchaseOrders],
    ['Goods received', h.goodsReceived],
    [h.purchaseOrders ? 'Bills' : 'Purchases', h.purchases],
  ];
  return rows.filter((r): r is [string, DayKpi] => r[1] !== null);
};

/** "Day before" / "Same day last week" — the comparison column's heading. */
export const compareHeading = (key: CompareKey): string => (key === 'yesterday' ? 'Day before' : 'Same day last week');

/** The buying section of the exports: the day, then (owner) where POs stand now. */
const purchasingRows = (s: DaySummary): Array<[string, string, number]> => {
  const p = s.purchasing;
  if (!p) return [];
  const rows: Array<[string, string, number]> = [
    ['Purchase orders placed', String(p.placed.count), p.placed.total],
    ['Goods received (at cost)', `${p.received.count} POs`, p.received.total],
    ['Billed from purchase orders', String(p.billed.count), p.billed.total],
  ];
  if (p.position) {
    rows.push(
      ['Open, still to arrive (now)', String(p.position.open.count), p.position.open.total],
      ['Overdue (now)', String(p.position.overdue.count), p.position.overdue.total],
      ['Received, not yet billed (now)', String(p.position.receivedNotBilled.count), p.position.receivedNotBilled.total],
    );
  }
  return rows;
};

/** The CSV: headline figures, documents by type, money by method, buying, then the Day Book. */
export const dayCsvRows = (s: DaySummary, entries: DayEntry[], compare: CompareKey = 'yesterday'): CsvRow[] => {
  const out: CsvRow[] = [];
  // The comparison chosen on screen first, the other after it.
  const other: CompareKey = compare === 'yesterday' ? 'lastWeek' : 'yesterday';
  out.push(['Headline', 'Count', 'Amount', compareHeading(compare), compareHeading(other)]);
  for (const [label, k] of headlineRows(s)) {
    out.push([
      label,
      String(k.count),
      csvAmount(k.total),
      csvAmount(comparedFigure(k, compare).total),
      csvAmount(comparedFigure(k, other).total),
    ]);
  }
  out.push([]);
  out.push(['Document', 'Count', 'Amount']);
  for (const d of s.documents) out.push([KIND_META[d.kind].label, String(d.count), csvAmount(d.total)]);
  out.push([]);
  out.push(['Method', 'Received', 'Paid out']);
  for (const m of s.cash.methods) out.push([methodLabel(m.method), csvAmount(m.received), csvAmount(m.paid)]);
  out.push(['Total', csvAmount(s.cash.received), csvAmount(s.cash.paid)]);
  const buying = purchasingRows(s);
  if (buying.length > 0) {
    out.push([]);
    out.push(['Purchasing', 'Count', 'Amount']);
    for (const [label, n, amount] of buying) out.push([label, n, csvAmount(amount)]);
    for (const v of s.purchasing?.topVendors ?? []) out.push([`Supplier: ${v.name}`, String(v.count), csvAmount(v.total)]);
  }
  out.push([]);
  out.push([`Time (${s.timezone})`, 'Type', 'Number', 'Date', 'Party', 'Amount', 'Status', 'Entered by', 'Counted']);
  for (const e of entries) {
    out.push([
      entryTime(e.createdAt, s.timezone),
      KIND_META[e.kind].label,
      e.number ?? '',
      e.date,
      e.partyName ?? '',
      csvAmount(e.amount),
      e.status ?? '',
      e.createdBy?.name ?? '',
      e.counted ? 'yes' : 'no',
    ]);
  }
  return out;
};

/** The PDF's tables, from the same figures as the screen. */
export const dayPdfSections = (
  s: DaySummary,
  entries: DayEntry[],
  compare: CompareKey = 'yesterday',
): ReportSection[] => {
  const sections: ReportSection[] = [
    {
      title: 'Headline',
      columns: [
        { header: '', flex: 3 },
        { header: 'Count', align: 'right' },
        { header: 'Amount', align: 'right', flex: 2 },
        { header: compareHeading(compare), align: 'right', flex: 2 },
      ],
      rows: headlineRows(s).map(([label, k]) => ({
        cells: [label, String(k.count), k.total, comparedFigure(k, compare).total],
      })),
    },
    {
      title: 'Documents created',
      columns: [
        { header: 'Type', flex: 3 },
        { header: 'Count', align: 'right' },
        { header: 'Amount', align: 'right', flex: 2 },
      ],
      rows: s.documents.map((d) => ({ cells: [KIND_META[d.kind].label, String(d.count), d.total] })),
    },
  ];
  if (s.cash.methods.length > 0) {
    sections.push({
      title: 'Money in and out',
      columns: [
        { header: 'Method', flex: 3 },
        { header: 'Received', align: 'right', flex: 2 },
        { header: 'Paid out', align: 'right', flex: 2 },
      ],
      rows: [
        ...s.cash.methods.map((m) => ({ cells: [methodLabel(m.method), m.received, m.paid] })),
        { cells: ['Total', s.cash.received, s.cash.paid], total: true, bold: true },
      ],
    });
  }
  const buying = purchasingRows(s);
  if (buying.length > 0) {
    sections.push({
      title: 'Purchasing',
      columns: [
        { header: '', flex: 4 },
        { header: 'Count', align: 'right' },
        { header: 'Amount', align: 'right', flex: 2 },
      ],
      rows: buying.map(([label, n, amount]) => ({ cells: [label, n, amount] })),
    });
  }
  if (entries.length > 0) {
    sections.push({
      title: 'Day Book',
      columns: [
        { header: 'Time' },
        { header: 'Type', flex: 2 },
        { header: 'Number', flex: 2 },
        { header: 'Party', flex: 3 },
        { header: 'Amount', align: 'right', flex: 2 },
        { header: 'By', flex: 2 },
      ],
      rows: entries.map((e) => ({
        cells: [
          entryTime(e.createdAt, s.timezone),
          KIND_META[e.kind].one.replace(/^./, (c) => c.toUpperCase()),
          e.number ?? '—',
          e.partyName ?? '—',
          e.amount,
          e.createdBy?.name ?? '—',
        ],
        sub: !e.counted ? `Not counted (${e.status ?? 'excluded'})` : e.backdated ? `Dated ${e.date}` : undefined,
      })),
    });
  }
  return sections;
};

/**
 * A short summary to paste into WhatsApp — the way shop owners report the day
 * to a partner. *Bold* is WhatsApp's own markup.
 */
export const dayShareText = (s: DaySummary, companyName: string): string => {
  const lines: string[] = [];
  lines.push(`*${companyName || 'Day summary'} — ${dayShortLabel(s.date)}*`);
  if (s.scope.createdBy) lines.push(`Entered by ${s.scope.createdBy.name}`);
  lines.push('');
  if (s.isEmpty) {
    lines.push('Nothing was recorded on this day.');
  } else {
    const h = s.headline;
    // Sales and money received always; the rest only when there was some.
    const line = (label: string, k: DayKpi | null, kind: DayDocKind, always = false) => {
      if (k && (always || k.count > 0 || k.total !== 0)) lines.push(`${label}: ${dayMoney(k.total)} (${count(k.count, kind)})`);
    };
    line('Sales', h.sales, 'invoice', true);
    line('Received', h.received, 'receipt', true);
    line('Orders booked', h.orders, 'sales_order');
    line('POs placed', h.purchaseOrders, 'purchase_order');
    if (h.goodsReceived && h.goodsReceived.count > 0) {
      lines.push(`Goods received: ${dayMoney(h.goodsReceived.total)} at cost (${count(h.goodsReceived.count, 'purchase_order')})`);
    }
    line(h.purchaseOrders ? 'Bills' : 'Purchases', h.purchases, 'bill');
    if (s.sales.returns > 0) lines.push(`Returns: ${dayMoney(s.sales.returns)} · net sales ${dayMoney(s.sales.net)}`);
    if (s.sales.unpaid > 0) lines.push(`Still unpaid from these sales: ${dayMoney(s.sales.unpaid)}`);
    if (s.profit) lines.push(`Gross profit (books): ${dayMoney(s.profit.grossProfit)}`);
    if (s.topCustomers.length > 0) {
      lines.push('');
      lines.push('Top customers:');
      for (const c of s.topCustomers.slice(0, 3)) lines.push(`• ${c.name} — ${dayMoney(c.total)}`);
    }
    const flags = attentionItems(s);
    if (flags.length > 0) {
      lines.push('');
      for (const f of flags) lines.push(`⚠ ${f.label}`);
    }
  }
  return lines.join('\n');
};

// ─── Digest schedule ─────────────────────────────────────────────────────

/** "9:00 PM". */
export const hourLabel = (h: number): string => {
  const suffix = h < 12 ? 'AM' : 'PM';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:00 ${suffix}`;
};

/** The digest times offered: evenings cover that day, mornings the day before. */
export const DIGEST_HOURS: Array<{ hour: number; label: string }> = [
  ...[17, 18, 19, 20, 21, 22, 23].map((h) => ({ hour: h, label: `${hourLabel(h)} — that day` })),
  ...[6, 7, 8, 9, 10].map((h) => ({ hour: h, label: `${hourLabel(h)} next morning — the day before` })),
];

// ─── Charts ──────────────────────────────────────────────────────────────

/** "Fri" — a week bar's label. */
export const weekdayShort = (iso: string): string =>
  iso ? parse(iso).toLocaleDateString('en-GB', { weekday: 'short' }) : '';

/** "9 AM", "12 PM" — an hour axis tick. */
export const hourTick = (h: number): string => {
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
};

/**
 * The hours worth drawing: the working day (8 AM–8 PM) widened to take in
 * any hour that had something in it — a shop open till midnight shows to
 * midnight; one that keeps office hours does not draw 24 empty columns.
 */
export const hourWindow = (hourly: DayHourRow[]): DayHourRow[] => {
  const busy = hourly.filter((h) => h.sales > 0 || h.received > 0).map((h) => h.hour);
  const from = Math.min(8, ...busy);
  const to = Math.max(20, ...busy);
  return hourly.filter((h) => h.hour >= from && h.hour <= to);
};

/** The hour with the most sales (then receipts), or null on a quiet day. */
export const busiestHour = (hourly: DayHourRow[]): DayHourRow | null => {
  let best: DayHourRow | null = null;
  for (const h of hourly) {
    const v = h.sales + h.received;
    if (v > 0 && (!best || v > best.sales + best.received)) best = h;
  }
  return best;
};
