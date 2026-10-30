import { AlertTriangle, Info } from 'lucide-react';

import { cn } from '@/lib/cn';
import { explainFlag } from '@/models/trialBalanceFlags';

export interface AccountDetailsProps {
  accountCode: string;
  accountName: string;
  accountType: string;
  subType: string;
  /** Where the statement files it: "Cash and Bank", "Current Liabilities". */
  statementGroup?: string;
  flags?: string[];
}

const TYPE_LABELS: Record<string, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expense',
};

const NORMAL_SIDE: Record<string, string> = {
  asset: 'Debit',
  expense: 'Debit',
  liability: 'Credit',
  equity: 'Credit',
  revenue: 'Credit',
};

/** What the account is, where the statement files it, and anything flagged on it. */
export function AccountDetails({
  accountCode,
  accountName,
  accountType,
  subType,
  statementGroup,
  flags = [],
}: AccountDetailsProps) {
  const facts: [string, string][] = [
    ['Account', `${accountCode} ${accountName}`.trim()],
    ['Type', TYPE_LABELS[accountType] ?? (accountType || '—')],
    ['Subtype', subType || '—'],
    ['Normal balance', NORMAL_SIDE[accountType] ?? '—'],
  ];
  if (statementGroup) facts.push(['Statement group', statementGroup]);

  return (
    <div className="flex flex-col gap-lg p-lg">
      <dl className="divide-y divide-border-light border-y border-border-light">
        {facts.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-md py-xs">
            <dt className="text-body-sm text-text-secondary">{label}</dt>
            <dd className="text-right text-label-md text-text-primary">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-label="Flags">
        <h4 className="text-overline text-text-secondary">Flags</h4>
        {flags.length === 0 ? (
          <p className="mt-xs text-body-sm text-text-tertiary">Nothing unusual on this account.</p>
        ) : (
          <ul className="mt-xs flex flex-col gap-sm">
            {flags.map((flag) => {
              const e = explainFlag(flag, { accountName, accountType, subType });
              const Icon = e.severity === 'warning' ? AlertTriangle : Info;
              return (
                <li key={flag} className="flex items-start gap-sm">
                  <Icon
                    className={cn(
                      'mt-[2px] size-4 shrink-0',
                      e.severity === 'warning' ? 'text-warning' : 'text-text-tertiary',
                    )}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-label-md text-text-primary">{e.title}</p>
                    <p className="text-body-sm text-text-secondary">{e.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default AccountDetails;
