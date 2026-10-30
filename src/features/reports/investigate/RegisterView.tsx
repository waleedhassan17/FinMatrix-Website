import { Check, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { LoadMore } from '@/components/ui/LoadMore';
import { Skeleton } from '@/components/ui/Skeleton';
import { documentHref } from '@/features/reports/documentRoutes';
import { registerTies, useAccountRegister, type TieBasis } from '@/features/reports/investigate/register';
import { formatShortDate, type ReportRange } from '@/models/reportPeriod';
import type { RegisterEntry } from '@/serializers/reportInvestigateSerializers';
import { formatMoney, parenNegative } from '@/utils/money';

export interface RegisterViewProps {
  accountCode: string;
  range: ReportRange;
  /** The figure on the statement line this was opened from. */
  lineAmount: number | null;
  basis: TieBasis;
}

/**
 * One account's register: the opening balance, every posting in the range with
 * its document, counterparty and running balance, and the closing balance —
 * the working paper behind a statement line.
 *
 * The running balance is the server's, windowed over the whole range, so it is
 * right on every page; a page only appends rows.
 */
export function RegisterView({ accountCode, range, lineAmount, basis }: RegisterViewProps) {
  const query = useAccountRegister(accountCode, range);
  const first = query.data?.pages[0];
  const entries = query.data?.pages.flatMap((p) => p.entries) ?? [];

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-xs p-lg" aria-busy="true">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (query.isError || !first) {
    return (
      <div className="p-lg">
        <p className="text-body-sm text-text-secondary">
          {(query.error as Error | null)?.message ?? 'The register could not be loaded.'}
        </p>
        <Button variant="secondary" size="sm" className="mt-sm" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const ties = registerTies(first, lineAmount, basis);
  const glHref = `/reports/general-ledger?view=accounts&account=${encodeURIComponent(accountCode)}&from=${range.startDate}&to=${range.endDate}`;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-sm border-b border-border-light px-lg py-md">
        <div>
          <p className="text-caption text-text-tertiary">
            {basis === 'closing' ? 'Balance on the statement' : 'Activity on the statement'}
          </p>
          <p className="text-h4 tabular text-text-primary">
            {lineAmount === null ? '—' : parenNegative(lineAmount)}
          </p>
        </div>
        {ties.toLine && ties.internal ? (
          <span className="inline-flex items-center gap-[3px] text-label-sm text-text-secondary">
            <Check className="size-3.5 text-success" aria-hidden="true" />
            Ties to statement
          </span>
        ) : ties.toLine === false || !ties.internal ? (
          <span role="status" className="text-label-sm text-danger">
            Does not tie to the statement — the register’s{' '}
            {basis === 'closing' ? 'closing balance' : 'movement'} differs
          </span>
        ) : null}
      </div>

      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">
          Register for {first.account.accountCode} {first.account.accountName}
        </caption>
        <thead>
          <tr className="border-b border-border text-overline text-text-secondary">
            <th scope="col" className="px-lg py-xs text-left">Date · document</th>
            <th scope="col" className="px-xs py-xs text-right">Debit</th>
            <th scope="col" className="px-xs py-xs text-right">Credit</th>
            <th scope="col" className="py-xs pl-xs pr-lg text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border-light bg-surface-2">
            <th scope="row" className="px-lg py-xs text-left text-label-md text-text-primary">
              Opening balance
              <span className="block text-caption font-normal text-text-tertiary">
                {formatShortDate(range.startDate)}
              </span>
            </th>
            <td />
            <td />
            <td className="py-xs pl-xs pr-lg text-right tabular text-label-md">
              {parenNegative(first.openingBalance, '')}
            </td>
          </tr>
          {entries.map((entry) => (
            <RegisterRow key={entry.id} entry={entry} />
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={4} className="px-lg py-md text-text-tertiary">
                Nothing was posted to this account in the period.
              </td>
            </tr>
          )}
          <tr className="border-t border-text-primary bg-surface-2">
            <th scope="row" className="px-lg py-xs text-left text-label-md text-text-primary">
              Closing balance
              <span className="block text-caption font-normal text-text-tertiary">
                {formatShortDate(range.endDate)}
              </span>
            </th>
            <td className="px-xs py-xs text-right tabular text-caption text-text-secondary">
              {formatMoney(first.periodDebit, '')}
            </td>
            <td className="px-xs py-xs text-right tabular text-caption text-text-secondary">
              {formatMoney(first.periodCredit, '')}
            </td>
            <td className="py-xs pl-xs pr-lg text-right tabular text-label-md">
              {parenNegative(first.closingBalance, '')}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="flex flex-col items-center gap-sm px-lg py-md">
        <LoadMore
          shown={entries.length}
          total={first.total}
          hasMore={!!query.hasNextPage}
          loading={query.isFetchingNextPage}
          onMore={() => query.fetchNextPage()}
        />
        <Link
          to={glHref}
          className="inline-flex items-center gap-xxs text-label-md text-text-link hover:underline"
        >
          Open in General Ledger
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function RegisterRow({ entry }: { entry: RegisterEntry }) {
  const href = documentHref(entry.sourceType, entry.sourceId);
  const title = entry.documentNumber || entry.reference || entry.sourceLabel;
  return (
    <tr className="border-b border-border-light align-top">
      <td className="px-lg py-xs">
        <div className="flex flex-wrap items-baseline gap-x-xs">
          <span className="tabular text-text-secondary">{formatShortDate(entry.date)}</span>
          {href ? (
            <Link to={href} className="text-label-md text-text-link hover:underline">
              {title}
            </Link>
          ) : (
            <span className="text-label-md text-text-primary">{title}</span>
          )}
          {entry.counterpartyName && <span className="text-text-primary">· {entry.counterpartyName}</span>}
        </div>
        <p className="text-caption text-text-tertiary">
          {[entry.sourceLabel, entry.memo].filter(Boolean).join(' · ')}
        </p>
      </td>
      <td className="px-xs py-xs text-right tabular">{entry.debit ? formatMoney(entry.debit, '') : ''}</td>
      <td className="px-xs py-xs text-right tabular">{entry.credit ? formatMoney(entry.credit, '') : ''}</td>
      <td className="py-xs pl-xs pr-lg text-right tabular">{parenNegative(entry.runningBalance, '')}</td>
    </tr>
  );
}

export default RegisterView;
