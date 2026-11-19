// @vitest-environment jsdom

// The wizard as a whole: each "Continue" opens the step whose action moves the
// batch on. A walk-through caught the page clamping every Continue back to the
// step the status resumes on, so a draft could never reach Upload, a matched
// batch never reached Check, and a signed-off one never reached Import.

import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import authReducer from '@/store/authSlice';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/networks/settings/migrationNetwork', () => ({
  listMigrations: vi.fn(),
  getMigration: vi.fn(),
  createMigration: vi.fn(),
  uploadMigrationFiles: vi.fn(),
  removeMigrationFile: vi.fn(),
  getMappings: vi.fn(async () => ({ sheets: [], mappings: { sheet: [], column: [], value: [], account: [] }, targets: [], chartOfAccounts: [] })),
  patchMappings: vi.fn(),
  listIssues: vi.fn(async () => ({ groups: [], items: [], total: 0, page: 1, limit: 50 })),
  resolveIssue: vi.fn(),
  validateMigration: vi.fn(),
  dryRunMigration: vi.fn(),
  signOffMigration: vi.fn(),
  commitMigration: vi.fn(),
  rollbackMigration: vi.fn(),
  closeMigration: vi.fn(),
  downloadCertificate: vi.fn(),
  downloadStarterWorkbook: vi.fn(),
}));

import MigrationWizardPage from '@/pages/settings/migration/MigrationWizardPage';
import { maxReachableStep, type CertificatePreview, type MigrationBatch } from '@/models/migration';
import * as net from '@/networks/settings/migrationNetwork';

/** A file whose sheets FinMatrix recognised as these targets. */
const fileOf = (...targets: string[]) => ({
  id: `f-${targets.join('-')}`, originalName: 'export.xlsx', kind: 'xlsx', sizeBytes: 1000, sha256: '', uploadedAt: '',
  detected: targets.map((t) => ({ sheet: t, target: t, confidence: 1, rows: 10, headers: [] })),
}) as unknown as NonNullable<MigrationBatch['files']>[number];
const batch = (over: Partial<MigrationBatch> = {}): MigrationBatch => ({
  id: 'b1', sourceSystem: 'finmatrix_template', cutoverDate: '2026-06-30', status: 'draft', step: 1, readiness: 0, counts: null, checks: [], issues: { blocking: 0, warning: 0 }, lastError: null,
  signedOffAt: null, signedOffBy: null, committedAt: null, closedAt: null, rolledBackAt: null, certificateAvailable: false, createdAt: '', updatedAt: '',
  files: [fileOf('accounts', 'trial_balance', 'stock')], ...over,
});
const preview: CertificatePreview = {
  batchId: 'b1', cutoverDate: '2026-06-30', checks: [], allPassed: true, rowCounts: [], rejectedRows: [], rejectedTotal: 0, postings: [], created: {},
  spotChecks: [{ kind: 'customer', name: 'Al-Noor Traders', documents: 2, sourceBalance: '165000.00', finmatrixBalance: '165000.00', matches: true }],
};

async function open(b: MigrationBatch) {
  vi.mocked(net.getMigration).mockResolvedValue(b);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <Provider store={configureStore({ reducer: { auth: authReducer } })}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/settings/migration/b1']}>
          <Routes>
            <Route path="/settings/migration/:id" element={<MigrationWizardPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
  await screen.findByRole('heading', { name: 'Move to FinMatrix' });
}

beforeEach(() => vi.clearAllMocks());

describe('maxReachableStep', () => {
  it('opens one step past where the batch resumes, never past a missing prerequisite', () => {
    const r = (status: MigrationBatch['status'], blocking = 0, signedOffAt: string | null = null) => maxReachableStep({ status, issues: { blocking, warning: 0 }, signedOffAt });
    expect(r('draft')).toBe(2);
    expect(r('uploaded')).toBe(3);
    expect(r('mapped')).toBe(5);
    expect(r('mapped', 3)).toBe(4);
    expect(r('validated')).toBe(5);
    expect(r('ready')).toBe(6);
    expect(r('ready', 0, '2026-11-13T10:00:00Z')).toBe(7);
    expect(r('committed')).toBe(7);
  });
});

describe('MigrationWizardPage', () => {
  it('goes from Start to Upload on a draft batch', async () => {
    await open(batch());
    fireEvent.click(screen.getByRole('button', { name: 'Continue to upload' }));
    expect(await screen.findByRole('button', { name: 'Continue to matching' })).toBeTruthy();
  });

  it('goes from Match to Check once everything is matched', async () => {
    await open(batch({ status: 'mapped', step: 3, readiness: 80 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to checks' }));
    expect(await screen.findByRole('button', { name: 'Run the checks' })).toBeTruthy();
  });

  it('stays on Upload while a required document is missing, though the server has read the first one', async () => {
    // Only Xero's trial balance so far: the server has matched it, but the
    // chart of accounts and the aged reports are still to come.
    await open(batch({ sourceSystem: 'xero', status: 'mapped', step: 3, readiness: 60, files: [fileOf('xero:trial_balance')] }));
    const panel = (await screen.findByText(/more documents are needed before you continue/)).closest('[role=status]') as HTMLElement;
    for (const doc of ['Chart of accounts (CSV)', 'Aged Receivables Detail', 'Aged Payables Detail']) expect(panel.textContent).toContain(doc);
    const next = screen.getByRole('button', { name: 'Continue to matching' }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Match/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('moves on once every required document has arrived (and the owner has no stock)', async () => {
    await open(batch({ sourceSystem: 'xero', status: 'mapped', step: 3, readiness: 60, files: [fileOf('xero:trial_balance', 'xero:chart_of_accounts', 'xero:aged_receivables', 'xero:aged_payables')] }));
    // Stock is the one thing left; the owner says there is none.
    fireEvent.click(await screen.findByRole('checkbox', { name: /We have no stock to bring in/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to checks' }));
    expect(await screen.findByRole('button', { name: 'Run the checks' })).toBeTruthy();
  });

  it('keeps Check shut while a blocking issue is open', async () => {
    await open(batch({ status: 'mapped', step: 4, issues: { blocking: 2, warning: 0 } }));
    const next = await screen.findByRole('button', { name: '2 problems left' });
    expect((next as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Run the checks' })).toBeNull();
  });

  it('opens Import as soon as the owner signs off', async () => {
    const ready = batch({ status: 'ready', step: 6, readiness: 100 });
    vi.mocked(net.dryRunMigration).mockResolvedValue({ batch: ready, certificate: preview });
    const signed = { ...ready, signedOffAt: '2026-11-13T10:00:00Z', signedOffBy: { id: 'u1', name: 'Owner' } };
    vi.mocked(net.signOffMigration).mockImplementation(async () => {
      // The server now holds the signed-off batch; the refetch reads it too.
      vi.mocked(net.getMigration).mockResolvedValue(signed);
      return signed;
    });
    await open(ready);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Spot check Al-Noor Traders' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Confirm the certificate' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign off' }));
    });
    const importButton = await screen.findByRole('button', { name: 'Import' });
    expect((importButton as HTMLButtonElement).disabled).toBe(false);
  });
});
