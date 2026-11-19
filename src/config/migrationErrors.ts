// ═══ FinMatrix Web — Migration Center and backup error messages ═══
//
// Every code the Migration Center and the backup can return, in plain words.
// The web app has no i18n system yet, so the Urdu map holds placeholders
// marked TODO_UR for translation; `migrationErrorMessage` falls back to
// English (and then to the server's own sentence) whenever a string is missing.

export const MIGRATION_ERROR_CODES = [
  'MIGRATION_REQUIRES_EMPTY_BOOKS',
  'MIGRATION_INVALID_TRANSITION',
  'MIGRATION_FILE_TOO_LARGE',
  'MIGRATION_FILE_UNREADABLE',
  'MIGRATION_UNKNOWN_SHEET',
  'MIGRATION_REQUIRED_COLUMN_MISSING',
  'MIGRATION_FEATURE_DISABLED',
  'AMBIGUOUS_DATE_FORMAT',
  'INVALID_AMOUNT',
  'INVALID_DATE',
  'INVALID_VALUE',
  'MISSING_REQUIRED_VALUE',
  'MAPPING_UNCONFIRMED',
  'AMOUNT_READBACK_MISMATCH',
  'DATE_READBACK_MISMATCH',
  'DUPLICATE_RECORD',
  'UNKNOWN_ACCOUNT',
  'UNKNOWN_CUSTOMER',
  'UNKNOWN_VENDOR',
  'UNKNOWN_ITEM',
  'AI_QUESTION',
  'CHECK_FAILED',
  'NOT_SIGNED_OFF',
  'ROLLBACK_BLOCKED',
  'MIGRATED_DOCUMENT_IMMUTABLE',
  'EXPORT_NOT_READY',
  'EXPORT_EXPIRED',
  'EXPORT_LINK_INVALID',
  'EXPORT_RATE_LIMITED',
  'MIGRATION_UPLOAD_INCOMPLETE',
  'MIGRATION_UPLOAD_PART_CORRUPT',
  'MIGRATION_USE_LARGE_UPLOAD',
  'MIGRATION_SERVER_DISK_FULL',
  'MIGRATION_PTB_UNREADABLE',
  'MIGRATION_PTB_UNSUPPORTED',
  'MIGRATION_PTB_TABLE_MISSING',
  'PEACHTREE_CROSSCHECK_FAILED',
  'PEACHTREE_POSTED_AFTER_CUTOVER',
  'PEACHTREE_CONTROL_DIFFERENCE',
  'PEACHTREE_NET_CREDIT',
  'PEACHTREE_FISCAL_YEAR',
  'PEACHTREE_REPORTS_MISSING',
  'PEACHTREE_REPORT_MISMATCH',
  'SOURCE_REPORTS_MISSING',
  'SOURCE_REPORT_DUPLICATE',
  'SOURCE_REPORT_DATE',
  'SOURCE_TOTALS_MISMATCH',
  'SOURCE_NET_CREDIT',
  'MIGRATION_CHART_CHANGED',
] as const;

export type MigrationErrorCode = (typeof MIGRATION_ERROR_CODES)[number];

