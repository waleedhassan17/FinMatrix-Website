// ═══ FinMatrix Web — Migration Center ═══
//
// The batch lives on the server; these are the shapes it returns and the
// pure rules the wizard reads (which step, whether a button is enabled).

import type { MigrationSourceSystem } from '@/config/migrationSources';

export type MigrationStatus = 'draft' | 'uploaded' | 'mapped' | 'validated' | 'ready' | 'committed' | 'closed' | 'rolled_back';

export interface MigrationCheck {
  code: string;
  label: string;
  expected: string;
  actual: string;
  difference: string;
  passed: boolean;
  details: Array<Record<string, unknown>>;
}

export interface DetectedSheet {
  sheet: string;
  target: string | null;
  confidence: number;
  rows: number;
  headers: string[];
}

export interface MigrationFile {
  id: string;
  originalName: string;
  sizeBytes: number;
  kind: string;
  detected: DetectedSheet[] | null;
  createdAt: string;
}

export interface RowCount {
  source: number;
  imported: number;
  merged: number;
  rejected: number;
  pending: number;
}

export interface MigrationBatch {
  id: string;
  sourceSystem: MigrationSourceSystem;
  cutoverDate: string;
  status: MigrationStatus;
  step: number;
  readiness: number;
  counts: { rows: Record<string, RowCount>; issues: { blocking: number; warning: number; resolved: number }; mappings: { total: number; confident: number } } | null;
  checks: MigrationCheck[] | null;
  issues: { blocking: number; warning: number };
  lastError: string | null;
  signedOffAt: string | null;
  signedOffBy: { id: string; name: string } | null;
  committedAt: string | null;
  closedAt: string | null;
  rolledBackAt: string | null;
  certificateAvailable: boolean;
  createdAt: string;
  updatedAt: string;
  files?: MigrationFile[];
}

export interface MigrationIssueOption {
  value: string;
  label: string;
}

export interface MigrationIssue {
  id: string;
  code: string;
  severity: 'blocking' | 'warning';
  sheet: string | null;
  rowNumber: number | null;
  field: string | null;
  message: string;
  options: MigrationIssueOption[] | null;
}

export interface IssuePage {
  groups: Array<{ code: string; severity: string; count: number }>;
  items: MigrationIssue[];
  total: number;
  page: number;
  limit: number;
}

export interface MappingRow {
  id: string;
  kind: 'sheet' | 'column' | 'value' | 'account' | 'match' | 'cell' | 'skip';
  sheet: string | null;
  source: string;
  target: string | null;
  confidence: number;
  origin: 'profile' | 'rule' | 'ai' | 'user';
  reason: string | null;
  confirmed: boolean;
  needsReview: boolean;
}

export interface MappingsView {
  sheets: Array<DetectedSheet & { file: string; fileId: string }>;
  mappings: { sheet: MappingRow[]; column: MappingRow[]; value: MappingRow[]; account: MappingRow[] };
  targets: Array<{ key: string; name: string; fields: Array<{ key: string; header: string; required: boolean; kind: string }> }>;
  chartOfAccounts: Array<{ number: string; name: string; type: string }>;
}

export interface SpotCheck {
  kind: 'customer' | 'vendor';
  name: string;
  documents: number;
  sourceBalance: string;
  finmatrixBalance: string;
  matches: boolean;
}

export interface CertificatePreview {
  batchId: string;
  cutoverDate: string;
  checks: MigrationCheck[];
  allPassed: boolean;
  rowCounts: Array<{ entity: string } & RowCount>;
  rejectedRows: Array<{ sheet: string; rowNumber: number; reason: string }>;
  rejectedTotal: number;
  spotChecks: SpotCheck[];
  postings: Array<{ reference: string; memo: string; lines: number; total: string }>;
  created: Record<string, number>;
}

export const WIZARD_STEPS = [
  { step: 1, key: 'start', label: 'Start' },
  { step: 2, key: 'upload', label: 'Upload' },
  { step: 3, key: 'match', label: 'Match' },
  { step: 4, key: 'fix', label: 'Fix' },
  { step: 5, key: 'check', label: 'Check' },
  { step: 6, key: 'review', label: 'Review' },
  { step: 7, key: 'import', label: 'Import' },
] as const;

/**
 * The step a batch belongs on. The server sends `step` too; this is the same
 * rule, so the wizard can resume where the owner left off even from a list
 * row that predates the field.
 */
export function stepFromStatus(status: MigrationStatus, blockingIssues: number): number {
  switch (status) {
    case 'draft':
      return 1;
    case 'uploaded':
      return 2;
    case 'mapped':
      return blockingIssues > 0 ? 4 : 3;
    case 'validated':
      return 5;
    case 'ready':
      return 6;
    default:
      return 7;
  }
}

/**
 * The furthest step the owner may open. It runs one step past where the batch
 * resumes, because each step's server action lives on the step that needs it:
 * a draft batch is uploaded to on Upload, a matched one is checked on Check,
 * a ready one is imported on Import. Steps whose prerequisites are missing
 * stay shut: no checks while a blocking issue is open, no Import before sign-off.
 */
export function maxReachableStep(batch: Pick<MigrationBatch, 'status' | 'issues'> & { signedOffAt?: string | null }): number {
  switch (batch.status) {
    case 'draft':
      return 2;
    case 'uploaded':
      return 3;
    case 'mapped':
      return batch.issues.blocking > 0 ? 4 : 5;
    case 'validated':
      return 5;
    case 'ready':
      return batch.signedOffAt ? 7 : 6;
    default:
      return 7;
  }
}

export const MIGRATION_STATUS_LABEL: Record<MigrationStatus, string> = {
  draft: 'Not started',
  uploaded: 'Files uploaded',
  mapped: 'Matching',
  validated: 'Checks failing',
  ready: 'Ready to import',
  committed: 'Imported',
  closed: 'Closed',
  rolled_back: 'Undone',
};

/** Import is possible only when the server says ready (100%, all checks) and the owner has signed off. */
export const canImport = (b: Pick<MigrationBatch, 'status' | 'readiness' | 'signedOffAt'>) => b.status === 'ready' && b.readiness === 100 && !!b.signedOffAt;

/** Sign-off needs a ready batch, the certificate confirmed and every spot check ticked. */
export function canSignOff(b: Pick<MigrationBatch, 'status'>, spotChecks: SpotCheck[], ticked: ReadonlySet<number>, confirmed: boolean): boolean {
  if (b.status !== 'ready' || !confirmed) return false;
  return spotChecks.every((_, i) => ticked.has(i));
}

export const isEditable = (s: MigrationStatus) => ['draft', 'uploaded', 'mapped', 'validated', 'ready'].includes(s);
export const isTerminal = (s: MigrationStatus) => s === 'closed' || s === 'rolled_back';

export const ENTITY_LABEL: Record<string, string> = {
  accounts: 'Accounts',
  customers: 'Customers',
  vendors: 'Vendors',
  items: 'Items',
  trial_balance: 'Trial balance',
  open_invoices: 'Open invoices',
  open_bills: 'Open bills',
  stock: 'Stock',
};

export const ORIGIN_LABEL: Record<MappingRow['origin'], string> = {
  profile: 'Saved from last time',
  rule: 'Matched by name',
  ai: 'Suggested by the assistant',
  user: 'Chosen by you',
};

/** A file the upload area accepts, by name; the server still checks the bytes. */
export const MIGRATION_ACCEPT = '.xlsx,.csv,.xml,.zip';
export const isAcceptedMigrationFile = (name: string) => /\.(xlsx|csv|xml|zip)$/i.test(name);
