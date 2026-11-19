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

/** How far the server is in reading an uploaded backup. */
export interface MigrationUploadProgress {
  stage: 'assembling' | 'unpacking' | 'reading' | 'analysing' | 'done';
  /** A table name, or bytes so far. */
  detail?: string;
  done?: number;
  total?: number;
}

/** A large upload (a Peachtree backup), as the batch lists it. */
export interface MigrationUploadView {
  id: string;
  name: string;
  size: number;
  status: 'receiving' | 'received' | 'reading' | 'read' | 'failed';
  progress: MigrationUploadProgress | null;
  errorCode: string | null;
  error: string | null;
  fileId: string | null;
  updatedAt: string;
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
  /** The date every posting carries and the books close through: the day before cutover. */
  openingDate?: string;
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
  /** Large uploads, newest first (detail view only). */
  uploads?: MigrationUploadView[];
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
  chartOfAccounts: Array<{ id?: string; number: string; name: string; type: string; systemRole?: string | null }>;
  /** Each source account as the owner knows it; `createAs` is its new number when FinMatrix uses its own. */
  sourceAccounts?: SourceAccountInfo[];
  /** FinMatrix's own accounts that change to fit the owner's chart. */
  chartChanges?: ChartChange[];
}

/**
 * A FinMatrix account the migration renumbers or renames: it takes the
 * owner's number and name (`adopt`), or moves off a number the owner uses
 * (`step_aside`). Its role — what automatic posting uses it for — stays.
 */
export interface ChartChange {
  accountId: string;
  role: string | null;
  fromNumber: string;
  fromName: string;
  toNumber: string;
  toName: string;
  change: 'adopt' | 'step_aside';
  source: string | null;
}

export interface SourceAccountInfo {
  number: string;
  name: string | null;
  type: string | null;
  /** Debit minus credit on the trial balance, as a decimal string. */
  balance: string;
  createAs: string | null;
}

export interface SpotCheck {
  kind: 'customer' | 'vendor';
  name: string;
  documents: number;
  /** Each open document's amount due exactly as typed in the file. */
  asTyped?: string[];
  sourceBalance: string;
  finmatrixBalance: string;
  matches: boolean;
}

