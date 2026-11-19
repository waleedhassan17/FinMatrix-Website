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
  filter: DayEntryFilter;
  label: string;
  detail: string;
  count: number;
}

/** The checks an owner should look at, only those with something in them. */
export const attentionItems = (s: DaySummary): AttentionItem[] => {
  const a = s.attention;
  const out: AttentionItem[] = [];
  if (a.backdated > 0) {
    out.push({
      filter: 'backdated',
      count: a.backdated,
      label: `${a.backdated} back-dated ${a.backdated === 1 ? 'entry' : 'entries'}`,
      detail: 'Entered on this day but dated earlier — check they belong to the earlier day.',
    });
  }
  if (a.drafts > 0) {
    out.push({
      filter: 'drafts',
      count: a.drafts,
      label: `${a.drafts} ${a.drafts === 1 ? 'draft' : 'drafts'} not posted`,
      detail: 'Draft invoices and bills are not in the books until they are posted.',
    });
  }
  if (a.voided && a.voided.count > 0) {
    out.push({
      filter: 'voided',
      count: a.voided.count,
      label: `${a.voided.count} voided or deleted (${formatMoney(a.voided.total)})`,
      detail: 'Documents cancelled on this day, and who did it.',
    });
  }
  if (a.cancelledOrders > 0) {
    out.push({
      filter: 'cancelled',
      count: a.cancelledOrders,
      label: `${a.cancelledOrders} sales ${a.cancelledOrders === 1 ? 'order' : 'orders'} cancelled`,
      detail: 'Orders dated this day that will not be delivered.',
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

// ─── Exports ─────────────────────────────────────────────────────────────

const time = (iso: string) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

const headlineRows = (s: DaySummary): Array<[string, DayKpi]> => [
  ['Sales', s.headline.sales],
  ['Money received', s.headline.received],
  ...(s.headline.orders ? ([['Orders booked', s.headline.orders]] as Array<[string, DayKpi]>) : []),
  ['Purchases', s.headline.purchases],
];

/** The CSV: headline figures, documents by type, money by method, then the Day Book. */
export const dayCsvRows = (s: DaySummary, entries: DayEntry[]): CsvRow[] => {
  const out: CsvRow[] = [];
  out.push(['Headline', 'Count', 'Amount', 'Day before', 'Same day last week']);
  for (const [label, k] of headlineRows(s)) {
    out.push([label, String(k.count), csvAmount(k.total), csvAmount(k.previousDay.total), csvAmount(k.sameDayLastWeek.total)]);
  }
  out.push([]);
  out.push(['Document', 'Count', 'Amount']);
  for (const d of s.documents) out.push([KIND_META[d.kind].label, String(d.count), csvAmount(d.total)]);
  out.push([]);
  out.push(['Method', 'Received', 'Paid out']);
  for (const m of s.cash.methods) out.push([methodLabel(m.method), csvAmount(m.received), csvAmount(m.paid)]);
  out.push(['Total', csvAmount(s.cash.received), csvAmount(s.cash.paid)]);
  out.push([]);
  out.push(['Time', 'Type', 'Number', 'Date', 'Party', 'Amount', 'Status', 'Entered by', 'Counted']);
  for (const e of entries) {
    out.push([
      time(e.createdAt),
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
export const dayPdfSections = (s: DaySummary, entries: DayEntry[]): ReportSection[] => {
  const sections: ReportSection[] = [
    {
      title: 'Headline',
      columns: [
        { header: '', flex: 3 },
        { header: 'Count', align: 'right' },
        { header: 'Amount', align: 'right', flex: 2 },
        { header: 'Day before', align: 'right', flex: 2 },
      ],
      rows: headlineRows(s).map(([label, k]) => ({
        cells: [label, String(k.count), k.total, k.previousDay.total],
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
          time(e.createdAt),
          KIND_META[e.kind].label,
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
    lines.push(`Sales: ${formatMoney(h.sales.total)} (${count(h.sales.count, 'invoice')})`);
    lines.push(`Received: ${formatMoney(h.received.total)} (${count(h.received.count, 'receipt')})`);
    if (h.orders) lines.push(`Orders booked: ${formatMoney(h.orders.total)} (${count(h.orders.count, 'sales_order')})`);
    lines.push(`Purchases: ${formatMoney(h.purchases.total)} (${count(h.purchases.count, 'bill')})`);
    if (s.sales.unpaid > 0) lines.push(`Still unpaid from these sales: ${formatMoney(s.sales.unpaid)}`);
    if (s.profit) lines.push(`Gross profit: ${formatMoney(s.profit.grossProfit)}`);
    if (s.topCustomers.length > 0) {
      lines.push('');
      lines.push('Top customers:');
      for (const c of s.topCustomers.slice(0, 3)) lines.push(`• ${c.name} — ${formatMoney(c.total)}`);
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
