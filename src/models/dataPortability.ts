// ═══ FinMatrix Web — Company backup (data portability) ═══
//
// A backup is a job on the server: queued → running → ready, or failed; a
// ready file expires after 24 hours. These are the pure rules the page reads.

export type ExportStatus = 'queued' | 'running' | 'ready' | 'failed' | 'expired';

export interface CompanyExport {
  id: string;
  status: ExportStatus;
  includeXlsx: boolean;
  fileName: string;
  asOf: string;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  sizeBytes: number | null;
  error: string | null;
  /** Signed link — present only while the file can be downloaded. */
  downloadUrl: string | null;
}

export const EXPORT_STATUS_LABEL: Record<ExportStatus, string> = {
  queued: 'Waiting to start',
  running: 'Building…',
  ready: 'Ready',
  failed: 'Failed',
  expired: 'Expired',
};

/** Poll while any backup is still being built. */
export const isExportInFlight = (e: Pick<CompanyExport, 'status'>) => e.status === 'queued' || e.status === 'running';
export const anyInFlight = (list: Array<Pick<CompanyExport, 'status'>> | undefined) => !!list?.some(isExportInFlight);

/** `1.2 MB`, `850 KB`, `—`. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** What the ZIP holds, for the page's explanation. */
export const BACKUP_CONTENTS: Array<{ title: string; body: string }> = [
  { title: 'Every record, as CSV', body: 'Accounts, customers, vendors, items, invoices, payments, bills, journal entries, the ledger and stock movements — one file each, which Excel opens with Urdu names intact.' },
  { title: 'Your reports, as PDF', body: 'Trial balance, balance sheet, profit and loss for this year, and the receivables and payables aging.' },
  { title: 'Your attachments', body: 'Payment proofs, item photos, delivery bill photos and your logo, with their original names.' },
  { title: 'A manifest', body: 'What the backup holds, a checksum for every file, and the trial balance it adds up to — proof the backup is complete.' },
];
