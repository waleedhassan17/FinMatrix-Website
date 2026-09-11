import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { BookOpen, Plus, Scale, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import { isReversal, type JournalEntry } from '@/models/journalEntry';
import { getJournalEntries } from '@/networks/accounting/journalEntryNetwork';
import { formatMoney } from '@/utils/money';

type Tab = 'all' | 'draft' | 'posted' | 'void';

const TABS: [Tab, string][] = [
  ['all', 'All'],
  ['draft', 'Drafts'],
  ['posted', 'Posted'],
  ['void', 'Void'],
];

const columnHelper = createColumnHelper<JournalEntry>();

export default function JournalEntryListPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const {
    data: entries = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['journal-entries', 'list', { search }],
    queryFn: () => getJournalEntries({ search: search || undefined }),
    placeholderData: keepPreviousData,
  });

  const counts = useMemo(() => {
    const c = { all: entries.length, draft: 0, posted: 0, void: 0 } as Record<
      Tab,
      number
    >;
    for (const entry of entries) if (entry.status in c) c[entry.status as Tab] += 1;
    return c;
  }, [entries]);

  const rows = useMemo(
    () => (tab === 'all' ? entries : entries.filter((e) => e.status === tab)),
    [entries, tab],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('reference', {
        header: 'Reference',
        cell: (ctx) => (
          <span className="flex items-center gap-xs">
            <span className="text-label-lg text-text-primary">
              {ctx.getValue() || '—'}
            </span>
            {/* A reversing entry was booked by a void, not written by anyone —
                worth saying so, since it looks like a duplicate otherwise. */}
            {isReversal(ctx.row.original) && (
              <span className="rounded-full bg-neutral-100 px-xs text-caption text-text-secondary">
                Reversal
              </span>
            )}
          </span>
        ),
      }),
      columnHelper.accessor('date', {
        header: 'Date',
        cell: (ctx) => (
          <span className="text-body-sm tabular text-text-primary">
            {ctx.getValue() || '—'}
          </span>
        ),
      }),
      columnHelper.accessor('memo', {
        header: 'Memo',
        cell: (ctx) => (
          <span className="text-body-sm text-text-secondary">
            {ctx.getValue() || '—'}
          </span>
        ),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (ctx) => <StatusBadge status={ctx.getValue()} />,
      }),
      // Read off the entry's own totals, not summed from lines: the list query
      // loads no relations, so every row's `lines` array is empty.
      columnHelper.accessor('totalDebits', {
        header: 'Amount',
        meta: { align: 'right' },
        cell: (ctx) => (
          <span className="tabular text-label-lg text-text-primary">
            {formatMoney(ctx.getValue())}
          </span>
        ),
      }),
    ],
    [],
  ) as never;

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h1 className="text-h2 text-text-primary">Journal entries</h1>
          <p className="text-body-sm text-text-secondary">
            Manual double-entry, for the corrections and adjustments no document
            covers.
          </p>
        </div>
        <div className="flex flex-wrap gap-xs">
          <Button asChild variant="secondary">
            <Link to="/journal-entries/opening-balance">
              <Scale className="size-4" />
              Opening balances
            </Link>
          </Button>
          <Button asChild>
            <Link to="/journal-entries/new">
              <Plus className="size-4" />
              New entry
            </Link>
          </Button>
        </div>
      </div>

      <label className="relative block max-w-[28rem]">
        <Search className="pointer-events-none absolute top-1/2 left-sm size-4 -translate-y-1/2 text-text-tertiary" />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by reference or memo…"
          aria-label="Search journal entries"
          className="h-12 w-full rounded-md border border-border bg-surface pr-sm pl-xl text-body-md text-text-primary outline-none transition-colors focus:border-[1.5px] focus:border-primary placeholder:text-text-tertiary"
        />
      </label>

      <div className="flex flex-wrap gap-xs">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              'rounded-full px-md py-xs text-label-md transition-colors',
              tab === value
                ? 'bg-primary text-neutral-0'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary',
            )}
          >
            {label}
            <span className="ml-xxs tabular opacity-70">{counts[value] ?? 0}</span>
          </button>
        ))}
      </div>

      {isError && (
        <Card className="p-lg">
          <p className="text-body-sm text-danger">
            {error instanceof Error ? error.message : 'Could not load entries.'}
          </p>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        onRowClick={(entry) => navigate(`/journal-entries/${entry.id}`)}
        empty={
          <div className="py-xl text-center">
            <BookOpen className="mx-auto size-8 text-text-tertiary" />
            <p className="mt-sm text-label-lg text-text-primary">
              {search || tab !== 'all' ? 'No entries match' : 'No journal entries yet'}
            </p>
            <p className="mt-xxs text-body-sm text-text-secondary">
              {search || tab !== 'all'
                ? 'Try a different search or tab.'
                : 'Invoices, bills and payments post their own entries. These are the ones you write by hand.'}
            </p>
            {!search && tab === 'all' && (
              <Button asChild className="mt-lg">
                <Link to="/journal-entries/new">
                  <Plus className="size-4" />
                  New entry
                </Link>
              </Button>
            )}
          </div>
        }
      />

      {rows.length > 0 && (
        <p className="text-caption text-text-tertiary">
          Showing entries dated newest first. Amount is the total debited, which
          on a posted entry equals the total credited.
        </p>
      )}
    </div>
  );
}
