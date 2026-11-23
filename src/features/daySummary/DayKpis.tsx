import {
  ArrowDownRight,
  ArrowUpRight,
  ClipboardList,
  FileText,
  HandCoins,
  PackageCheck,
  ReceiptText,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import {
  compareLabel,
  comparedFigure,
  count,
  dayChange,
  dayMoney,
  dayShortLabel,
  weekdayShort,
  type CompareKey,
} from '@/models/daySummary';
import type { DayDocKind, DayKpi, DaySummary } from '@/serializers/daySummarySerializer';
import { compactMoney } from '@/utils/money';

interface KpiDef {
  key: string;
  label: string;
  kpi: DayKpi;
  kind: DayDocKind;
  icon: LucideIcon;
  /** The icon chip's tint. */
  tone: string;
  /** Up is good news (sales) — or simply a fact (purchases). */
  upIsGood: boolean | null;
  /** The line under the figure, when "3 invoices" is not the right words. */
  countText?: string;
}

/** "+45%" in a tinted pill: green good news, red bad, grey a plain fact. */
function DeltaPill({ text, up, upIsGood }: { text: string; up: boolean; upIsGood: boolean | null }) {
  const tone =
    upIsGood === null
      ? 'bg-surface-2 text-text-secondary'
      : up === upIsGood
        ? 'bg-success-lighter text-success'
        : 'bg-danger-lighter text-danger';
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-[2px] rounded-full px-xs py-[2px] text-label-sm tabular', tone)}>
      {text !== 'New' && <Icon className="size-3.5" aria-hidden="true" />}
      {text}
    </span>
  );
}

/**
 * The week to this day as seven bars, this day solid — daily figures read
 * better as bars than as a line, and the reader sees at once whether today
 * was a good one. Each bar names its day and amount on hover.
 */
function WeekBars({ values, dates, label }: { values: number[]; dates: string[]; label: string }) {
  const max = Math.max(...values, 0);
  return (
    <div
      className="mt-md"
      role="img"
      aria-label={`${label}, last 7 days: ${values.map((v, i) => `${weekdayShort(dates[i] ?? '')} ${dayMoney(v)}`).join(', ')}`}
    >
      <div className="flex h-12 items-end gap-[3px]">
        {values.map((v, i) => {
          const last = i === values.length - 1;
          const pct = max > 0 ? Math.max(4, (v / max) * 100) : 4;
          return (
            <div
              key={dates[i] ?? i}
              title={`${dayShortLabel(dates[i] ?? '')}: ${dayMoney(v)}`}
              className={cn(
                'flex-1 rounded-t-xs transition-colors',
                last ? 'bg-primary' : v > 0 ? 'bg-primary-200' : 'bg-border-light',
              )}
              style={{ height: `${pct}%` }}
            />
          );
        })}
      </div>
      <div className="mt-xxs flex gap-[3px]">
        {dates.map((d, i) => (
          <span
            key={d}
            className={cn(
              'flex-1 text-center text-caption',
              i === dates.length - 1 ? 'text-text-primary' : 'text-text-tertiary',
            )}
          >
            {weekdayShort(d).slice(0, 2)}
          </span>
        ))}
      </div>
    </div>
  );
}

function KpiTile({ d, summary, compare, span }: { d: KpiDef; summary: DaySummary; compare: CompareKey; span?: boolean }) {
  const prior = comparedFigure(d.kpi, compare);
  const change = dayChange(d.kpi.total, prior.total);
  const Icon = d.icon;
  return (
    <Card className={cn('flex min-w-0 flex-col p-md sm:p-lg', span && 'col-span-2 lg:col-span-1')}>
      <div className="flex flex-wrap items-center justify-between gap-x-xs gap-y-xxs">
        <div className="flex min-w-0 items-center gap-xs">
          <span className={cn('hidden size-8 shrink-0 items-center justify-center rounded-md sm:flex', d.tone)}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="truncate text-label-md text-text-secondary">{d.label}</span>
        </div>
        {change && <DeltaPill text={change.text} up={change.up} upIsGood={d.upIsGood} />}
      </div>
      <p className="mt-sm truncate text-h4 tabular text-text-primary sm:text-h2" title={dayMoney(d.kpi.total)}>
        {dayMoney(d.kpi.total)}
      </p>
      <p className="mt-xxs truncate text-caption text-text-tertiary">
        {d.countText ?? count(d.kpi.count, d.kind)} · {compactMoney(prior.total)} {compareLabel(compare).replace(/^vs /, '')}
      </p>
      <WeekBars values={d.kpi.trend} dates={summary.trendDates} label={d.label} />
    </Card>
  );
}

