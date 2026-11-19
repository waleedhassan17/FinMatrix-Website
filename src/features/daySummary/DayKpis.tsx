import {
  ArrowDownRight,
  ArrowUpRight,
  ClipboardList,
  HandCoins,
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
  dayShortLabel,
  weekdayShort,
  type CompareKey,
} from '@/models/daySummary';
import type { DayDocKind, DayKpi, DaySummary } from '@/serializers/daySummarySerializer';
import { compactMoney, formatMoney } from '@/utils/money';

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
    <div className="mt-md" role="img" aria-label={`${label}, last 7 days`}>
      <div className="flex h-12 items-end gap-[3px]">
        {values.map((v, i) => {
          const last = i === values.length - 1;
          const pct = max > 0 ? Math.max(4, (v / max) * 100) : 4;
          return (
            <div
              key={dates[i] ?? i}
              title={`${dayShortLabel(dates[i] ?? '')}: ${formatMoney(v)}`}
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

/** The day's four headline figures, each with its comparison and its week. */
export function DayKpis({ summary, compare }: { summary: DaySummary; compare: CompareKey }) {
  const h = summary.headline;
  const defs: KpiDef[] = [
    { key: 'sales', label: 'Sales', kpi: h.sales, kind: 'invoice', icon: ReceiptText, tone: 'bg-primary-tint text-primary', upIsGood: true },
    { key: 'received', label: 'Money received', kpi: h.received, kind: 'receipt', icon: HandCoins, tone: 'bg-success-lighter text-success', upIsGood: true },
    ...(h.orders
      ? [{ key: 'orders', label: 'Orders booked', kpi: h.orders, kind: 'sales_order' as const, icon: ClipboardList, tone: 'bg-info-light text-info', upIsGood: true }]
      : []),
    { key: 'purchases', label: 'Purchases', kpi: h.purchases, kind: 'bill', icon: ShoppingCart, tone: 'bg-warning-lighter text-warning', upIsGood: null },
  ];

  return (
    // Two across even on a phone: four cards one under another push the rest
    // of the day off the first screen.
    <div className={cn('grid grid-cols-2 gap-sm sm:gap-md', defs.length === 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-4')}>
      {defs.map((d) => {
        const prior = comparedFigure(d.kpi, compare);
        const change = dayChange(d.kpi.total, prior.total);
        const Icon = d.icon;
        return (
          <Card key={d.key} className={cn('flex min-w-0 flex-col p-md sm:p-lg', defs.length === 3 && 'last:col-span-2 xl:last:col-span-1')}>
            <div className="flex flex-wrap items-center justify-between gap-x-xs gap-y-xxs">
              <div className="flex min-w-0 items-center gap-xs">
                <span className={cn('hidden size-8 shrink-0 items-center justify-center rounded-md sm:flex', d.tone)}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="truncate text-label-md text-text-secondary">{d.label}</span>
              </div>
              {change && <DeltaPill text={change.text} up={change.up} upIsGood={d.upIsGood} />}
            </div>
            <p className="mt-sm truncate text-h4 tabular text-text-primary sm:text-h2" title={formatMoney(d.kpi.total)}>
              {formatMoney(d.kpi.total)}
            </p>
            <p className="mt-xxs truncate text-caption text-text-tertiary">
              {count(d.kpi.count, d.kind)} · {compactMoney(prior.total)} {compareLabel(compare).replace(/^vs /, '')}
            </p>
            <WeekBars values={d.kpi.trend} dates={summary.trendDates} label={d.label} />
          </Card>
        );
      })}
    </div>
  );
}

export default DayKpis;
