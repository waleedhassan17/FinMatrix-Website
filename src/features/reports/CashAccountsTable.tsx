import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useStatementDensity } from '@/features/reports/statementPrefs';
import type { CashFlowAccount, CashFlowReport } from '@/serializers/reportSerializers';
import { parenNegative } from '@/utils/money';

export interface CashAccountsTableProps {
  report: CashFlowReport;
  onActivate: (account: CashFlowAccount) => void;
  activeKey?: string | null;
}

/**
 * Each cash and bank account over the period: where it started, how it moved,
 * where it ended. The total row is the statement's own beginning, net change
 * and ending cash — read from the server, so the accounts are shown beside
 * the figure they add up to rather than added up here.
 *
 * A row's net change is its ending less its beginning: the difference of two
 * figures on the same line, for reading across, not a total.
 */
export function CashAccountsTable({ report, onActivate, activeKey }: CashAccountsTableProps) {
  const [density] = useStatementDensity();
  const pad = density === 'compact' ? 'py-xxs' : 'py-sm';
  const num = cn('px-md text-right tabular whitespace-nowrap', pad);

  if (report.accounts.length === 0) {
    return (
      <p className="py-lg text-center text-body-sm text-text-tertiary">
        The per-account breakdown needs the reports v2 API.
      </p>
    );
  }

  return (
    <div className="max-lg:overflow-x-auto">
      <table className="w-full border-collapse bg-surface text-body-sm">
        <caption className="sr-only">Cash and bank accounts</caption>
        <thead>
          <tr className="border-b border-border text-overline text-text-secondary">
            <th scope="col" className="px-md py-sm text-left">Account</th>
            <th scope="col" className="px-md py-sm text-right">Beginning</th>
            <th scope="col" className="px-md py-sm text-right">Net change</th>
            <th scope="col" className="px-md py-sm text-right">Ending</th>
          </tr>
        </thead>
        <tbody>
          {report.accounts.map((a) => (
            <tr
              key={a.accountCode}
              onClick={() => onActivate(a)}
              className={cn(
                'group cursor-pointer border-b border-border-light bg-surface hover:bg-surface-hover',
                activeKey === a.accountCode && 'bg-primary-tint hover:bg-primary-tint',
              )}
            >
              <td className={cn('px-md', pad)}>
                <button
                  type="button"
                  data-row-key={`acct:${a.accountCode}`}
                  aria-haspopup="dialog"
                  aria-label={`${a.accountCode} ${a.accountName}, ending ${parenNegative(a.ending)}`}
                  className="flex w-full items-center gap-xs text-left outline-none focus-visible:underline"
                >
                  <span className="tabular text-text-tertiary">{a.accountCode}</span>
                  <span>{a.accountName}</span>
                  <ChevronRight
                    className="ml-auto size-4 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                    aria-hidden="true"
                  />
                </button>
              </td>
              <td className={num}>{parenNegative(a.beginning)}</td>
              <td className={num}>{parenNegative(Math.round((a.ending - a.beginning) * 100) / 100)}</td>
              <td className={num}>{parenNegative(a.ending)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-text-primary border-b-[3px] border-b-border-strong border-double bg-surface-2 text-label-lg">
            <td className="px-md py-sm">Cash and bank</td>
            <td className="px-md py-sm text-right tabular">{parenNegative(report.beginningCash)}</td>
            <td className="px-md py-sm text-right tabular">{parenNegative(report.netChange)}</td>
            <td className="px-md py-sm text-right tabular">{parenNegative(report.endingCash)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default CashAccountsTable;
