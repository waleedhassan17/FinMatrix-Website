import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Figure, FigureStrip } from '@/features/reports/FigureStrip';
import { cn } from '@/lib/cn';
import {
  HISTORY_ACTION_LABELS,
  HISTORY_COPY,
  historyFieldLabel,
  historyValue,
  monthLabel,
  type HistoryChange,
  type PartyHistory,
  type PartyType,
} from '@/models/partyHistory';
import { formatShortDate } from '@/models/reportPeriod';
import { getVendorHistory } from '@/networks/purchases/vendorNetwork';
import { getCustomerHistory } from '@/networks/sales/customerNetwork';
import { formatAmount, formatMoney } from '@/utils/money';

type View = 'months' | 'changes';

const DOCUMENT_PATH: Record<PartyType, { document: string; payment: string | null }> = {
  customer: { document: '/invoices', payment: '/payments' },
  // A bill payment has no page of its own.
  vendor: { document: '/bills', payment: null },
};

/**
 * A customer's or vendor's History — Peachtree's History tab.
 *
 * Four figures (since when, the last invoice or bill, the last payment, days to
 * pay), then one thing at a time: the fiscal year month by month, or — for the
 * owner — what changed on the record and who changed it. The months come from
 * the same postings as the General Ledger, so their balance is the ledger's.
 */
export function PartyHistoryTab({ type, partyId }: { type: PartyType; partyId: string }) {
  const [year, setYear] = useState<number | undefined>(undefined);
  const [view, setView] = useState<View>('months');
  const copy = HISTORY_COPY[type];

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: [type === 'customer' ? 'customers' : 'vendors', partyId, 'history', year ?? 'current'],
    queryFn: () => (type === 'customer' ? getCustomerHistory(partyId, year) : getVendorHistory(partyId, year)),
    placeholderData: keepPreviousData,
  });

  if (isLoading) {
    return (
      <Card className="p-lg">
        <div className="space-y-xs" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-neutral-100" />
          ))}
        </div>
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card className="p-xxl text-center">
        <p className="text-body-sm text-text-tertiary">
          {error instanceof Error ? error.message : 'The history could not be loaded.'}
        </p>
      </Card>
    );
  }

  const paths = DOCUMENT_PATH[type];
  // This fiscal year and the four before it — further back is a ledger question.
  const current = currentFiscalYear(Number(data.fiscalYear.startDate.slice(5, 7)) || 1);
  const years = Array.from({ length: 5 }, (_, i) => current - i);
  const showChanges = data.changes !== null;

  return (
    <div className={cn('flex flex-col gap-lg transition-opacity', isFetching && 'opacity-70')}>
      <FigureStrip columns={4}>
        <Figure label={copy.since} value={data.since ? formatShortDate(data.since) : '—'} />
        <Figure
          label={copy.lastDocument}
          value={data.lastDocument ? data.lastDocument.amount : '—'}
          caption={
            data.lastDocument ? (
              <Link to={`${paths.document}/${data.lastDocument.id}`} className="hover:text-primary hover:underline">
                {[data.lastDocument.number, formatShortDate(data.lastDocument.date)].filter(Boolean).join(' · ')}
              </Link>
            ) : (
              'None yet'
            )
          }
        />
        <Figure
          label="Last payment"
          value={data.lastPayment ? data.lastPayment.amount : '—'}
          caption={
            data.lastPayment ? (
              paths.payment ? (
                <Link to={`${paths.payment}/${data.lastPayment.id}`} className="hover:text-primary hover:underline">
                  {[data.lastPayment.number, formatShortDate(data.lastPayment.date)].filter(Boolean).join(' · ')}
                </Link>
              ) : (
                [data.lastPayment.number, formatShortDate(data.lastPayment.date)].filter(Boolean).join(' · ')
              )
            ) : (
              'None yet'
            )
          }
        />
        <Figure
          label={copy.pays}
          value={data.averageDaysToPay ? `${data.averageDaysToPay.days} days` : '—'}
          caption={
            data.averageDaysToPay
              ? `On average, over ${data.averageDaysToPay.count} paid ${type === 'customer' ? 'invoice' : 'bill'}${data.averageDaysToPay.count === 1 ? '' : 's'} in the last 12 months`
              : 'Nothing paid in full in the last 12 months'
          }
        />
      </FigureStrip>

      <Card className="p-lg">
        <div className="flex flex-wrap items-end justify-between gap-md">
          <div className="flex gap-xxs" role="group" aria-label="Show">
            {(
              [
                ['months', 'By month'],
                ...(showChanges ? ([['changes', 'Changes']] as [View, string][]) : []),
              ] as [View, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={v === view}
                className={cn(
                  'rounded-full px-sm py-xxs text-label-md transition-colors',
                  v === view
                    ? 'bg-primary text-text-inverse'
                    : 'bg-neutral-100 text-text-secondary hover:bg-neutral-200',
                )}
              >
                {label}
                {v === 'changes' && data.changes ? ` · ${data.changes.length}` : ''}
              </button>
            ))}
          </div>
          {view === 'months' && (
            <Select
              label="Fiscal year"
              value={String(data.fiscalYear.year)}
              onChange={(v) => setYear(Number(v) === current ? undefined : Number(v))}
              options={years.map((y) => ({ value: String(y), label: fiscalYearLabel(data, y) }))}
              containerClassName="w-56"
              compact
            />
          )}
        </div>

        {view === 'months' || !showChanges ? (
          <MonthsTable history={data} type={type} />
        ) : (
          <ChangesList changes={data.changes ?? []} type={type} />
        )}
      </Card>
    </div>
  );
}