export interface AsTypedFigures {
  trialBalance: Array<{ account: string; name: string; debitText: string; creditText: string; readAs: string; posted: string | null }>;
  openItems: Array<{ kind: 'invoice' | 'bill'; party: string; document: string; asTyped: string; readAs: string; partyBalance: string | null }>;
  stock: Array<{ sku: string; quantityText: string; costText: string; readAs: string; onHand: string | null }>;
  more: { trialBalance: number; openItems: number; stock: number };
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
  /** Every figure as typed, as read, and as the books hold it. */
  asTyped?: AsTypedFigures;
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

/**
 * The day the opening balances are posted on: the close of business before the
 * cutover day. The server sends it; an older server did not, so it is derived.
 */
export function openingDateOf(b: Pick<MigrationBatch, 'cutoverDate' | 'openingDate'>): string {
  if (b.openingDate) return b.openingDate;
  const [y, m, d] = b.cutoverDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

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
  peachtree_proof: "Compared with Peachtree's reports",
};

export const ORIGIN_LABEL: Record<MappingRow['origin'], string> = {
  profile: 'Saved from last time',
  rule: 'Recognised automatically',
  ai: 'Suggested by the assistant',
  user: 'Chosen by you',
};

/** A file the upload area accepts, by name; the server still checks the bytes. */
export const MIGRATION_ACCEPT = '.xlsx,.csv,.tsv,.txt,.iif,.xml,.zip,.ptb';
export const isAcceptedMigrationFile = (name: string) => /\.(xlsx|csv|tsv|txt|iif|xml|zip|ptb)$/i.test(name);

/** Peachtree's own reports, recognised beside a backup as its proof. */
export const PEACHTREE_REPORTS = [
  { kind: 'trial_balance', title: 'General Ledger Trial Balance', where: 'Reports & Forms → General Ledger', stockOnly: false },
  { kind: 'aged_receivables', title: 'Aged Receivables', where: 'Reports & Forms → Accounts Receivable', stockOnly: false },
  { kind: 'aged_payables', title: 'Aged Payables', where: 'Reports & Forms → Accounts Payable', stockOnly: false },
  { kind: 'inventory_valuation', title: 'Inventory Valuation Report', where: 'Reports & Forms → Inventory', stockOnly: true },
] as const;

/** Reports FinMatrix recognises from any system (server: sources/reports). */
export const REPORT_KIND_LABEL: Record<string, string> = {
  chart_of_accounts: 'Chart of accounts',
  customer_list: 'Customer list',
  vendor_list: 'Vendor list',
  item_list: 'Item list',
  trial_balance: 'Trial balance',
  aged_receivables: 'Aged receivables',
  aged_payables: 'Aged payables',
  inventory_valuation: 'Inventory valuation',
  general_ledger: 'General ledger — not needed, skipped',
  journal: 'Journal — not needed, skipped',
  profit_and_loss: 'Profit and loss — not needed, skipped',
  balance_sheet: 'Balance sheet — not needed, skipped',
  contact_list: 'Contact list',
  transactions: 'Invoice or bill list — not needed (the aging report is used), skipped',
};

/** One of a system's reports that a migration does not need (named, then skipped). */
export const isSkippedReport = (target: string | null) => !!target && /:(general_ledger|journal|profit_and_loss|balance_sheet|transactions)$/.test(target);

const SOURCE_LABEL: Record<string, string> = {
  peachtree: 'Peachtree / Sage 50',
  quickbooks_online: 'QuickBooks Online',
  quickbooks_desktop: 'QuickBooks Desktop',
  xero: 'Xero',
  zoho_books: 'Zoho Books',
  odoo: 'Odoo',
  sage_50: 'Sage 50',
  sage_accounting: 'Sage Accounting',
  busy: 'Busy',
  marg: 'Marg',
};

/** What a detected sheet will become, in words ("<source>:<report>" is one of a system's own reports). */
export function detectedLabel(target: string | null): string {
  if (!target) return 'not imported';
  const m = /^([a-z_]+):([a-z_]+)$/.exec(target);
  if (m) return `${SOURCE_LABEL[m[1]] ?? m[1]} ${REPORT_KIND_LABEL[m[2]] ?? 'report'}`;
  return ENTITY_LABEL[target] ?? target;
}

/** Above this, any export goes up in pieces and is read in the background (the direct route takes 25 MB). */
export const LARGE_UPLOAD_FROM_BYTES = 20 * 1024 ** 2;
/**
 * A file sent in pieces and read on the server in the background: a Peachtree
 * backup, or any export larger than the direct route comfortably takes.
 */
export const isLargeUploadFile = (name: string, size = 0) =>
  /\.ptb$/i.test(name) || (size > LARGE_UPLOAD_FROM_BYTES && /\.(zip|xlsx|csv|tsv|txt|iif|xml)$/i.test(name));
/** The server's limits (MIGRATION_MAX_UPLOAD_BYTES; the spreadsheet route's 25 MB). */
export const MAX_BACKUP_BYTES = 2 * 1024 ** 3;
export const MAX_SPREADSHEET_BYTES = 25 * 1024 ** 2;

/** An upload the server is still busy with: the page keeps asking. */
export const isUploadActive = (u: Pick<MigrationUploadView, 'status'>) => u.status === 'received' || u.status === 'reading';

export const UPLOAD_STAGE_LABEL: Record<MigrationUploadProgress['stage'], string> = {
  assembling: 'Putting the pieces together',
  unpacking: 'Unpacking the backup',
  reading: "Reading Peachtree's books",
  analysing: 'Checking what was read',
  done: 'Done',
};

/** "Reading Peachtree's books — JrnlRow, 48%": what the server is doing now. */
export function uploadStageText(p: MigrationUploadProgress | null): string {
  if (!p) return 'Waiting to be read';
  const pct = p.total && p.done !== undefined ? ` ${Math.min(100, Math.floor((p.done / p.total) * 100))}%` : '';
  return `${UPLOAD_STAGE_LABEL[p.stage] ?? 'Reading'}${p.detail ? ` — ${p.detail}` : ''}${pct ? ',' + pct : ''}`;
}
