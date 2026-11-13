import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { migrationErrorMessage } from '@/config/migrationErrors';
import { cn } from '@/lib/cn';
import { isEditable, type MigrationBatch, type MigrationIssue } from '@/models/migration';
import { listIssues, resolveIssue } from '@/networks/settings/migrationNetwork';

import { useMigrationAction } from '../useMigration';

/** Codes whose answer is about a value in a cell — they get an edit box. */
const EDITABLE_CODES = new Set(['INVALID_AMOUNT', 'INVALID_DATE', 'MISSING_REQUIRED_VALUE', 'INVALID_VALUE']);
/** Codes where one answer safely applies to every issue like it on the sheet. */
const BULK_CODES = new Set(['AMBIGUOUS_DATE_FORMAT', 'MAPPING_UNCONFIRMED', 'DUPLICATE_RECORD']);

/** Step 4: every open problem, grouped by kind, with its fix inline. */
export function FixStep({ batch, onNext }: { batch: MigrationBatch; onNext: () => void }) {
  const issues = useQuery({ queryKey: ['migrations', batch.id, 'issues', batch.updatedAt], queryFn: () => listIssues(batch.id, { limit: 200 }) });
  const groups = issues.data?.groups ?? [];
  const items = issues.data?.items ?? [];

  return (
    <div className="flex flex-col gap-md">
      {issues.isLoading ? (
        <Card className="p-lg"><div className="h-40 animate-pulse rounded-md bg-neutral-100" /></Card>
      ) : items.length === 0 ? (
        <Card className="flex items-center gap-sm p-lg">
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
          <p className="text-body-sm text-text-primary">Nothing to fix. Run the checks next.</p>
        </Card>
      ) : (
        groups.map((g) => (
          <Card key={`${g.code}-${g.severity}`} className="flex flex-col gap-md p-lg">
            <SectionHeader
              title={`${migrationErrorMessage(g.code)} (${g.count})`}
              right={<span className={cn('text-caption', g.severity === 'blocking' ? 'text-danger' : 'text-warning')}>{g.severity === 'blocking' ? 'Must fix' : 'Please confirm'}</span>}
            />
            <ul className="flex flex-col divide-y divide-border-light">
              {items
                .filter((i) => i.code === g.code && i.severity === g.severity)
                .map((i) => (
                  <IssueRow key={i.id} batch={batch} issue={i} />
                ))}
            </ul>
          </Card>
        ))
      )}
      <div className="flex justify-end">
        <Button onClick={onNext} disabled={batch.issues.blocking > 0}>
          {batch.issues.blocking > 0 ? `${batch.issues.blocking} problem${batch.issues.blocking === 1 ? '' : 's'} left` : 'Continue to checks'}
        </Button>
      </div>
    </div>
  );
}

function IssueRow({ batch, issue }: { batch: MigrationBatch; issue: MigrationIssue }) {
  const [choice, setChoice] = useState('');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [all, setAll] = useState(false);
  const act = useMigrationAction(batch.id, (body: Parameters<typeof resolveIssue>[2]) => resolveIssue(batch.id, issue.id, body), { success: 'Fixed' });
  const editable = isEditable(batch.status) && !act.isPending;
  const where = [issue.sheet, issue.rowNumber ? `row ${issue.rowNumber}` : null].filter(Boolean).join(' · ');
  const options = (issue.options ?? []).filter((o) => o.value !== 'skip');

  return (
    <li className="flex flex-col gap-sm py-md">
      <div>
        {where && <p className="text-caption text-text-secondary">{where}</p>}
        <p className="text-body-sm text-text-primary">{issue.message}</p>
      </div>
      <div className="flex flex-col gap-sm md:flex-row md:items-end">
        {options.length > 0 && (
          <div className="flex flex-1 gap-sm">
            <div className="flex-1">
              <Select compact aria-label="Choose an answer" value={choice} placeholder="Choose…" options={options} onChange={setChoice} disabled={!editable} />
            </div>
            <Button size="sm" disabled={!editable || !choice} onClick={() => act.mutate({ action: 'map', value: choice, applyToAll: all })}>Apply</Button>
          </div>
        )}
        {EDITABLE_CODES.has(issue.code) && issue.rowNumber && (
          <div className="flex flex-1 gap-sm">
            <Input aria-label="Correct value" placeholder="Correct value" value={value} onChange={(e) => setValue(e.target.value)} disabled={!editable} containerClassName="flex-1" />
            <Button size="sm" variant="secondary" disabled={!editable || !value.trim()} onClick={() => act.mutate({ action: 'edit', value: value.trim() })}>Save</Button>
          </div>
        )}
        <div className="flex flex-1 gap-sm">
          <Input aria-label="Reason to skip" placeholder="Reason to skip" value={reason} onChange={(e) => setReason(e.target.value)} disabled={!editable} containerClassName="flex-1" />
          <Button size="sm" variant="text" disabled={!editable || !reason.trim()} onClick={() => act.mutate({ action: 'skip', reason: reason.trim(), applyToAll: all })}>Skip</Button>
        </div>
      </div>
      {BULK_CODES.has(issue.code) && (
        <label className="flex items-center gap-xs text-caption text-text-secondary">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Apply to every problem like this on “{issue.sheet}”
        </label>
      )}
    </li>
  );
}