/** A labelled row of tiles, equal widths, never an empty slot. */
function KpiRow({
  label,
  defs,
  summary,
  compare,
}: {
  label?: string;
  defs: KpiDef[];
  summary: DaySummary;
  compare: CompareKey;
}) {
  const n = defs.length;
  return (
    <section aria-label={label} className="flex min-w-0 flex-col gap-xs">
      {label && <h2 className="text-overline text-text-tertiary">{label}</h2>}
      {/* Two across even on a phone: tiles one under another push the rest of
          the day off the first screen. An odd last tile takes the full row. */}
      <div
        className={cn(
          'grid grid-cols-2 gap-sm sm:gap-md',
          n === 3 && 'lg:grid-cols-3',
          n >= 4 && 'xl:grid-cols-4',
        )}
      >
        {defs.map((d, i) => (
          <KpiTile key={d.key} d={d} summary={summary} compare={compare} span={n % 2 === 1 && i === n - 1} />
        ))}
      </div>
    </section>
  );
}

/**
 * The day's headline figures, each with its comparison and its week. A
 * business that buys on purchase orders gets two labelled rows — Selling
 * (sales, money received, orders booked) and Buying (POs placed, goods
 * received, bills); otherwise the four figures sit in one row.
 */
export function DayKpis({ summary, compare }: { summary: DaySummary; compare: CompareKey }) {
  const h = summary.headline;
  const sales: KpiDef = { key: 'sales', label: 'Sales', kpi: h.sales, kind: 'invoice', icon: ReceiptText, tone: 'bg-primary-tint text-primary', upIsGood: true };
  const received: KpiDef = { key: 'received', label: 'Money received', kpi: h.received, kind: 'receipt', icon: HandCoins, tone: 'bg-success-lighter text-success', upIsGood: true };
  const orders: KpiDef | null = h.orders
    ? { key: 'orders', label: 'Orders booked', kpi: h.orders, kind: 'sales_order', icon: ClipboardList, tone: 'bg-info-light text-info', upIsGood: true }
    : null;

  if (h.purchaseOrders) {
    const buying: KpiDef[] = [
      { key: 'pos', label: 'POs placed', kpi: h.purchaseOrders, kind: 'purchase_order', icon: FileText, tone: 'bg-info-light text-info', upIsGood: null },
      ...(h.goodsReceived
        ? [
            {
              key: 'goods',
              label: 'Goods received',
              kpi: h.goodsReceived,
              kind: 'purchase_order' as const,
              icon: PackageCheck,
              tone: 'bg-success-lighter text-success',
              upIsGood: null,
              countText:
                h.goodsReceived.count === 0
                  ? 'Nothing received'
                  : `At cost · on ${count(h.goodsReceived.count, 'purchase_order')}`,
            },
          ]
        : []),
      { key: 'bills', label: 'Bills', kpi: h.purchases, kind: 'bill', icon: ShoppingCart, tone: 'bg-warning-lighter text-warning', upIsGood: null },
    ];
    return (
      <div className="flex flex-col gap-md">
        <KpiRow label="Selling" defs={[sales, received, ...(orders ? [orders] : [])]} summary={summary} compare={compare} />
        <KpiRow label="Buying" defs={buying} summary={summary} compare={compare} />
      </div>
    );
  }

  const defs: KpiDef[] = [
    sales,
    received,
    ...(orders ? [orders] : []),
    { key: 'purchases', label: 'Purchases', kpi: h.purchases, kind: 'bill', icon: ShoppingCart, tone: 'bg-warning-lighter text-warning', upIsGood: null },
  ];
  return <KpiRow defs={defs} summary={summary} compare={compare} />;
}

export default DayKpis;
