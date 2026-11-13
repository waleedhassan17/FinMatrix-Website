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
] as const;

export type MigrationErrorCode = (typeof MIGRATION_ERROR_CODES)[number];

export const MIGRATION_ERRORS_EN: Record<MigrationErrorCode, string> = {
  MIGRATION_REQUIRES_EMPTY_BOOKS: 'This company already has transactions in its books. The Migration Center brings opening balances into a company that has not posted anything yet.',
  MIGRATION_INVALID_TRANSITION: 'That step is not available at this stage of the migration.',
  MIGRATION_FILE_TOO_LARGE: 'That file is too large. Split it into smaller files and upload them one after another.',
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
