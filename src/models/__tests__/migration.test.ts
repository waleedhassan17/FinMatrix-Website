import { describe, expect, it } from 'vitest';

import { MIGRATION_ERROR_CODES, MIGRATION_ERRORS_EN, migrationErrorMessage } from '@/config/migrationErrors';
import { anyInFlight, formatBytes } from '@/models/dataPortability';
import { canImport, canSignOff, maxReachableStep, stepFromStatus, type SpotCheck } from '@/models/migration';

describe('stepFromStatus', () => {
  it('opens each status on its wizard step, so the owner resumes where they were', () => {
    expect(stepFromStatus('draft', 0)).toBe(1);
    expect(stepFromStatus('uploaded', 0)).toBe(2);
    expect(stepFromStatus('mapped', 0)).toBe(3);
    expect(stepFromStatus('mapped', 2)).toBe(4);
    expect(stepFromStatus('validated', 0)).toBe(5);
    expect(stepFromStatus('ready', 0)).toBe(6);
    expect(stepFromStatus('committed', 0)).toBe(7);
    expect(stepFromStatus('closed', 0)).toBe(7);
    expect(stepFromStatus('rolled_back', 0)).toBe(7);
    expect(maxReachableStep({ status: 'mapped', issues: { blocking: 3, warning: 0 } })).toBe(4);
  });
});

describe('import and sign-off gates', () => {
  it('allows Import only when ready, at 100% and signed off', () => {
    expect(canImport({ status: 'ready', readiness: 100, signedOffAt: '2026-11-13T00:00:00Z' })).toBe(true);
    expect(canImport({ status: 'ready', readiness: 100, signedOffAt: null })).toBe(false);
    expect(canImport({ status: 'ready', readiness: 99, signedOffAt: 'x' })).toBe(false);
    expect(canImport({ status: 'validated', readiness: 100, signedOffAt: 'x' })).toBe(false);
  });

  it('allows sign-off only with the certificate confirmed and every spot check ticked', () => {
    const spot = [{ name: 'A' }, { name: 'B' }] as SpotCheck[];
    expect(canSignOff({ status: 'ready' }, spot, new Set([0, 1]), true)).toBe(true);
    expect(canSignOff({ status: 'ready' }, spot, new Set([0]), true)).toBe(false);
    expect(canSignOff({ status: 'ready' }, spot, new Set([0, 1]), false)).toBe(false);
    expect(canSignOff({ status: 'validated' }, spot, new Set([0, 1]), true)).toBe(false);
    expect(canSignOff({ status: 'ready' }, [], new Set(), true)).toBe(true);
  });
});

describe('migrationErrorMessage', () => {
  it('has plain English for every documented code', () => {
    for (const c of MIGRATION_ERROR_CODES) {
      expect(MIGRATION_ERRORS_EN[c].length).toBeGreaterThan(20);
      expect(migrationErrorMessage(c)).toBe(MIGRATION_ERRORS_EN[c]);
    }
    for (const c of ['MIGRATION_REQUIRES_EMPTY_BOOKS', 'MIGRATION_INVALID_TRANSITION', 'MIGRATION_FILE_TOO_LARGE', 'MIGRATION_FILE_UNREADABLE', 'MIGRATION_UNKNOWN_SHEET', 'MIGRATION_REQUIRED_COLUMN_MISSING', 'AMBIGUOUS_DATE_FORMAT', 'INVALID_AMOUNT', 'DUPLICATE_RECORD', 'UNKNOWN_ACCOUNT', 'UNKNOWN_CUSTOMER', 'UNKNOWN_VENDOR', 'UNKNOWN_ITEM', 'CHECK_FAILED', 'NOT_SIGNED_OFF', 'ROLLBACK_BLOCKED', 'EXPORT_NOT_READY', 'EXPORT_EXPIRED']) {
      expect(MIGRATION_ERROR_CODES as readonly string[]).toContain(c);
    }
  });

  it('falls back to English for untranslated Urdu, then to the server sentence, never a raw code', () => {
    expect(migrationErrorMessage('EXPORT_EXPIRED', null, 'ur')).toBe(MIGRATION_ERRORS_EN.EXPORT_EXPIRED);
    expect(migrationErrorMessage('SOMETHING_NEW', 'The server says why.')).toBe('The server says why.');
    expect(migrationErrorMessage(undefined, '')).toBe('Something went wrong. Please try again.');
  });
});

describe('backup helpers', () => {
  it('formats sizes and knows when to poll', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(800)).toBe('800 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(11_545_629)).toBe('11.0 MB');
    expect(anyInFlight([{ status: 'ready' }, { status: 'running' }])).toBe(true);
    expect(anyInFlight([{ status: 'ready' }, { status: 'expired' }])).toBe(false);
    expect(anyInFlight(undefined)).toBe(false);
  });
});
