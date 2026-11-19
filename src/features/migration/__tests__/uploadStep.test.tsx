// @vitest-environment jsdom

import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import authReducer from '@/store/authSlice';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/networks/settings/migrationNetwork', () => ({
  uploadMigrationFiles: vi.fn(async () => ({ id: 'b1', status: 'uploaded' })),
  removeMigrationFile: vi.fn(),
  getMigration: vi.fn(),
}));
vi.mock('@/networks/settings/migrationLargeUpload', () => ({
  uploadLargeFile: vi.fn(),
  cancelLargeUpload: vi.fn(async () => ({ id: 'u1', cancelled: true })),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from 'sonner';
import { UploadStep } from '@/features/migration/steps/UploadStep';
import type { MigrationBatch, MigrationUploadView } from '@/models/migration';
import { cancelLargeUpload, uploadLargeFile } from '@/networks/settings/migrationLargeUpload';
import { uploadMigrationFiles } from '@/networks/settings/migrationNetwork';

const batch = (over: Partial<MigrationBatch> = {}): MigrationBatch => ({
  id: 'b1', sourceSystem: 'peachtree', cutoverDate: '2026-10-06', status: 'uploaded', step: 2, readiness: 0, counts: null, checks: null, issues: { blocking: 0, warning: 0 }, lastError: null,
  signedOffAt: null, signedOffBy: null, committedAt: null, closedAt: null, rolledBackAt: null, certificateAvailable: false, createdAt: '', updatedAt: '', files: [], uploads: [], ...over,
});
const up = (over: Partial<MigrationUploadView>): MigrationUploadView => ({
  id: 'u1', name: 'company.ptb', size: 253_618_655, status: 'receiving', progress: null, errorCode: null, error: null, fileId: null, updatedAt: '', ...over,
});
const wrap = (ui: ReactNode) =>
  render(
    <Provider store={configureStore({ reducer: { auth: authReducer } })}>
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
      </MemoryRouter>
    </Provider>,
  );
const choose = (files: File[]) => {
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
};

describe('Upload step: a Peachtree backup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts .ptb, and sends it in pieces rather than with the spreadsheets', async () => {
    vi.mocked(uploadLargeFile).mockReturnValue(new Promise(() => undefined));
    wrap(<UploadStep batch={batch()} onNext={vi.fn()} />);
    expect((document.querySelector('input[type=file]') as HTMLInputElement).accept).toContain('.ptb');
    const backup = new File(['x'], 'FAROOQ.ptb');
    const sheet = new File(['y'], 'Trial Balance.xlsx');
    choose([backup, sheet]);
    await waitFor(() => expect(uploadLargeFile).toHaveBeenCalledWith('b1', backup, expect.objectContaining({ signal: expect.any(AbortSignal) })));
    expect(uploadMigrationFiles).toHaveBeenCalledWith('b1', [sheet]);
    expect(screen.getByRole('button', { name: /Pause/ })).toBeTruthy();
    expect(screen.getByText(/Keep this page open/)).toBeTruthy();
    // Matching waits while the backup is on its way.
    expect((screen.getByRole('button', { name: 'Continue to matching' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('refuses two backups at once', () => {
    wrap(<UploadStep batch={batch()} onNext={vi.fn()} />);
    choose([new File(['a'], 'a.ptb'), new File(['b'], 'b.ptb')]);
    expect(uploadLargeFile).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Upload one large file (or Peachtree backup) at a time; the others can follow.');
  });

  it('sends any export over 20 MB in pieces, not through the direct route', async () => {
    vi.mocked(uploadLargeFile).mockReturnValue(new Promise(() => undefined));
    wrap(<UploadStep batch={batch({ sourceSystem: 'quickbooks_online' })} onNext={vi.fn()} />);
    const big = new File(['x'], 'Export data.zip');
    Object.defineProperty(big, 'size', { value: 383 * 1024 * 1024 });
    const small = new File(['y'], 'Account List.xlsx');
    choose([big, small]);
    await waitFor(() => expect(uploadLargeFile).toHaveBeenCalledWith('b1', big, expect.anything()));
    expect(uploadMigrationFiles).toHaveBeenCalledWith('b1', [small]);
  });

  it('pauses on failure, says why, and resumes the same file', async () => {
    vi.mocked(uploadLargeFile)
      .mockRejectedValueOnce(Object.assign(new Error('Piece 3 was damaged on the way. Send it again.'), { code: 'MIGRATION_UPLOAD_PART_CORRUPT' }))
      .mockReturnValueOnce(new Promise(() => undefined));
    wrap(<UploadStep batch={batch()} onNext={vi.fn()} />);
    const backup = new File(['x'], 'FAROOQ.ptb');
    choose([backup]);
    await screen.findByText(/damaged on the way/);
    fireEvent.click(screen.getByRole('button', { name: /Resume/ }));
    expect(uploadLargeFile).toHaveBeenCalledTimes(2);
    expect(vi.mocked(uploadLargeFile).mock.calls[1][1]).toBe(backup);
  });

  it('shows the server reading the backup, stage by stage', () => {
    wrap(<UploadStep batch={batch({ uploads: [up({ status: 'reading', progress: { stage: 'reading', detail: 'JrnlRow', done: 48, total: 100 } })] })} onNext={vi.fn()} />);
    expect(screen.getByText(/Reading your Peachtree backup/)).toBeTruthy();
    expect(screen.getByText(/Reading Peachtree's books — JrnlRow, 48%/)).toBeTruthy();
  });

  it('says why a backup could not be read', () => {
    wrap(<UploadStep batch={batch({ uploads: [up({ status: 'failed', errorCode: 'MIGRATION_PTB_TABLE_MISSING', error: 'JRNLROW.DAT is missing.' })] })} onNext={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('JRNLROW.DAT is missing.');
  });

  it('offers to continue, or discard, an upload that was interrupted', async () => {
    wrap(<UploadStep batch={batch({ uploads: [up({ status: 'receiving' })] })} onNext={vi.fn()} />);
    expect(screen.getByText(/did not finish uploading/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discard it' }));
    await waitFor(() => expect(cancelLargeUpload).toHaveBeenCalledWith('b1', 'u1'));
  });

  it("lists what Peachtree must provide, ticking off what has arrived", () => {
    wrap(
      <UploadStep
        batch={batch({
          files: [
            { id: 'f1', originalName: 'FAROOQ.ptb', sizeBytes: 253_618_655, kind: 'ptb', detected: [], createdAt: '' },
            { id: 'f2', originalName: 'TB.xlsx', sizeBytes: 9000, kind: 'xlsx', detected: [{ sheet: 'TB', target: 'peachtree:trial_balance', confidence: 1, rows: 90, headers: [] }], createdAt: '' },
          ],
        })}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByText('From Peachtree / Sage 50 US')).toBeTruthy();
    expect(screen.getAllByLabelText('received')).toHaveLength(2);
    expect(screen.getAllByLabelText('not yet')).toHaveLength(3);
    expect(screen.getAllByRole('link', { name: 'How to export it' })[0].getAttribute('href')).toBe('/settings/migration/guide/peachtree#file-ar');
    expect(screen.getByText('TB → Peachtree / Sage 50 Trial balance · 90 rows')).toBeTruthy();
    expect(screen.getByText('2026-10-05')).toBeTruthy();
  });
});