export const MIGRATION_ERRORS_EN: Record<MigrationErrorCode, string> = {
  MIGRATION_REQUIRES_EMPTY_BOOKS: 'This company already has transactions in its books. The Migration Center brings opening balances into a company that has not posted anything yet.',
  MIGRATION_INVALID_TRANSITION: 'That step is not available at this stage of the migration.',
  MIGRATION_FILE_TOO_LARGE: 'That file is too large. Spreadsheets can be up to 25 MB each (split a larger one into several files); a Peachtree backup (.ptb) up to 2 GB.',
  MIGRATION_FILE_UNREADABLE: 'We could not open that file. Save it again as .xlsx or .csv (or export Tally as XML) and retry.',
  MIGRATION_UNKNOWN_SHEET: 'We could not tell what one of the sheets holds. Choose its type, or skip it.',
  MIGRATION_REQUIRED_COLUMN_MISSING: 'A sheet is missing a column we need. Pick the column that holds it.',
  MIGRATION_FEATURE_DISABLED: 'Your plan does not include inventory, so stock cannot be imported.',
  AMBIGUOUS_DATE_FORMAT: 'The dates in this file could be day/month or month/day. Tell us which.',
  INVALID_AMOUNT: 'One of the amounts is not a number we can read.',
  INVALID_DATE: 'One of the dates is not a date we can read.',
  INVALID_VALUE: 'One of the values is not one we recognise. Choose what it means.',
  MISSING_REQUIRED_VALUE: 'A required value is empty.',
  MAPPING_UNCONFIRMED: 'We are not sure about this match. Confirm it or choose another.',
  AMOUNT_READBACK_MISMATCH: 'This amount can be read two ways. Type it plainly (for example 120000) so there is only one.',
  DATE_READBACK_MISMATCH: 'This date can be read two ways. Type it as year-month-day (for example 2026-06-30).',
  DUPLICATE_RECORD: 'This record appears twice. Merge the rows or skip one.',
  UNKNOWN_ACCOUNT: 'An account in your trial balance is not in your chart of accounts. Map it, or create it.',
  UNKNOWN_CUSTOMER: 'An invoice names a customer we cannot find. Match it to one, or create it.',
  UNKNOWN_VENDOR: 'A bill names a vendor we cannot find. Match it to one, or create it.',
  UNKNOWN_ITEM: 'A stock line names an item we cannot find. Add it to the Items sheet.',
  AI_QUESTION: 'The mapping assistant has a question for you.',
  CHECK_FAILED: 'A reconciliation check failed, so nothing was imported. Fix what the check shows and run the checks again.',
  NOT_SIGNED_OFF: 'Review the certificate, tick every spot check, then sign off before importing.',
  ROLLBACK_BLOCKED: 'This migration can no longer be undone, because newer records depend on it.',
  MIGRATED_DOCUMENT_IMMUTABLE: 'This document came from your migration. Undo the migration, or settle it with a payment or credit.',
  EXPORT_NOT_READY: 'This backup is still being built. Try again in a moment.',
  EXPORT_EXPIRED: 'This backup has expired. Create a new one.',
  EXPORT_LINK_INVALID: 'This download link is not valid. Create a new backup.',
  EXPORT_RATE_LIMITED: 'You can create up to 3 backups an hour. Download the latest one, or try again later.',
  MIGRATION_UPLOAD_INCOMPLETE: 'Part of the backup has not arrived yet. Choose the same file again: only the missing pieces are sent.',
  MIGRATION_UPLOAD_PART_CORRUPT: 'A piece of the backup was damaged on the way. Choose the same file again: only the damaged pieces are sent again.',
  MIGRATION_USE_LARGE_UPLOAD: 'A Peachtree backup (.ptb) is sent in pieces. Drop it into the upload area on its own.',
  MIGRATION_SERVER_DISK_FULL: 'The server has too little room to read this backup right now. It tries again by itself; if it still fails, contact support.',
  MIGRATION_PTB_UNREADABLE: 'This is not a readable Peachtree backup. In Peachtree use File → Back Up, and upload that file exactly as it was saved.',
  MIGRATION_PTB_UNSUPPORTED: 'This backup is from a Peachtree / Sage 50 version FinMatrix cannot read yet. Contact support and tell us the Peachtree version.',
  MIGRATION_PTB_TABLE_MISSING: 'This backup is missing part of the company. In Peachtree use File → Back Up for the whole company, and upload that file.',
  PEACHTREE_CROSSCHECK_FAILED: "Peachtree's own figures in this backup disagree with each other. Run Peachtree's data verification (File → Data Verification), make a new backup and upload it.",
  PEACHTREE_POSTED_AFTER_CUTOVER: 'Peachtree has entries on or after your cutover date. Choose a cutover date after the last Peachtree entry.',
  PEACHTREE_CONTROL_DIFFERENCE: "A Peachtree control account does not agree with its customers, vendors or items. Accept to keep the difference on its own account, or correct it in Peachtree.",
  PEACHTREE_NET_CREDIT: 'Some customers or vendors have credits left over after their open documents. Accept to bring them in as advances.',
  PEACHTREE_FISCAL_YEAR: "Peachtree's fiscal year starts in a different month from this company's. Make them the same before importing.",
  PEACHTREE_REPORTS_MISSING: "Upload Peachtree's General Ledger Trial Balance, Aged Receivables and Aged Payables (and Inventory Valuation if you keep stock), exported to Excel as of the day before your cutover.",
  PEACHTREE_REPORT_MISMATCH: "A Peachtree report does not agree with the backup. Export the reports again from the same company, as of the day before your cutover, and upload them.",
  SOURCE_REPORTS_MISSING: 'A report is still needed: your trial balance has a balance it explains (receivables, payables or stock). Export it as of the day before your cutover and upload it.',
  SOURCE_REPORT_DUPLICATE: 'The same report was uploaded twice. Remove one of them.',
  SOURCE_REPORT_DATE: 'A report is not as of the day before your cutover. Change the cutover date if every report is right, or export the report again for the right date.',
  SOURCE_TOTALS_MISMATCH: "A report's own printed total does not match its lines. Export it again from your old system, unchanged, and upload it.",
  SOURCE_NET_CREDIT: 'Some customers or vendors have more credit than open invoices or bills. Accept to bring the rest in as advances, or apply the credits in your old system first.',
  MIGRATION_CHART_CHANGED: 'The chart of accounts changed after your files were checked. Check the files again (re-upload one, or change any answer) so the plan matches the chart.',
};

