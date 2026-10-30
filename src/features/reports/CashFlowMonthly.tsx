import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

import { CASH_IN_COLOR, CASH_OUT_COLOR, CashBalanceChart, CashInOutChart } from '@/features/reports/CashCharts';
import type { CashFlowMonth } from '@/serializers/reportSerializers';
import { formatMoney, parenNegative } from '@/utils/money';

/** "+Rs 25,500.00" / "−Rs 5,000.00" — a month's net, signed, in full. */
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatMoney(Math.abs(n))}`;

/**
 * The period month by month, as two charts on one time axis: the balance
 * (where cash stood at each month end) above the flows (what came in and what
 * went out in the month). Two charts rather than one with two scales, so the
 * balance never flattens the flows — and the y-axes are the same width, so
 * each month sits directly under itself.
 *
 * Every figure is the server's `monthly[]`: in − out is each month's net, the
 * nets add up to the statement's net change, and the balance is the month's
 * closing cash and bank.
 */
export function CashFlowMonthly({ months }: { months: readonly CashFlowMonth[] }) {
  const moved = months.filter((m) => m.inflow !== 0 || m.outflow !== 0);
  const best = moved.reduce<CashFlowMonth | null>((b, m) => (b === null || m.net > b.net ? m : b), null);
  const worst = moved.reduce<CashFlowMonth | null>((w, m) => (w === null || m.net < w.net ? m : w), null);

  return (
    <div className="flex flex-col gap-lg">
      {best && worst && moved.length > 1 && (
        <div className="grid gap-sm sm:grid-cols-2">
          {(
            [
              ['Strongest month', best, ArrowUpRight, 'text-success'],
              ['Weakest month', worst, ArrowDownRight, 'text-danger'],
            ] as const
          ).map(([title, m, Icon, tone]) => (
            <div key={title} className="flex items-start gap-xs rounded-md bg-surface-2 px-md py-sm">
              <Icon className={`mt-[3px] size-4 shrink-0 ${tone}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-label-md text-text-primary">
                  {title}: {m.label} <span className="tabular">· {signed(m.net)} net</span>
                </p>
                <p className="mt-[2px] text-caption tabular text-text-secondary">
                  {formatMoney(m.inflow)} in · {formatMoney(m.outflow)} out
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <section aria-label="Cash balance">
        <h3 className="text-label-lg text-text-primary">Cash balance</h3>
        <p className="text-caption text-text-tertiary">Cash and bank at each month end</p>
        <CashBalanceChart className="mt-sm" title="Cash and bank at each month end" points={months} />
      </section>

      <section aria-label="Cash in and out">
        <div className="flex flex-wrap items-end justify-between gap-sm">
          <div>
            <h3 className="text-label-lg text-text-primary">Cash in and out</h3>
            <p className="text-caption text-text-tertiary">
              Money received above the line, money paid out below it; transfers between your own accounts are in
              neither
            </p>
          </div>
          <ul className="flex items-center gap-md">
            {(
              [
                ['Cash in', CASH_IN_COLOR],
                ['Cash out', CASH_OUT_COLOR],
              ] as const
            ).map(([label, color]) => (
              <li key={label} className="flex items-center gap-xs text-caption text-text-secondary">
                <span aria-hidden="true" className="size-2.5 rounded-[2px]" style={{ backgroundColor: color }} />
                {label}
              </li>
            ))}
          </ul>
        </div>
        <CashInOutChart className="mt-sm" title="Cash in and cash out by month" points={months} />
      </section>

      <details className="group rounded-md border border-border-light">
        <summary className="cursor-pointer px-md py-sm text-label-md text-text-link select-none hover:underline">
          Show the figures by month
        </summary>
        <div className="overflow-x-auto border-t border-border-light">
          <table className="w-full border-collapse text-body-sm">
            <caption className="sr-only">Cash in, cash out, net and ending cash by month</caption>
            <thead>
              <tr className="border-b border-border bg-surface-2 text-overline text-text-secondary">
                <th scope="col" className="px-md py-xs text-left">
                  Month
                </th>
                <th scope="col" className="px-md py-xs text-right">
                  Cash in
                </th>
                <th scope="col" className="px-md py-xs text-right">
                  Cash out
                </th>
                <th scope="col" className="px-md py-xs text-right">
                  Net
                </th>
                <th scope="col" className="px-md py-xs text-right">
                  Ending cash
                </th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.period || m.label} className="border-b border-border-light last:border-b-0">
                  <th scope="row" className="px-md py-xs text-left font-normal text-text-primary">
                    {m.label}
                  </th>
                  <td className="px-md py-xs text-right tabular">{formatMoney(m.inflow)}</td>
                  <td className="px-md py-xs text-right tabular">{formatMoney(m.outflow)}</td>
                  <td className={`px-md py-xs text-right tabular ${m.net < 0 ? 'text-danger' : 'text-text-primary'}`}>
                    {parenNegative(m.net)}
                  </td>
                  <td className="px-md py-xs text-right tabular">{formatMoney(m.endingCash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export default CashFlowMonthly;
