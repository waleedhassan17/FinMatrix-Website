import { CheckCircle2, Loader2, PlayCircle, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import type { MigrationBatch, MigrationCheck } from '@/models/migration';
import { validateMigration } from '@/networks/settings/migrationNetwork';

import { useMigrationAction } from '../useMigration';

/**
 * Step 5: the nine checks, each with expected / actual / difference. A failing
 * check opens to its details. Review (and so Import) waits until every check
 * passes and readiness is 100%.
 */
export function CheckStep({ batch, onNext }: { batch: MigrationBatch; onNext: () => void }) {
  const run = useMigrationAction(batch.id, () => validateMigration(batch.id));
  const checks = batch.checks ?? [];
  const ready = batch.status === 'ready';
  const canRun = ['mapped', 'validated', 'ready'].includes(batch.status);

  return (
    <div className="flex flex-col gap-md">
      <Card className="flex flex-col gap-md p-lg">
        <SectionHeader
          title="Reconciliation checks"
          right={
            <Button size="sm" onClick={() => run.mutate(undefined)} disabled={!canRun || run.isPending}>
              {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PlayCircle className="h-4 w-4" aria-hidden />}
              {checks.length ? 'Run again' : 'Run the checks'}
            </Button>
          }
        />
        <p className="text-body-sm text-text-secondary">
          Each check is computed twice — once from your files, once from the books as they would be posted — and must agree to the rupee. The run is a practice: it is undone afterwards.
        </p>
        {checks.length === 0 ? (
          <p className="text-body-sm text-text-secondary">Not run yet.</p>
        ) : (
          <ul className="flex flex-col gap-sm">
            {checks.map((c) => (
              <CheckRow key={c.code} check={c} />
            ))}
          </ul>
        )}
      </Card>
      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!ready} aria-label="Continue to review">
          {ready ? 'Continue to review' : 'Import unlocks when every check passes'}
        </Button>
      </div>
    </div>
  );
}

export function CheckRow({ check }: { check: MigrationCheck }) {
  const Icon = check.passed ? CheckCircle2 : XCircle;
  return (
    <li className={cn('rounded-md border p-sm', check.passed ? 'border-border-light' : 'border-danger bg-danger-lighter')}>
      <details open={!check.passed}>
        <summary className="flex cursor-pointer list-none flex-col gap-xs sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-sm">
            <Icon className={cn('h-5 w-5 shrink-0', check.passed ? 'text-success' : 'text-danger')} aria-hidden />
            <span className="text-label-md text-text-primary">{check.label}</span>
          </span>
          <span className="grid grid-cols-3 gap-md text-caption tabular text-text-secondary sm:text-right">
            <span>Expected {check.expected}</span>
            <span>Actual {check.actual}</span>
            <span className={check.passed ? '' : 'text-danger'}>Difference {check.difference}</span>
          </span>
        </summary>
        {check.details.length > 0 && (
          <ul className="mt-sm flex flex-col gap-xs border-t border-border-light pt-sm">
            {check.details.slice(0, 20).map((d, i) => (
              <li key={i} className="text-caption text-text-secondary">
                {Object.entries(d)
                  .filter(([, v]) => v !== null && v !== undefined && v !== '')
                  .map(([k, v]) => `${k}: ${String(v)}`)
                  .join(' · ')}
              </li>
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}
