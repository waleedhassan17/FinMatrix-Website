import { ArrowRight, ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Card, SectionHeader } from '@/components/ui/Card';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select, type SelectOption } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import { ORIGIN_LABEL, type MappingRow, type MappingsView, type SourceAccountInfo } from '@/models/migration';

const NEW_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];
const TYPE_LABEL: Record<string, string> = { asset: 'Asset', liability: 'Liability', equity: 'Equity', revenue: 'Income', expense: 'Expense' };

type Group = 'review' | 'new' | 'matched';
const GROUPS: Array<{ key: Group; title: string; hint: string }> = [
  { key: 'review', title: 'Needs your decision', hint: 'FinMatrix is not sure about these. Choose where each one goes.' },
  { key: 'new', title: 'New accounts to create', hint: 'Not in your FinMatrix chart yet: each is created with its number, name and type.' },
  { key: 'matched', title: 'Matched to your FinMatrix accounts', hint: 'Their balances go into these existing accounts.' },
];

const isNew = (target: string | null) => !!target && (target === 'NEW' || target.startsWith('NEW:'));
const typeLabel = (t: string | null | undefined) => (t ? (TYPE_LABEL[t.toLowerCase()] ?? t.charAt(0).toUpperCase() + t.slice(1)) : null);
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function money(balance: string): string | null {
  const n = Number(balance);
  if (!Number.isFinite(n) || n === 0) return null;
  const text = Math.abs(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n > 0 ? 'Dr' : 'Cr'} ${text}`;
}

/**
 * How each account in the old books lands in FinMatrix, in three groups:
 * what needs a decision, what is created new, what joins an existing
 * account. Each row says the account as the owner knows it (number, name,
 * type, balance) and where it goes.
 */
export function AccountMatches({
  view,
  editable,
  saving,
  onChange,
}: {
  view: MappingsView;
  editable: boolean;
  saving: boolean;
  onChange: (source: string, target: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Record<Group, boolean>>({ review: true, new: true, matched: false });
  const info = useMemo(() => new Map((view.sourceAccounts ?? []).map((a) => [a.number.trim().toLowerCase(), a])), [view.sourceAccounts]);
  const chart = useMemo(() => new Map(view.chartOfAccounts.map((a) => [a.number, a])), [view.chartOfAccounts]);
  const existingOptions: SelectOption[] = useMemo(() => view.chartOfAccounts.map((a) => ({ value: a.number, label: `${a.number} ${a.name}` })), [view.chartOfAccounts]);

  const rows = view.mappings.account.map((m) => ({ m, a: info.get(m.source.trim().toLowerCase()) }));
  const q = search.trim().toLowerCase();
  const shown = rows.filter(({ m, a }) => !q || `${m.source} ${a?.name ?? ''} ${m.target ?? ''} ${chart.get(m.target ?? '')?.name ?? ''}`.toLowerCase().includes(q));
  const groupOf = (m: MappingRow): Group => (review(m) ? 'review' : isNew(m.target) ? 'new' : 'matched');
  const counts = { review: 0, new: 0, matched: 0 } as Record<Group, number>;
  rows.forEach(({ m }) => (counts[groupOf(m)] += 1));

  return (
    <Card className="flex flex-col gap-md p-lg">
      <SectionHeader
        title="Accounts"
        right={
          <div className="w-[14rem]">
            <SearchInput size="sm" value={search} onValueChange={setSearch} placeholder="Search accounts" />
          </div>
        }
      />
      <p className="text-body-sm text-text-secondary">
        {[counts.review && `${counts.review} need${counts.review === 1 ? 's' : ''} your decision`, counts.new && `${counts.new} new`, counts.matched && `${counts.matched} matched to existing accounts`].filter(Boolean).join(' · ')}
      </p>
      {GROUPS.filter((g) => counts[g.key] > 0).map((g) => {
        const list = shown.filter(({ m }) => groupOf(m) === g.key);
        const expanded = open[g.key] || !!q;
        return (
          <section key={g.key} className={cn('flex flex-col rounded-md border', g.key === 'review' ? 'border-warning bg-warning-lighter' : 'border-border-light')}>
            <button
              type="button"
              className="flex items-center justify-between gap-sm px-md py-sm text-left"
              aria-expanded={expanded}
              onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}
            >
              <span className="flex flex-col">
                <span className="text-label-md text-text-primary">
                  {g.title} ({counts[g.key]})
                </span>
                <span className="text-caption text-text-secondary">{g.hint}</span>
              </span>
              <ChevronDown className={cn('h-4 w-4 shrink-0 text-text-secondary transition-transform', expanded && 'rotate-180')} aria-hidden />
            </button>
            {expanded && (
              <ul className="flex flex-col divide-y divide-border-light border-t border-border-light">
                {list.length === 0 && <li className="px-md py-sm text-caption text-text-secondary">No account matches your search here.</li>}
                {list.map(({ m, a }) => (
                  <AccountRow key={m.id} m={m} a={a} existingOptions={existingOptions} editable={editable && !saving} onChange={onChange} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </Card>
  );
}

function AccountRow({
  m,
  a,
  existingOptions,
  editable,
  onChange,
}: {
  m: MappingRow;
  a: SourceAccountInfo | undefined;
  existingOptions: SelectOption[];
  editable: boolean;
  onChange: (source: string, target: string) => void;
}) {
  const number = a?.createAs ?? m.source;
  const name = a?.name ?? '';
  const known = typeLabel(a?.type);
  const balance = money(a?.balance ?? '0');
  // The choices, the current one first among the new-account kinds.
  const options: SelectOption[] = [
    ...(a?.type || m.target === 'NEW' ? [{ value: 'NEW', label: `New account ${number}${known ? ` (${known})` : ''}` }] : []),
    ...NEW_TYPES.map((t) => ({ value: `NEW:${t}`, label: `New ${TYPE_LABEL[t].toLowerCase()} account ${number}` })),
    ...existingOptions,
  ];
  const renumbered = a?.createAs && a.createAs !== m.source;
  return (
    <li className="grid gap-sm px-md py-sm md:grid-cols-[minmax(0,1fr)_auto_minmax(0,20rem)] md:items-center">
      <div className="flex min-w-0 flex-col gap-[2px]">
        <span className="flex min-w-0 flex-wrap items-center gap-xs">
          <span className="tabular text-label-md text-text-primary">{m.source}</span>
          {name && <span className="truncate text-body-sm text-text-primary">{name}</span>}
          {known && <span className="rounded-full bg-neutral-100 px-sm py-[1px] text-caption text-text-secondary">{known}</span>}
          {balance && <span className="tabular text-caption text-text-secondary">{balance}</span>}
        </span>
        <span className={cn('text-caption', review(m) ? 'text-warning' : 'text-text-secondary')}>
          {m.origin === 'user' ? ORIGIN_LABEL.user : m.reason ? sentence(m.reason) : ORIGIN_LABEL[m.origin]}
          {renumbered ? ` · created as ${a!.createAs}` : ''}
        </span>
      </div>
      <ArrowRight className="hidden h-4 w-4 text-text-secondary md:block" aria-hidden />
      <Select
        compact
        aria-label={`FinMatrix account for ${m.source}${name ? ` ${name}` : ''}`}
        value={m.target ?? ''}
        placeholder="Choose an account"
        options={options}
        disabled={!editable}
        onChange={(v) => onChange(m.source, v)}
      />
    </li>
  );
}

const review = (row: MappingRow) => row.needsReview && row.origin !== 'user';

export default AccountMatches;
