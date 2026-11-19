import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileArchive, FileSpreadsheet, Loader2, Pause, Play, Trash2, UploadCloud, X } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { migrationErrorMessage } from '@/config/migrationErrors';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/models/dataPortability';
import {
  detectedLabel,
  isAcceptedMigrationFile,
  isEditable,
  isLargeUploadFile,
  isSkippedReport,
  isUploadActive,
  MAX_BACKUP_BYTES,
  MAX_SPREADSHEET_BYTES,
  MIGRATION_ACCEPT,
  uploadStageText,
  type MigrationBatch,
} from '@/models/migration';
import type { ApiError } from '@/networks/network/apiHelpers';
import { cancelLargeUpload, uploadLargeFile } from '@/networks/settings/migrationLargeUpload';
import { removeMigrationFile, uploadMigrationFiles } from '@/networks/settings/migrationNetwork';

import { DocumentsStillNeeded } from '../DocumentsStillNeeded';
import { ExportChecklist } from '../ExportChecklist';
import { useDocumentGate, type DocumentGateState } from '../useDocumentGate';
import { migrationKey, useMigrationAction } from '../useMigration';

/** A backup on its way from this browser. */
interface Sending {
  file: File;
  uploadId: string | null;
  sent: number;
  total: number;
  paused: boolean;
  error: string | null;
  /** For speed: bytes and time when this run of sending began. */
  since: { at: number; sent: number };
  /** Bytes a second over this run; 0 until there is enough to tell. */
  rate: number;
}

