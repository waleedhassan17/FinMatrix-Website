import { CheckCircle2, Download, Loader2, Lock, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { canImport, ENTITY_LABEL, type MigrationBatch } from '@/models/migration';
import { closeMigration, commitMigration, downloadCertificate, rollbackMigration } from '@/networks/settings/migrationNetwork';

import { useMigrationAction } from '../useMigration';

/** Step 7: import, then the certificate, Undo (until closed) and Close. */
export function ImportStep({ batch }: { batch: MigrationBatch }) {
  const [confirm, setConfirm] = useState<'import' | 'undo' | 'close' | null>(null);
  const commit = useMigrationAction(batch.id, () => commitMigration(batch.id), { success: 'Your books are in FinMatrix', onSuccess: () => setConfirm(null) });
  const undo = useMigrationAction(batch.id, () => rollbackMigration(batch.id), { success: 'Migration undone', onSuccess: () => setConfirm(null) });
  const close = useMigrationAction(batch.id, () => closeMigration(batch.id), { success: 'Migration closed', onSuccess: () => setConfirm(null) });
  const done = batch.status === 'committed' || batch.status === 'closed';

  return (
    <div className="flex flex-col gap-md">
      {!done && batch.status !== 'rolled_back' && (
        <Card className="flex flex-col gap-md p-lg">
          <SectionHeader title="Import" />
          <p className="text-body-sm text-text-secondary">
            Posts everything dated {batch.cutoverDate}, then closes your books up to the day before so nothing can be back-dated into the old period.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setConfirm('import')} disabled={!canImport(batch) || commit.isPending} aria-label="Import">
              {commit.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Import
            </Button>
          </div>
          {!canImport(batch) && <p className="text-caption text-text-secondary">Import unlocks when every check passes, readiness is 100% and you have signed off.</p>}
        </Card>
      )}

      {done && (
        <Card className="flex flex-col gap-md p-lg">
          <div className="flex items-center gap-sm">
            <CheckCircle2 className="h-6 w-6 text-success" aria-hidden />
            <p className="text-label-md text-text-primary">Imported {batch.committedAt ? new Date(batch.committedAt).toLocaleString() : ''}</p>
          </div>
          <ul className="grid gap-xs sm:grid-cols-2">
            {Object.entries(batch.counts?.rows ?? {}).map(([entity, r]) => (
              <li key={entity} className="text-caption text-text-secondary">
                <span className="text-label-md text-text-primary">{ENTITY_LABEL[entity] ?? entity}</span> · {r.imported} new, {r.merged} matched, {r.rejected} set aside
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-sm">
            <Button variant="secondary" onClick={() => downloadCertificate(batch.id).catch(() => toast.error('The certificate could not be downloaded.'))}>
              <Download className="h-4 w-4" aria-hidden /> Download certificate
            </Button>
            {batch.status === 'committed' && (
              <>
                <Button variant="danger" onClick={() => setConfirm('undo')} disabled={undo.isPending}>
                  <Undo2 className="h-4 w-4" aria-hidden /> Undo migration
                </Button>
                <Button variant="text" onClick={() => setConfirm('close')} disabled={close.isPending}>
                  <Lock className="h-4 w-4" aria-hidden /> Close migration
                </Button>
              </>
            )}
          </div>
          {batch.status === 'closed' && <p className="text-caption text-text-secondary">Closed — this migration can no longer be undone.</p>}
        </Card>
      )}

      {batch.status === 'rolled_back' && (
        <Card className="p-lg">
          <p className="text-body-sm text-text-primary">This migration was undone {batch.rolledBackAt ? new Date(batch.rolledBackAt).toLocaleString() : ''}. Your books are as they were before it. Start a new migration from the list.</p>
        </Card>
      )}

      <ConfirmDialog
        open={confirm === 'import'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Import your books?"
        description={`Everything is posted dated ${batch.cutoverDate}. You can undo it until you close the migration, as long as nothing new depends on it.`}
        confirmLabel="Import"
        busy={commit.isPending}
        onConfirm={() => commit.mutate(undefined)}
      />
      <ConfirmDialog
        open={confirm === 'undo'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Undo this migration?"
        description="Every posting is reversed and the imported invoices, bills, stock, customers, vendors and items are removed. If a payment or anything else now depends on them, undo is refused and we tell you what is in the way."
        confirmLabel="Undo migration"
        destructive
        busy={undo.isPending}
        onConfirm={() => undo.mutate(undefined)}
      />
      <ConfirmDialog
        open={confirm === 'close'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Close this migration?"
        description="Closing makes the import final. After this it can no longer be undone; corrections are made with ordinary entries."
        confirmLabel="Close migration"
        busy={close.isPending}
        onConfirm={() => close.mutate(undefined)}
      />
    </div>
  );
}