/** TODO_UR: every entry awaits translation; until then English is shown. */
export const MIGRATION_ERRORS_UR: Record<MigrationErrorCode, string> = Object.fromEntries(
  MIGRATION_ERROR_CODES.map((c) => [c, `TODO_UR ${c}`]),
) as Record<MigrationErrorCode, string>;

const isTodo = (s: string | undefined) => !s || s.startsWith('TODO_UR');

/**
 * The sentence for an error code. Unknown codes fall back to the server's own
 * message, then to a generic sentence — never to a raw code.
 */
export function migrationErrorMessage(code: string | undefined | null, serverMessage?: string | null, lang: 'en' | 'ur' = 'en'): string {
  if (code && (MIGRATION_ERROR_CODES as readonly string[]).includes(code)) {
    const key = code as MigrationErrorCode;
    if (lang === 'ur' && !isTodo(MIGRATION_ERRORS_UR[key])) return MIGRATION_ERRORS_UR[key];
    return MIGRATION_ERRORS_EN[key];
  }
  return serverMessage?.trim() || 'Something went wrong. Please try again.';
}

/** Short headings for the Fix step's groups; the sentence above explains each. */
const ISSUE_TITLES: Record<string, string> = {
  MIGRATION_UNKNOWN_SHEET: 'Sheets to identify',
  MIGRATION_REQUIRED_COLUMN_MISSING: 'Missing columns',
  MIGRATION_FILE_UNREADABLE: 'Files that could not be read',
  AMBIGUOUS_DATE_FORMAT: 'Date format',
  INVALID_AMOUNT: 'Amounts to correct',
  INVALID_DATE: 'Dates to correct',
  INVALID_VALUE: 'Values to choose',
  MISSING_REQUIRED_VALUE: 'Empty required values',
  MAPPING_UNCONFIRMED: 'Matches to confirm',
  AMOUNT_READBACK_MISMATCH: 'Amounts that read two ways',
  DATE_READBACK_MISMATCH: 'Dates that read two ways',
  DUPLICATE_RECORD: 'Duplicates',
  UNKNOWN_ACCOUNT: 'Accounts to place',
  UNKNOWN_CUSTOMER: 'Customers to match',
  UNKNOWN_VENDOR: 'Vendors to match',
  UNKNOWN_ITEM: 'Items to match',
  AI_QUESTION: 'Questions from the assistant',
  PEACHTREE_CROSSCHECK_FAILED: 'Backup cross-check',
  PEACHTREE_POSTED_AFTER_CUTOVER: 'Entries after the cutover',
  PEACHTREE_CONTROL_DIFFERENCE: 'Control account differences',
  PEACHTREE_NET_CREDIT: 'Credits left over',
  PEACHTREE_FISCAL_YEAR: 'Fiscal year',
  PEACHTREE_REPORTS_MISSING: 'Reports still needed',
  PEACHTREE_REPORT_MISMATCH: 'Reports that disagree with the backup',
  SOURCE_REPORTS_MISSING: 'Reports still needed',
  SOURCE_REPORT_DUPLICATE: 'Reports uploaded twice',
  SOURCE_REPORT_DATE: 'Report dates',
  SOURCE_TOTALS_MISMATCH: 'Report totals that do not add up',
  SOURCE_NET_CREDIT: 'Credits left over',
};

export const migrationIssueTitle = (code: string): string => ISSUE_TITLES[code] ?? 'Other problems';

/**
 * Problems about a whole report or file, answered in the old system (or by
 * an offered option): skipping them would mean nothing.
 */
export const REPORT_LEVEL_CODES = new Set([
  'MIGRATION_FILE_UNREADABLE',
  'PEACHTREE_CROSSCHECK_FAILED',
  'PEACHTREE_POSTED_AFTER_CUTOVER',
  'PEACHTREE_FISCAL_YEAR',
  'PEACHTREE_REPORTS_MISSING',
  'PEACHTREE_REPORT_MISMATCH',
  'SOURCE_REPORTS_MISSING',
  'SOURCE_REPORT_DUPLICATE',
  'SOURCE_REPORT_DATE',
  'SOURCE_TOTALS_MISMATCH',
  'SOURCE_NET_CREDIT',
]);