/** The fiscal year today falls in: the year it started in. */
function currentFiscalYear(startMonth: number): number {
  const today = new Date();
  return today.getMonth() + 1 >= startMonth ? today.getFullYear() : today.getFullYear() - 1;
}

/** "Jan – Dec 2026", or "Jul 2026 – Jun 2027" for a year that starts mid-calendar. */
function fiscalYearLabel(history: PartyHistory, year: number): string {
  const startMonth = history.fiscalYear.startDate.slice(5, 7) || '01';
  const start = `${year}-${startMonth}`;
  const endMonthIndex = (Number(startMonth) + 10) % 12; // the month before the start
  const endYear = Number(startMonth) === 1 ? year : year + 1;
  const end = `${endYear}-${String(endMonthIndex + 1).padStart(2, '0')}`;
  return `${monthLabel(start)} – ${monthLabel(end)}`;
}

function MonthsTable({ history, type }: { history: PartyHistory; type: PartyType }) {
  const copy = HISTORY_COPY[type];
  return (
    <div className="mt-md overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th className="px-md py-sm text-left text-overline text-text-secondary">Month</th>
            <th className="px-md py-sm text-right text-overline text-text-secondary">{copy.charged}</th>
            <th className="px-md py-sm text-right text-overline text-text-secondary">{copy.settled}</th>
            <th className="px-md py-sm text-right text-overline text-text-secondary">{copy.balance}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border-light">
            <td className="px-md py-sm text-body-sm text-text-secondary" colSpan={3}>
              Brought forward
            </td>
            <td className="px-md py-sm text-right text-body-sm text-text-primary tabular">
              {formatAmount(history.openingBalance)}
            </td>
          </tr>
          {history.months.map((m) => {
            const quiet = m.charged === 0 && m.settled === 0;
            return (
              <tr key={m.month} className="border-b border-border-light">
                <td className="px-md py-sm text-body-sm text-text-primary">{monthLabel(m.month)}</td>
                <td className={cn('px-md py-sm text-right text-body-sm tabular', quiet ? 'text-text-tertiary' : 'text-text-primary')}>
                  {m.charged ? formatAmount(m.charged) : '—'}
                </td>
                <td className={cn('px-md py-sm text-right text-body-sm tabular', quiet ? 'text-text-tertiary' : 'text-text-primary')}>
                  {m.settled ? formatAmount(m.settled) : '—'}
                </td>
                <td className="px-md py-sm text-right text-body-sm text-text-primary tabular">
                  {formatAmount(m.balance)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-text-primary bg-surface-2">
            <td className="px-md py-sm text-label-md text-text-primary">Year</td>
            <td className="px-md py-sm text-right text-label-md text-text-primary tabular">
              {formatMoney(history.totals.charged)}
            </td>
            <td className="px-md py-sm text-right text-label-md text-text-primary tabular">
              {formatMoney(history.totals.settled)}
            </td>
            <td className="px-md py-sm text-right text-label-md text-text-primary tabular">
              {formatMoney(history.closingBalance)}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-sm text-caption text-text-tertiary">
        {type === 'customer'
          ? 'Sales are invoices less credit memos; receipts are money received less refunds. Below zero is credit in the customer’s favour.'
          : 'Purchases are bills less vendor credits. The balance is what you owe at each month’s end.'}
      </p>
    </div>
  );
}

function ChangesList({ changes, type }: { changes: HistoryChange[]; type: PartyType }) {
  if (changes.length === 0) {
    return <p className="mt-md text-body-sm text-text-tertiary">No changes recorded yet.</p>;
  }
  return (
    <ul className="mt-md divide-y divide-border-light">
      {changes.map((c) => (
        <li key={c.id} className="py-sm">
          <p className="text-label-md text-text-primary">
            {HISTORY_ACTION_LABELS[c.action]}
            <span className="text-text-secondary">
              {' · '}
              {c.user ?? (c.action === 'created' ? 'before changes were recorded' : 'the system')}
            </span>
          </p>
          <p className="text-caption text-text-tertiary">{formatWhen(c.at)}</p>
          {c.fields.length > 0 && (
            <dl className="mt-xs grid gap-x-md gap-y-xxs text-body-sm sm:grid-cols-[minmax(9rem,auto)_1fr]">
              {c.fields.map((f) => (
                <div key={f.field} className="contents">
                  <dt className="text-text-secondary">{historyFieldLabel(f.field, type)}</dt>
                  <dd className="min-w-0 break-words text-text-primary">
                    {c.action === 'created' || f.field === 'defaultExpenseAccountId' ? (
                      f.field === 'defaultExpenseAccountId' ? 'Changed' : historyValue(f.field, f.to)
                    ) : (
                      <>
                        <span className="text-text-tertiary">{historyValue(f.field, f.from)}</span>
                        {' → '}
                        {historyValue(f.field, f.to)}
                      </>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ul>
  );
}

/** "12 Sep 2026, 3:41 PM" in the reader's own clock. */
const formatWhen = (at: string): string => {
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? at
    : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export default PartyHistoryTab;
