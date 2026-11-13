import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select, type SelectOption } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import { ENTITY_LABEL, isEditable, ORIGIN_LABEL, type MappingRow, type MigrationBatch } from '@/models/migration';
import { getMappings, patchMappings } from '@/networks/settings/migrationNetwork';

import { useMigrationAction } from '../useMigration';

const SKIP = '__skip__';
const NONE = '__none__';
const NEW_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];

/**
 * Step 3: how each sheet, column and account was understood. Uncertain matches
 * (below 0.9, not yet confirmed) are amber with the reason and where the match
 * came from; choosing a value saves it as the owner's decision.
 */
export function MatchStep({ batch, onNext }: { batch: MigrationBatch; onNext: () => void }) {
  const mappings = useQuery({ queryKey: ['migrations', batch.id, 'mappings', batch.updatedAt], queryFn: () => getMappings(batch.id) });
  const save = useMigrationAction(batch.id, (rows: Array<{ kind: string; sheet?: string; source: string; target: string | null }>) => patchMappings(batch.id, rows), { success: 'Saved' });
  const [search, setSearch] = useState('');
  const editable = isEditable(batch.status);
  const m = mappings.data;

  const targetOptions: SelectOption[] = useMemo(() => [...(m?.targets ?? []).map((t) => ({ value: t.key, label: t.name })), { value: SKIP, label: 'Do not import this sheet' }], [m]);
  const accountOptions: SelectOption[] = useMemo(
    () => [
      ...NEW_TYPES.map((t) => ({ value: `NEW:${t}`, label: `Create as a new ${t} account` })),
      ...(m?.chartOfAccounts ?? []).map((a) => ({ value: a.number, label: `${a.number} ${a.name}` })),
    ],
    [m],
  );

  if (mappings.isLoading || !m) return <Card className="p-lg"><div className="h-40 animate-pulse rounded-md bg-neutral-100" /></Card>;

  const sheetsWithTarget = m.sheets.filter((s) => s.target);
  const columnsBySheet = (sheet: string) => m.mappings.column.filter((c) => c.sheet === sheet);
  const fieldsOf = (target: string | null): SelectOption[] => [
    ...((m.targets.find((t) => t.key === target)?.fields ?? []).map((f) => ({ value: f.key, label: `${f.header}${f.required ? ' *' : ''}` }))),
    { value: NONE, label: 'Do not import this column' },
  ];
  const accounts = m.mappings.account.filter((a) => !search || `${a.source} ${a.target ?? ''} ${a.reason ?? ''}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col gap-md">
      <Card className="flex flex-col gap-md p-lg">
        <SectionHeader title="Sheets" />
        <ul className="flex flex-col divide-y divide-border-light">
          {m.sheets.map((s) => {
            const row = m.mappings.sheet.find((x) => x.source === s.sheet);
            return (
              <li key={`${s.fileId}-${s.sheet}`} className={cn('flex flex-col gap-sm py-sm sm:flex-row sm:items-center sm:justify-between', review(row) && 'rounded-md bg-warning-lighter px-sm')}>
                <div className="min-w-0">
                  <p className="truncate text-label-md text-text-primary">{s.sheet}</p>
                  <p className="text-caption text-text-secondary">{s.file} · {s.rows} rows{row ? ` · ${ORIGIN_LABEL[row.origin]} (${Math.round(row.confidence * 100)}%)${row.reason ? ` — ${row.reason}` : ''}` : ''}</p>
                </div>
                <div className="w-full sm:w-[16rem]">
                  <Select
                    compact
                    aria-label={`Type of ${s.sheet}`}
                    value={s.target ?? SKIP}
                    options={targetOptions}
                    disabled={!editable || save.isPending}
                    onChange={(v) => save.mutate([{ kind: 'sheet', source: s.sheet, target: v === SKIP ? 'skip' : v }])}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {sheetsWithTarget.map((s) => (
        <Card key={`cols-${s.fileId}-${s.sheet}`} className="flex flex-col gap-md p-lg">
          <SectionHeader title={`Columns of “${s.sheet}” (${ENTITY_LABEL[s.target!] ?? s.target})`} />
          <ul className="grid gap-sm md:grid-cols-2">
            {columnsBySheet(s.sheet).map((c) => (
              <li key={c.id} className={cn('flex flex-col gap-xs rounded-md p-sm', review(c) ? 'bg-warning-lighter' : 'bg-surface-2')}>
                <div className="flex items-center justify-between gap-sm">
                  <span className="truncate text-label-md text-text-primary">{c.source}</span>
                  <span className="text-caption text-text-secondary">{ORIGIN_LABEL[c.origin]}</span>
                </div>
                <Select
                  compact
                  aria-label={`Field for ${c.source}`}
                  value={c.target ?? NONE}
                  options={fieldsOf(s.target)}
                  disabled={!editable || save.isPending}
                  onChange={(v) => save.mutate([{ kind: 'column', sheet: s.sheet, source: c.source, target: v === NONE ? '' : v }])}
                />
                {c.reason && review(c) && <span className="text-caption text-warning">{c.reason}</span>}
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {m.mappings.account.length > 0 && (
        <Card className="flex flex-col gap-md p-lg">
          <SectionHeader title="Accounts" right={<div className="w-[14rem]"><SearchInput size="sm" value={search} onValueChange={setSearch} placeholder="Search accounts" /></div>} />
          <ul className="flex flex-col divide-y divide-border-light">
            {accounts.map((a) => (
              <li key={a.id} className={cn('flex flex-col gap-sm py-sm sm:flex-row sm:items-center sm:justify-between', review(a) && 'rounded-md bg-warning-lighter px-sm')}>
                <div className="min-w-0">
                  <p className="text-label-md text-text-primary">Source account {a.source}</p>
                  <p className="text-caption text-text-secondary">{ORIGIN_LABEL[a.origin]} ({Math.round(a.confidence * 100)}%){a.reason ? ` — ${a.reason}` : ''}</p>
                </div>
                <div className="w-full sm:w-[18rem]">
                  <Select
                    compact
                    aria-label={`FinMatrix account for ${a.source}`}
                    value={a.target && a.target !== 'NEW' ? a.target : ''}
                    placeholder={a.target === 'NEW' ? 'New account (from your Accounts sheet)' : 'Choose an account'}
                    options={accountOptions}
                    disabled={!editable || save.isPending}
                    onChange={(v) => save.mutate([{ kind: 'account', source: a.source, target: v }])}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="flex justify-end">
        <Button onClick={onNext}>{batch.issues.blocking > 0 ? 'Continue to fixes' : 'Continue to checks'}</Button>
      </div>
    </div>
  );
}

const review = (row: MappingRow | undefined) => !!row && row.needsReview && row.origin !== 'user';