/** Step 2: drop the files (or a ZIP, or a Peachtree backup); each file shows what we found in it. */
export function UploadStep({ batch, gate: given, onNext }: { batch: MigrationBatch; gate?: DocumentGateState; onNext: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const own = useDocumentGate(batch);
  const gate = given ?? own;
  const [dragging, setDragging] = useState(false);
  const upload = useMigrationAction(batch.id, (files: File[]) => uploadMigrationFiles(batch.id, files), { success: 'Files read' });
  const remove = useMigrationAction(batch.id, (fileId: string) => removeMigrationFile(batch.id, fileId), { success: 'File removed' });
  const backup = useBackupUpload(batch.id);
  const editable = isEditable(batch.status);
  const files = batch.files ?? [];
  const uploads = batch.uploads ?? [];
  const reading = uploads.find(isUploadActive);
  const latest = uploads[0];
  const failed = latest?.status === 'failed' && !files.some((f) => f.kind === 'ptb') ? latest : null;
  const interrupted = !backup.sending ? uploads.find((u) => u.status === 'receiving') : undefined;

  const take = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    const bad = picked.filter((f) => !isAcceptedMigrationFile(f.name));
    if (bad.length) toast.error(`Upload .xlsx, .csv, .txt, .iif, .xml, .zip or a Peachtree .ptb backup (${bad.map((f) => f.name).join(', ')} skipped).`);
    const backups = picked.filter((f) => isLargeUploadFile(f.name, f.size));
    const sheets = picked.filter((f) => isAcceptedMigrationFile(f.name) && !isLargeUploadFile(f.name, f.size));
    if (backups.length > 1) toast.error('Upload one large file (or Peachtree backup) at a time; the others can follow.');
    else if (backups.length === 1) {
      const f = backups[0];
      if (f.size > MAX_BACKUP_BYTES) toast.error(`${f.name} is ${formatBytes(f.size)}; a file can be up to ${formatBytes(MAX_BACKUP_BYTES)}.`);
      else if (backup.sending && !backup.sending.paused) toast.error(`${backup.sending.file.name} is still being sent.`);
      else backup.send(f);
    }
    const tooBig = sheets.filter((f) => f.size > MAX_SPREADSHEET_BYTES);
    if (tooBig.length) toast.error(`${tooBig.map((f) => f.name).join(', ')}: a spreadsheet can be up to ${formatBytes(MAX_SPREADSHEET_BYTES)}. Split it into smaller files.`);
    const fine = sheets.filter((f) => f.size <= MAX_SPREADSHEET_BYTES);
    if (fine.length) upload.mutate(fine);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (editable) take(e.dataTransfer.files);
  };

  return (
    <div className="flex flex-col gap-md">
      <ExportChecklist batch={batch} />

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
          <span className="text-caption text-text-secondary">
            Excel (.xlsx), CSV, text, QuickBooks IIF, Tally XML, ZIPs of them, or a Peachtree backup (.ptb) — any file up to 2 GB
          </span>
        </button>
      </Card>

      {files.length > 0 && !reading && <DocumentsStillNeeded gate={gate} source={batch.sourceSystem} where="upload" />}

      {backup.sending && <SendingCard sending={backup.sending} onPause={backup.pause} onResume={backup.resume} onCancel={backup.cancel} />}

      {!backup.sending && interrupted && (
        <Card className="flex flex-col gap-sm p-lg" role="status">
          <span className="flex items-center gap-sm text-label-md text-text-primary">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
            {interrupted.name} ({formatBytes(interrupted.size)}) did not finish uploading
          </span>
          <p className="text-body-sm text-text-secondary">Choose the same file again: it continues where it stopped, sending only the pieces still missing.</p>
          <div className="flex gap-sm">
            <Button size="sm" onClick={() => input.current?.click()} disabled={!editable}>
              Choose the file
            </Button>
            <Button size="sm" variant="text" onClick={() => backup.discard(interrupted.id)}>
              Discard it
            </Button>
          </div>
        </Card>
      )}

      {reading && (
        <Card className="flex items-center gap-md p-lg" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 shrink-0 animate-spin text-primary" aria-hidden />
          <div className="flex min-w-0 flex-col">
            <span className="text-label-md text-text-primary">Reading {/\.ptb$/i.test(reading.name) ? 'your Peachtree backup' : 'your export'} — {reading.name}</span>
            <span className="text-caption text-text-secondary">{uploadStageText(reading.progress)}. This takes a minute or two; you can leave this page and come back.</span>
          </div>
        </Card>
      )}

      {!reading && !backup.sending && failed && (
        <Card className="flex flex-col gap-xs border-danger p-lg" role="alert">
          <span className="flex items-center gap-sm text-label-md text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {failed.name} could not be read
          </span>
          <p className="text-body-sm text-text-primary">{failed.error ?? migrationErrorMessage(failed.errorCode)}</p>
          {failed.error && failed.errorCode && <p className="text-caption text-text-secondary">{migrationErrorMessage(failed.errorCode)}</p>}
        </Card>
      )}

      <Card className="flex flex-col gap-md p-lg">
        <SectionHeader title="Files" />
        {files.length === 0 ? (
          <p className="text-body-sm text-text-secondary">No files yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-light">
            {files.map((f) => (
              <li key={f.id} className="flex flex-col gap-xs py-md">
                <div className="flex items-center justify-between gap-sm">
                  <span className="flex min-w-0 items-center gap-sm">
                    {f.kind === 'ptb' ? (
                      <FileArchive className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
                    ) : (
                      <FileSpreadsheet className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
                    )}
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
                      className={cn('rounded-full px-sm py-[2px] text-caption', d.target && !isSkippedReport(d.target) ? (d.confidence >= 0.9 ? 'bg-success-lighter text-success' : 'bg-warning-lighter text-warning') : 'bg-neutral-100 text-text-secondary')}
                    >
                      {d.sheet} → {detectedLabel(d.target)} · {d.rows} rows
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="flex justify-end">
        <Button onClick={onNext} disabled={files.length === 0 || !!reading || !!backup.sending || (!gate.complete && gate.unplaced.length === 0)}>
          {!gate.complete && gate.unplaced.length > 0 ? 'Continue to matching to identify your sheets' : 'Continue to matching'}
        </Button>
      </div>
    </div>
  );
}

/** Sending a backup: start, pause, resume (same file), cancel. */
function useBackupUpload(batchId: string) {
  const queryClient = useQueryClient();
  const [sending, setSending] = useState<Sending | null>(null);
  const abort = useRef<AbortController | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: migrationKey(batchId) });

  // Leaving the page stops the upload; ask first. (It can still be resumed.)
  useEffect(() => {
    if (!sending || sending.paused) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [sending]);
  useEffect(() => () => abort.current?.abort(), []);

  const send = (file: File) => {
    const controller = new AbortController();
    abort.current = controller;
    setSending((s) => ({
      file,
      uploadId: s?.file === file ? s.uploadId : null,
      sent: s?.file === file ? s.sent : 0,
      total: file.size,
      paused: false,
      error: null,
      since: { at: Date.now(), sent: s?.file === file ? s.sent : 0 },
      rate: 0,
    }));
    uploadLargeFile(batchId, file, {
      signal: controller.signal,
      onProgress: (p) =>
        setSending((s) => {
          if (!s || s.file !== file) return s;
          // The first report says how much the server already held.
          const now = Date.now();
          const since = s.uploadId === null ? { at: now, sent: p.sent } : s.since;
          const secs = (now - since.at) / 1000;
          const rate = secs > 2 ? (p.sent - since.sent) / secs : 0;
          return { ...s, uploadId: p.uploadId, sent: p.sent, total: p.total, since, rate };
        }),
    })
      .then(() => {
        setSending(null);
        toast.success(`${file.name} uploaded. Reading it now.`);
        refresh();
      })
      .catch((e: ApiError) => {
        if (controller.signal.aborted) return;
        setSending((s) => (s && s.file === file ? { ...s, paused: true, error: migrationErrorMessage(e.code, e.message) } : s));
        refresh();
      });
  };

  return {
    sending,
    send,
    pause: () => {
      abort.current?.abort();
      setSending((s) => (s ? { ...s, paused: true, error: null } : s));
    },
    resume: () => {
      if (sending) send(sending.file);
    },
    cancel: async () => {
      abort.current?.abort();
      const id = sending?.uploadId;
      setSending(null);
      if (id) await cancelLargeUpload(batchId, id).catch(() => undefined);
      refresh();
    },
    discard: async (uploadId: string) => {
      await cancelLargeUpload(batchId, uploadId).catch((e: ApiError) => toast.error(migrationErrorMessage(e.code, e.message)));
      refresh();
    },
  };
}

function SendingCard({ sending, onPause, onResume, onCancel }: { sending: Sending; onPause: () => void; onResume: () => void; onCancel: () => void }) {
  const pct = sending.total ? Math.min(100, Math.floor((sending.sent / sending.total) * 100)) : 0;
  const rate = sending.rate;
  const left = rate > 0 ? Math.ceil((sending.total - sending.sent) / rate) : null;
  return (
    <Card className="flex flex-col gap-sm p-lg" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-sm">
        <span className="flex min-w-0 items-center gap-sm">
          <FileArchive className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
          <span className="truncate text-label-md text-text-primary">{sending.file.name}</span>
        </span>
        <span className="flex gap-xs">
          {sending.paused ? (
            <Button size="sm" variant="secondary" onClick={onResume}>
              <Play className="h-4 w-4" aria-hidden /> Resume
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={onPause}>
              <Pause className="h-4 w-4" aria-hidden /> Pause
            </Button>
          )}
          <Button size="sm" variant="text" onClick={onCancel} aria-label={`Cancel uploading ${sending.file.name}`}>
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={cn('h-full rounded-full transition-all', sending.paused ? 'bg-warning' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-caption text-text-secondary tabular">
        {formatBytes(sending.sent)} of {formatBytes(sending.total)} · {pct}%
        {!sending.paused && rate > 0 ? ` · ${formatBytes(rate)}/s${left !== null ? ` · about ${left < 90 ? `${left} s` : `${Math.ceil(left / 60)} min`} left` : ''}` : ''}
        {sending.paused && !sending.error ? ' · paused' : ''}
      </span>
      {sending.error ? (
        <p className="text-body-sm text-danger" role="alert">
          {sending.error} Press Resume to continue from where it stopped.
        </p>
      ) : (
        <p className="text-caption text-text-secondary">Keep this page open. If the connection drops, choose the same file again: it continues where it stopped.</p>
      )}
    </Card>
  );
}
