import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Lock, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_ORDER,
  buildAccountTree,
  flattenAccountNodes,
  normalBalanceFor,
  type AccountNode,
  type AccountType,
} from '@/models/account';
import { getAccountsWithSummary } from '@/networks/accounting/accountNetwork';
import { formatMoney } from '@/utils/money';

type ActiveFilter = 'active' | 'inactive' | 'all';

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  ...ACCOUNT_TYPE_ORDER.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] })),
];

const ACTIVE_OPTIONS: { value: ActiveFilter; label: string }[] = [
  { value: 'active', label: 'Active only' },
  { value: 'inactive', label: 'Inactive only' },
  { value: 'all', label: 'Active and inactive' },
];

/**
 * The Chart of Accounts. Admin only — `chartOfAccounts.manage` is REFUSED for
 * staff rather than REQUEST, and the route is absent from their nav, so
 * `RequireRouteAccess` redirects a staff member who types the URL.
 *
 * Grouped by type in statement order and nested by parent, which is what makes
 * it readable as a chart rather than a list of 23 numbers.
 */
export default function AccountListPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<AccountType | ''>('');
  const [active, setActive] = useState<ActiveFilter>('active');

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['accounts', 'chart', { search, type, active }],
    queryFn: () =>
      getAccountsWithSummary({
        search: search || undefined,
        type: type || undefined,
        isActive: active === 'all' ? undefined : active === 'active',
      }),
    placeholderData: keepPreviousData,
  });

  // Memoised off `data` rather than a `?? []` fallback: that fallback is a new
  // array on every render, so the tree would be rebuilt each time.
  const accounts = useMemo(() => data?.accounts ?? [], [data]);

  // Built from the filtered list, so a search flattens the tree to what matched
  // rather than hiding a match whose parent was filtered away.
  const groups = useMemo(() => buildAccountTree(accounts), [accounts]);

  const isFiltered = search !== '' || type !== '' || active !== 'active';

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        title="Chart of accounts"
        description="Every account the business posts to. Invoices, bills and payments all land here."
        actions={
          <Button asChild>
            <Link to="/accounts/new">
              <Plus className="size-4" />
              New account
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-sm">
        <SearchInput
          label="Search"
          value={searchInput}
          onValueChange={setSearchInput}
          placeholder="Number or name…"
          size="md"
          containerClassName="min-w-56 flex-1"
        />

        <Select
          label="Type"
          value={type}
          onChange={(v) => setType(v as AccountType | '')}
          options={TYPE_OPTIONS}
          containerClassName="w-44"
        />

        <Select
          label="Status"
          value={active}
          onChange={(v) => setActive(v as ActiveFilter)}
          options={ACTIVE_OPTIONS}
          containerClassName="w-52"
        />
      </div>

      {isError && (
        <Card className="p-lg">
          <p className="text-body-sm text-danger">
            {error instanceof Error ? error.message : 'Could not load the chart.'}
          </p>
        </Card>
      )}

      {isLoading && (
        <p className="text-body-sm text-text-secondary">Loading accounts…</p>
      )}

      {!isLoading && groups.length === 0 && (
        <Card className="p-xl text-center">
          <p className="text-label-lg text-text-primary">
            {isFiltered ? 'No accounts match' : 'No accounts yet'}
          </p>
          <p className="mt-xxs text-body-sm text-text-secondary">
            {isFiltered
              ? 'Try a different search or filter.'
              : 'A chart of accounts is created with the company.'}
          </p>
        </Card>
      )}

      {groups.map((group) => (
        <Card key={group.type} className="overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-sm border-b border-border bg-surface-2 px-lg py-md">
            <div className="flex items-baseline gap-sm">
              <h2 className="text-h4 text-text-primary">{group.label}</h2>
              <span className="text-caption text-text-secondary">
                {group.count} {group.count === 1 ? 'account' : 'accounts'}
              </span>
            </div>
            <div className="text-right">
              <p className="text-caption text-text-secondary">
                Total · {normalBalanceFor(group.type) === 'debit' ? 'debit' : 'credit'}{' '}
                balance
              </p>
              <p className="text-h5 tabular text-text-primary">
                {formatMoney(group.total)}
              </p>
            </div>
          </div>

          <ul>
            {flattenAccountNodes(group.roots).map((node) => (
              <AccountRow
                key={node.account.id}
                node={node}
                onOpen={() => navigate(`/accounts/${node.account.id}`)}
              />
            ))}
          </ul>
        </Card>
      ))}

      {/* Balances are each account's own — the server's summary sums them flat
          too, so a parent never absorbs its children here. */}
      {groups.length > 0 && (
        <p className="text-caption text-text-tertiary">
          Each figure is that account's own balance. A parent account does not
          include its sub-accounts' totals.
        </p>
      )}
    </div>
  );
}

function AccountRow({ node, onOpen }: { node: AccountNode; onOpen: () => void }) {
  const { account, depth } = node;

  return (
    <li className="border-b border-border-light last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-sm px-lg py-sm text-left transition-colors hover:bg-surface-2"
        // Indent scales with depth; the inline value is a computed offset, not
        // a colour or a type size, so it is outside the token system.
        style={{ paddingLeft: `calc(var(--spacing-lg) + ${depth * 20}px)` }}
      >
        <span className="w-14 shrink-0 text-label-md tabular text-text-secondary">
          {account.accountNumber}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-xs">
            <span
              className={cn(
                'truncate text-body-md',
                account.isActive ? 'text-text-primary' : 'text-text-tertiary',
              )}
            >
              {account.name}
            </span>
            {account.isSystemAccount && (
              <Lock
                className="size-3 shrink-0 text-text-tertiary"
                aria-label="System account"
              />
            )}
            {!account.isActive && (
              <span className="shrink-0 rounded-full bg-neutral-100 px-xs text-caption text-text-secondary">
                Inactive
              </span>
            )}
          </span>
          <span className="block truncate text-caption text-text-tertiary">
            {account.subType}
          </span>
        </span>

        <span className="shrink-0 text-label-lg tabular text-text-primary">
          {formatMoney(account.balance)}
        </span>

        <ChevronRight className="size-4 shrink-0 text-text-tertiary" />
      </button>
    </li>
  );
}
