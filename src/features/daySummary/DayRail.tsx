import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CalendarClock,
  ChevronRight,
  FilePen,
  Timer,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '@/components/ui/Card';
import { RankedBars } from '@/features/reports/RankedBars';
import { cn } from '@/lib/cn';
import { KIND_META, attentionItems, count, dayMoney, dayShortLabel, methodLabel } from '@/models/daySummary';
import { formatQty } from '@/models/inventory';
import type { DayEntryFilter, DayReorderRow, DaySummary, DayUserRow } from '@/serializers/daySummarySerializer';
import { compactMoney } from '@/utils/money';

/** One card of the side column: a heading, an optional aside, its body. */
export function RailCard({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex items-center justify-between gap-sm border-b border-border-light px-lg py-sm">
        <h2 className="text-label-lg text-text-primary">{title}</h2>
        {aside}
      </div>
      {children}
    </Card>
  );
}

const ATTENTION_ICON: Record<string, LucideIcon> = {
  backdated: CalendarClock,
  drafts: FilePen,
  voided: Trash2,
  cancelled: Ban,
  'overdue-pos': Timer,
};

/** What an owner should look at — each line narrows the Day Book to it. */
export function AttentionCard({
  summary,
  active,
  onSelect,
}: {
  summary: DaySummary;
  active: DayEntryFilter;
  onSelect: (f: DayEntryFilter) => void;
}) {
  const items = attentionItems(summary);
  if (items.length === 0) return null;
  return (
    <Card className="overflow-hidden border border-warning-light">
      <div className="flex items-center gap-xs border-b border-warning-light bg-warning-lighter px-lg py-sm">
        <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
        <h2 className="text-label-lg text-text-primary">Needs attention</h2>
        <span className="ml-auto rounded-full bg-warning px-xs text-label-sm text-text-inverse tabular">
          {items.reduce((t, i) => t + i.count, 0)}
        </span>
      </div>
      <ul className="divide-y divide-border-light">
        {items.map((item) => {
          const Icon = ATTENTION_ICON[item.key] ?? AlertTriangle;
          const filter = item.filter;
          const on = filter !== undefined && active === filter;
          const body = (
            <>
              <Icon className="mt-[2px] size-4 shrink-0 text-warning" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-label-md text-text-primary">{item.label}</span>
                <span className="block text-caption text-text-secondary">{item.detail}</span>
              </span>
              <ChevronRight className="mt-[2px] size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
            </>
          );
          const rowClass = 'flex w-full items-start gap-sm px-lg py-sm text-left transition-colors hover:bg-surface-hover';
          return (
            <li key={item.key}>
              {filter ? (
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onSelect(on ? 'all' : filter)}
                  className={cn(rowClass, on && 'bg-warning-lighter')}
                >
                  {body}
                </button>
              ) : (
                <Link to={item.href ?? '#'} className={rowClass}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** The day's P&L from the books, laid out as a statement (owner). */
export function ProfitCard({ summary }: { summary: DaySummary }) {
  const p = summary.profit;
  if (!p) return null;
  const margin = p.revenue !== 0 ? Math.round((p.grossProfit / p.revenue) * 100) : null;
  const line = (label: string, value: number, strong = false, tone?: string) => (
    <div className={cn('flex items-baseline justify-between gap-md py-[5px]', strong && 'border-t border-border-light pt-xs')}>
      <dt className={cn(strong ? 'text-label-md text-text-primary' : 'text-body-sm text-text-secondary')}>{label}</dt>
      <dd className={cn('tabular', strong ? 'text-label-lg' : 'text-body-sm', tone ?? 'text-text-primary')}>
        {dayMoney(value)}
      </dd>
    </div>
  );
  return (
    <RailCard
      title="Profit for the day"
      aside={
        <Link
          to={`/reports/profit-loss?from=${summary.date}&to=${summary.date}`}
          className="inline-flex items-center gap-[2px] text-caption text-text-link hover:underline"
        >
          P&amp;L <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      }
    >
      <dl className="px-lg py-sm" aria-label="Profit for the day">
        {line('Revenue', p.revenue)}
        {line('Cost of sales', p.cogs)}
        {line('Gross profit (books)', p.grossProfit, true, p.grossProfit < 0 ? 'text-danger' : undefined)}
        {margin !== null && (
          <p className="-mt-[2px] text-right text-caption text-text-tertiary">{margin}% gross margin</p>
        )}
        {line('Expenses', p.expenses)}
        {line('Net profit', p.netIncome, true, p.netIncome < 0 ? 'text-danger' : 'text-success')}
      </dl>
      <p className="border-t border-border-light px-lg py-xs text-caption text-text-tertiary">
        From the general ledger: everything posted for the day, services and adjustments included.
      </p>
    </RailCard>
  );
}

/** How many of each document were created, and what they come to. */
export function DocumentsCard({
  summary,
  active,
  onSelect,
}: {
  summary: DaySummary;
  active: DayEntryFilter;
  onSelect: (f: DayEntryFilter) => void;
}) {
  const busy = summary.documents.filter((d) => d.count > 0);
  const quiet = summary.documents.filter((d) => d.count === 0);
  const total = busy.reduce((t, d) => t + d.count, 0);
  return (
    <RailCard title="Documents created" aside={<span className="text-label-md tabular text-text-secondary">{total}</span>}>
      {busy.length === 0 ? (
        <p className="px-lg py-md text-body-sm text-text-secondary">Nothing was created on this day.</p>
      ) : (
        <ul className="divide-y divide-border-light">
          {busy.map((d) => {
            const on = active === d.kind;
            return (
              <li key={d.kind}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onSelect(on ? 'all' : d.kind)}
                  className={cn(
                    'flex w-full items-center gap-sm px-lg py-xs text-left transition-colors hover:bg-surface-hover',
                    on && 'bg-primary-tint',
                  )}
                >
                  <span className={cn('min-w-0 flex-1 truncate text-body-sm', on ? 'text-primary' : 'text-text-primary')}>
                    {KIND_META[d.kind].label}
                  </span>
                  <span className="w-8 text-right text-label-md tabular text-text-primary">{d.count}</span>
                  <span className="w-28 text-right text-body-sm tabular text-text-secondary">{dayMoney(d.total)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {busy.length > 0 && quiet.length > 0 && (
        <p className="border-t border-border-light px-lg py-xs text-caption text-text-tertiary">
          None: {quiet.map((d) => KIND_META[d.kind].label.toLowerCase()).join(', ')}.
        </p>
      )}
    </RailCard>
  );
}

/** Receipts in, vendor payments out, by method; net; what is still owed. */
export function MoneyCard({ summary }: { summary: DaySummary }) {
  const { cash, sales } = summary;
  const flow = cash.received + cash.paid;
  if (flow === 0 && cash.methods.length === 0 && sales.returns === 0 && sales.unpaid === 0) {
    return (
      <RailCard title="Money in and out">
        <p className="px-lg py-md text-body-sm text-text-secondary">No money was received or paid out on this day.</p>
      </RailCard>
    );
  }
  return (
    <RailCard title="Money in and out">
      <div className="px-lg py-sm">
        <div className="grid grid-cols-2 gap-sm">
          <div>
            <p className="text-caption text-text-tertiary">In</p>
            <p className="text-label-lg tabular text-success">{dayMoney(cash.received)}</p>
          </div>
          <div className="text-right">
            <p className="text-caption text-text-tertiary">Out</p>
            <p className="text-label-lg tabular text-text-primary">{dayMoney(cash.paid)}</p>
          </div>
        </div>
        {/* In against out, as one bar. */}
        <div className="mt-xs flex h-2 overflow-hidden rounded-full bg-border-light" aria-hidden="true">
          {flow > 0 && (
            <>
              <div className="bg-success" style={{ width: `${(cash.received / flow) * 100}%` }} />
              <div className="bg-warning" style={{ width: `${(cash.paid / flow) * 100}%` }} />
            </>
          )}
        </div>
        {cash.methods.length > 0 && (
          <table className="mt-sm w-full text-body-sm" aria-label="Money in and out by method">
            <thead>
              <tr className="text-overline text-text-tertiary">
                <th scope="col" className="pb-xxs text-left font-normal">Method</th>
                <th scope="col" className="pb-xxs text-right font-normal">In</th>
                <th scope="col" className="pb-xxs text-right font-normal">Out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {cash.methods.map((m) => (
                <tr key={m.method}>
                  <th scope="row" className="py-xxs text-left font-normal text-text-secondary">
                    {methodLabel(m.method)}
                  </th>
                  <td className="py-xxs text-right tabular text-success">{m.received ? dayMoney(m.received) : '–'}</td>
                  <td className="py-xxs pl-sm text-right tabular text-text-primary">{m.paid ? dayMoney(m.paid) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-xs flex items-baseline justify-between border-t border-border-light pt-xs">
          <span className="text-label-md text-text-primary">Net</span>
          <span className={cn('text-label-lg tabular', cash.net < 0 ? 'text-danger' : 'text-text-primary')}>
            {dayMoney(cash.net)}
          </span>
        </div>
      </div>
      {sales.returns > 0 && (
        <div className="flex flex-col gap-xxs border-t border-border-light px-lg py-sm text-body-sm">
          <p className="text-overline text-text-tertiary" aria-hidden="true">
            Sales after returns
          </p>
          <dl className="flex flex-col gap-xxs" aria-label="Sales after returns">
            <div className="flex items-baseline justify-between">
              <dt className="text-text-secondary">Sales</dt>
              <dd className="tabular text-text-primary">{dayMoney(sales.total)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-text-secondary">Returns</dt>
              <dd className="tabular text-danger">{dayMoney(-sales.returns)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-border-light pt-xxs">
              <dt className="text-label-md text-text-primary">Net sales</dt>
              <dd className="text-label-lg tabular text-text-primary">{dayMoney(sales.net)}</dd>
            </div>
          </dl>
        </div>
      )}
      {sales.unpaid > 0 && (
        <p className="border-t border-border-light bg-surface-2 px-lg py-xs text-caption text-text-secondary">
          <span className="tabular text-text-primary">{dayMoney(sales.unpaid)}</span> of this day’s sales is still unpaid.
        </p>
      )}
    </RailCard>
  );
}

export function TopCustomersCard({ summary }: { summary: DaySummary }) {
  return (
    <RailCard title="Top customers">
      <div className="px-lg py-md">
        <RankedBars
          points={summary.topCustomers.map((c) => ({
            key: c.id,
            label: c.name,
            value: c.total,
            hint: `${c.count} ${c.count === 1 ? 'invoice' : 'invoices'}`,
          }))}
          format={(v) => compactMoney(v)}
          emptyLabel="No sales on this day."
          hrefFor={(id) => (id ? `/customers/${encodeURIComponent(id)}` : null)}
        />
      </div>
    </RailCard>
  );
}

export function BestSellersCard({ summary }: { summary: DaySummary }) {
  return (
    <RailCard title="Best sellers">
      <div className="px-lg py-md">
        <RankedBars
          points={summary.topItems.map((i, n) => ({
            key: i.itemId ?? `line-${n}`,
            label: i.name,
            value: i.total,
            hint: `${i.quantity.toLocaleString('en-US')} net units`,
          }))}
          format={(v) => compactMoney(v)}
          emptyLabel="No items sold on this day."
          hrefFor={(key) => (key.startsWith('line-') ? null : `/inventory/${encodeURIComponent(key)}`)}
        />
      </div>
    </RailCard>
  );
}

/**
 * What sold in the period and now needs buying in: out of stock first, then
 * the items at or below their reorder point. Stock is as it stands now.
 */
export function ReorderCard({ reorder, period }: { reorder: DayReorderRow[]; period: string }) {
  if (reorder.length === 0) return null;
  const shown = reorder.slice(0, 8);
  return (
    <RailCard
      title="Reorder soon"
      aside={<span className="text-caption text-text-tertiary">{reorder.length} {reorder.length === 1 ? 'item' : 'items'}</span>}
    >
      <p className="border-b border-border-light bg-surface-2 px-lg py-xxs text-caption text-text-secondary">
        Stock now, for items sold {period}
      </p>
      <ul className="divide-y divide-border-light" aria-label="Items to reorder">
        {shown.map((r) => (
          <li key={r.itemId}>
            <Link
              to={`/inventory/${encodeURIComponent(r.itemId)}`}
              className="flex items-center justify-between gap-sm px-lg py-xs hover:bg-surface-hover"
            >
              <span className="min-w-0">
                <span className="block truncate text-body-sm text-text-primary">{r.name}</span>
                <span className="block text-caption text-text-tertiary">
                  {r.code}
                  {r.reorderPoint > 0 && ` · reorder at ${formatQty(r.reorderPoint)}`}
                  {r.reorderQuantity > 0 && ` · order ${formatQty(r.reorderQuantity)}`}
                </span>
              </span>
              <span className={cn('shrink-0 text-right text-label-md tabular', r.outOfStock ? 'text-danger' : 'text-warning')}>
                {r.outOfStock ? 'Out of stock' : `${formatQty(r.onHand)} left`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {reorder.length > shown.length && (
        <Link
          to="/inventory"
          className="flex items-center justify-between border-t border-border-light px-lg py-xs text-label-md text-text-link hover:bg-surface-hover"
        >
          See {reorder.length - shown.length} more in Inventory
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </RailCard>
  );
}

/**
 * The buying side of the day: purchase orders placed, goods received against
 * them and bills raised from them — then, for the owner, where the company's
 * purchase orders stand now (still to arrive, overdue, received but unbilled).
 */
export function PurchasingCard({ summary }: { summary: DaySummary }) {
  const p = summary.purchasing;
  if (!p) return null;
  const quiet = p.placed.count === 0 && p.received.count === 0 && p.billed.count === 0;
  const pos = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'PO' : 'POs'}`;
  const dayRows: Array<{ label: string; note: string; value: number }> = [
    { label: 'Placed', note: count(p.placed.count, 'purchase_order'), value: p.placed.total },
    {
      label: 'Goods received',
      note: p.received.count ? `At cost · on ${pos(p.received.count)}` : 'Nothing arrived',
      value: p.received.total,
    },
    { label: 'Billed from POs', note: count(p.billed.count, 'bill'), value: p.billed.total },
  ];
  const now = p.position;
  return (
    <RailCard
      title="Purchasing"
      aside={
        <Link
          to="/purchase-orders"
          className="inline-flex items-center gap-[2px] text-caption text-text-link hover:underline"
        >
          Purchase orders <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      }
    >
      {quiet ? (
        <p className="px-lg py-md text-body-sm text-text-secondary">
          No purchase orders placed, goods received or bills from POs on this day.
        </p>
      ) : (
        <dl className="divide-y divide-border-light px-lg" aria-label="Purchasing on the day">
          {dayRows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-md py-xs">
              <div className="min-w-0">
                <dt className="text-body-sm text-text-primary">{r.label}</dt>
                <p className="text-caption text-text-tertiary">{r.note}</p>
              </div>
              <dd className="shrink-0 text-label-md tabular text-text-primary">{dayMoney(r.value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {p.topVendors.length > 0 && (
        <div className="border-t border-border-light px-lg py-sm">
          <p className="mb-xs text-overline text-text-tertiary">Ordered from</p>
          <RankedBars
            points={p.topVendors.map((v) => ({
              key: v.id,
              label: v.name,
              value: v.total,
              hint: count(v.count, 'purchase_order'),
            }))}
            format={(v) => compactMoney(v)}
            emptyLabel="No purchase orders on this day."
            hrefFor={(id) => (id ? `/vendors/${encodeURIComponent(id)}` : null)}
          />
        </div>
      )}
      {now && (
        <div className="border-t border-border-light bg-surface-2 px-lg py-sm">
          <p className="text-overline text-text-tertiary">Right now</p>
          <dl className="mt-xxs flex flex-col" aria-label="Purchase orders right now">
            <div className="flex items-baseline justify-between gap-md py-xxs">
              <dt className="text-body-sm text-text-secondary">
                Still to arrive <span className="text-caption text-text-tertiary">· {pos(now.open.count)}</span>
              </dt>
              <dd className="shrink-0 text-body-sm tabular text-text-primary">{dayMoney(now.open.total)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-md py-xxs">
              <dt className={cn('text-body-sm', now.overdue.count ? 'text-danger' : 'text-text-secondary')}>
                Overdue <span className="text-caption text-text-tertiary">· {pos(now.overdue.count)}</span>
                {now.overdue.oldest && (
                  <span className="block text-caption text-text-tertiary">
                    Expected since {dayShortLabel(now.overdue.oldest)}
                  </span>
                )}
              </dt>
              <dd className={cn('shrink-0 text-body-sm tabular', now.overdue.count ? 'text-danger' : 'text-text-primary')}>
                {dayMoney(now.overdue.total)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-md py-xxs">
              <dt className="text-body-sm text-text-secondary">
                Received, not billed{' '}
                <span className="text-caption text-text-tertiary">· {pos(now.receivedNotBilled.count)}</span>
              </dt>
              <dd className="shrink-0 text-body-sm tabular text-text-primary">{dayMoney(now.receivedNotBilled.total)}</dd>
            </div>
          </dl>
        </div>
      )}
    </RailCard>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

/** Who entered what (owner). Choosing a person narrows the whole page. */
export function TeamCard({ team, onSelect }: { team: DayUserRow[]; onSelect: (userId: string) => void }) {
  const most = Math.max(...team.map((t) => t.documents), 1);
  return (
    <RailCard title="Team activity">
      <p className="border-b border-border-light px-lg py-xxs text-caption text-text-tertiary">
        Documents each person prepared. Choose someone to see only their day.
      </p>
      {team.length === 0 ? (
        <p className="px-lg py-md text-body-sm text-text-secondary">Nobody entered anything on this day.</p>
      ) : (
        <ul className="divide-y divide-border-light" aria-label="Team activity">
          {team.map((t) => {
            const parts = [
              t.invoices.count ? `${t.invoices.count} inv · ${compactMoney(t.invoices.total)}` : null,
              t.salesOrders.count ? `${t.salesOrders.count} orders` : null,
              t.estimates.count ? `${t.estimates.count} quotes` : null,
              t.receipts.count ? `${t.receipts.count} receipts` : null,
              t.purchaseOrders.count ? `${t.purchaseOrders.count} POs · ${compactMoney(t.purchaseOrders.total)}` : null,
            ].filter(Boolean);
            const body = (
              <>
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-label-sm',
                    t.userId ? 'bg-primary-tint text-primary' : 'bg-surface-2 text-text-tertiary',
                  )}
                  aria-hidden="true"
                >
                  {t.userId ? initials(t.name) : '—'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-sm">
                    <span className={cn('truncate text-label-md', t.userId ? 'text-text-primary' : 'text-text-secondary')}>
                      {t.name}
                    </span>
                    <span className="text-label-md tabular text-text-secondary">{t.documents}</span>
                  </span>
                  <span className="mt-[3px] block h-1 overflow-hidden rounded-full bg-border-light">
                    <span className="block h-full rounded-full bg-primary-200" style={{ width: `${(t.documents / most) * 100}%` }} />
                  </span>
                  <span className="mt-[3px] block truncate text-caption text-text-tertiary">
                    {parts.length ? parts.join(' · ') : t.userId ? 'Other documents only' : 'Entered before people were recorded'}
                  </span>
                </span>
              </>
            );
            return (
              <li key={t.userId ?? 'none'}>
                {t.userId ? (
                  <button
                    type="button"
                    onClick={() => onSelect(t.userId as string)}
                    title={`Show only ${t.name}’s day`}
                    className="flex w-full items-center gap-sm px-lg py-sm text-left transition-colors hover:bg-surface-hover"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-center gap-sm px-lg py-sm">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </RailCard>
  );
}
