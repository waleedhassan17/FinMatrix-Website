import { FileSpreadsheet, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/models/dataPortability';
import { ENTITY_LABEL, isAcceptedMigrationFile, isEditable, MIGRATION_ACCEPT, type MigrationBatch } from '@/models/migration';
import { removeMigrationFile, uploadMigrationFiles } from '@/networks/settings/migrationNetwork';

import { useMigrationAction } from '../useMigration';

/** Step 2: drop the files (or a ZIP); each file shows what we found in it. */
export function UploadStep({ batch, onNext }: { batch: MigrationBatch; onNext: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const upload = useMigrationAction(batch.id, (files: File[]) => uploadMigrationFiles(batch.id, files), { success: 'Files read' });
  const remove = useMigrationAction(batch.id, (fileId: string) => removeMigrationFile(batch.id, fileId), { success: 'File removed' });
  const editable = isEditable(batch.status);

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    const bad = files.filter((f) => !isAcceptedMigrationFile(f.name));
    if (bad.length) toast.error(`Upload .xlsx, .csv, .xml or .zip files (${bad.map((f) => f.name).join(', ')} skipped).`);
    const good = files.filter((f) => isAcceptedMigrationFile(f.name));
    if (good.length) upload.mutate(good);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (editable) take(e.dataTransfer.files);
  };

  return (
    <div className="flex flex-col gap-md">
      <Card className="p-lg">
        <input
          ref={input}
          type="file"
          multiple
          accept={MIGRATION_ACCEPT}
          className="hidden"
          onChange={(e) => {
            take(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={!editable || upload.isPending}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex w-full flex-col items-center gap-sm rounded-lg border-2 border-dashed p-xl text-center transition-colors',
            dragging ? 'border-primary bg-primary-tint' : 'border-border hover:bg-surface-hover',
          )}
        >
          {upload.isPending ? <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden /> : <UploadCloud className="h-8 w-8 text-primary" aria-hidden />}
          <span className="text-label-md text-text-primary">{upload.isPending ? 'Reading your files…' : 'Drop files here, or choose them'}</span>
          <span className="text-caption text-text-secondary">Excel (.xlsx), CSV, Tally XML, or one ZIP of them · several at once</span>
        </button>
      </Card>

      <Card className="flex flex-col gap-md p-lg">
        <SectionHeader title="Files" />
        {(batch.files ?? []).length === 0 ? (
          <p className="text-body-sm text-text-secondary">No files yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-light">
            {(batch.files ?? []).map((f) => (
              <li key={f.id} className="flex flex-col gap-xs py-md">
                <div className="flex items-center justify-between gap-sm">
                  <span className="flex min-w-0 items-center gap-sm">
                    <FileSpreadsheet className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
                    <span className="truncate text-label-md text-text-primary">{f.originalName}</span>
                    <span className="text-caption text-text-secondary">{formatBytes(f.sizeBytes)}</span>
                  </span>
                  {editable && (
                    <Button variant="text" size="sm" onClick={() => remove.mutate(f.id)} aria-label={`Remove ${f.originalName}`}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                </div>
                <ul className="flex flex-wrap gap-xs pl-lg">
                  {(f.detected ?? []).map((d) => (
                    <li
                      key={d.sheet}
                      className={cn('rounded-full px-sm py-[2px] text-caption', d.target ? (d.confidence >= 0.9 ? 'bg-success-lighter text-success' : 'bg-warning-lighter text-warning') : 'bg-neutral-100 text-text-secondary')}
                    >
                      {d.sheet} → {d.target ? ENTITY_LABEL[d.target] ?? d.target : 'not imported'} · {d.rows} rows
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="flex justify-end">
        <Button onClick={onNext} disabled={(batch.files ?? []).length === 0}>
          Continue to matching
        </Button>
      </div>
    </div>
  );
}
