import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Download, Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Field';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { migrationErrorMessage } from '@/config/migrationErrors';
import { SettingsTabs } from '@/features/settings/SettingsTabs';
import {
  anyInFlight,
  BACKUP_CONTENTS,
  EXPORT_STATUS_LABEL,
  formatBytes,
  type CompanyExport,
} from '@/models/dataPortability';
import type { ApiError } from '@/networks/network/apiHelpers';
import { createExport, downloadExport, listExports } from '@/networks/settings/dataPortabilityNetwork';

const POLL_MS = 4_000;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

/**
 * Backup & export — the whole company as one ZIP. Owner only (absent from
 * STAFF_NAV, and @Roles('admin') on the server). The build runs on the server;
 * this page polls while one is in flight and downloads through the signed link.
 */
export default function BackupExportPage() {
  const queryClient = useQueryClient();
  const [includeXlsx, setIncludeXlsx] = useState(false);

  const exports = useQuery({
    queryKey: ['data-portability', 'exports'],
    queryFn: listExports,
    refetchInterval: (q) => (anyInFlight(q.state.data) ? POLL_MS : false),
  });

  const create = useMutation({
    mutationFn: () => createExport(includeXlsx),
    onSuccess: () => {
      toast.success('Backup started', { description: 'We will let you know when it is ready to download.' });
      void queryClient.invalidateQueries({ queryKey: ['data-portability', 'exports'] });
    },
    onError: (e: ApiError) => toast.error('Could not start the backup', { description: migrationErrorMessage(e.code, e.message) }),
  });

  const rows = exports.data ?? [];
  const busy = create.isPending || anyInFlight(rows);

  return (
    <div className="flex flex-col gap-lg">
      <SettingsTabs />
      <div>
        <h1 className="text-h2 text-text-primary">Backup & export</h1>
        <p className="text-body-sm text-text-secondary">
          Download your whole company as one ZIP file — your records, your reports and your attachments. Keep it safe; it is yours.
        </p>
      </div>

      <Card className="flex flex-col gap-md p-lg">
        <SectionHeader title="What a backup holds" />
        <ul className="grid gap-md sm:grid-cols-2">
          {BACKUP_CONTENTS.map((c) => (
            <li key={c.title} className="flex gap-sm">
              <ShieldCheck className="mt-[2px] h-4 w-4 shrink-0 text-success" aria-hidden />
              <div>
                <p className="text-label-md text-text-primary">{c.title}</p>
                <p className="text-body-sm text-text-secondary">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-md border-t border-border-light pt-md sm:flex-row sm:items-center sm:justify-between">
          <Switch
            checked={includeXlsx}
            onCheckedChange={setIncludeXlsx}
            label="Also include an Excel workbook (one sheet per file)"
          />
          <Button onClick={() => create.mutate()} disabled={busy} aria-label="Create backup">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
            Create backup
          </Button>
        </div>
        <p className="text-caption text-text-secondary">
          Up to 3 backups an hour. A backup can be downloaded for 24 hours, then its file is deleted.
        </p>
      </Card>

      <Card className="flex flex-col gap-md p-lg">
        <SectionHeader title="Your backups" />
        {exports.error && <p className="text-body-sm text-danger">{migrationErrorMessage((exports.error as ApiError).code, exports.error.message)}</p>}
        {exports.isLoading ? (
          <div className="h-24 animate-pulse rounded-md bg-neutral-100" />
        ) : rows.length === 0 ? (
          <p className="text-body-sm text-text-secondary">No backups yet. Create one above.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-light">
            {rows.map((e) => (
              <ExportRow key={e.id} item={e} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ExportRow({ item }: { item: CompanyExport }) {
  return (
    <li className="flex flex-col gap-sm py-md sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-sm">
          <p className="truncate text-label-md text-text-primary">{item.fileName}</p>
          <StatusBadge status={item.status} label={EXPORT_STATUS_LABEL[item.status]} />
        </div>
        <p className="text-caption text-text-secondary">
          Requested {when(item.createdAt)} · {formatBytes(item.sizeBytes)}
          {item.includeXlsx ? ' · with workbook' : ''}
          {item.status === 'ready' && item.expiresAt ? ` · available until ${when(item.expiresAt)}` : ''}
        </p>
        {item.status === 'failed' && item.error && <p className="text-caption text-danger">{item.error}</p>}
      </div>
      {item.status === 'ready' && item.downloadUrl ? (
        <Button variant="secondary" size="sm" onClick={() => downloadExport(item)} aria-label={`Download ${item.fileName}`}>
          <Download className="h-4 w-4" aria-hidden />
          Download
        </Button>
      ) : item.status === 'queued' || item.status === 'running' ? (
        <span className="flex items-center gap-xs text-caption text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {EXPORT_STATUS_LABEL[item.status]}
        </span>
      ) : null}
    </li>
  );
}
