import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/networks/network/apiHelpers', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  authedBlob: vi.fn(async () => new Blob(['pdf'])),
  postMultipart: vi.fn(),
  toApiError: vi.fn((e: unknown) => e),
  unwrapEnvelope: (r: unknown) => (r && typeof r === 'object' && 'data' in r ? (r as { data: unknown }).data : r),
}));
vi.mock('@/features/pdf/renderPdf', () => ({ downloadBlob: vi.fn() }));

import { downloadBlob } from '@/features/pdf/renderPdf';
import { api, authedBlob, postMultipart } from '@/networks/network/apiHelpers';
import {
  commitMigration,
  createMigration,
  downloadCertificate,
  listIssues,
  patchMappings,
  resolveIssue,
  rollbackMigration,
  uploadMigrationFiles,
  validateMigration,
} from '@/networks/settings/migrationNetwork';
import { createExport, listExports } from '@/networks/settings/dataPortabilityNetwork';

const ok = (data: unknown) => ({ data: { success: true, data } });

describe('migrationNetwork', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a batch with the source and cutover date', async () => {
    vi.mocked(api.post).mockResolvedValue(ok({ id: 'b1', status: 'draft' }));
    const b = await createMigration({ sourceSystem: 'tally', cutoverDate: '2026-06-30' });
    expect(api.post).toHaveBeenCalledWith('/migrations', { sourceSystem: 'tally', cutoverDate: '2026-06-30' });
    expect(b).toEqual({ id: 'b1', status: 'draft' });
  });

  it('uploads every file under the `files` field in one request', async () => {
    vi.mocked(postMultipart).mockResolvedValue({ id: 'b1', status: 'mapped' });
    const a = new File(['x'], 'books.xlsx');
    const c = new File(['y'], 'tally.xml');
    await uploadMigrationFiles('b1', [a, c]);
    const [path, form] = vi.mocked(postMultipart).mock.calls[0];
    expect(path).toBe('/migrations/b1/files');
    expect((form as FormData).getAll('files').map((f) => (f as File).name)).toEqual(['books.xlsx', 'tally.xml']);
  });

  it('sends mapping decisions, issue answers and every state change to its route', async () => {
    vi.mocked(api.patch).mockResolvedValue(ok({}));
    vi.mocked(api.post).mockResolvedValue(ok({}));
    vi.mocked(api.get).mockResolvedValue(ok({ groups: [], items: [] }));
    await patchMappings('b1', [{ kind: 'column', sheet: 'S', source: 'Mobile', target: 'phone' }]);
    expect(api.patch).toHaveBeenCalledWith('/migrations/b1/mappings', { mappings: [{ kind: 'column', sheet: 'S', source: 'Mobile', target: 'phone' }] });
    await resolveIssue('b1', 'i1', { action: 'skip', reason: 'Typed twice' });
    expect(api.patch).toHaveBeenCalledWith('/migrations/b1/issues/i1', { action: 'skip', reason: 'Typed twice' });
    await listIssues('b1', { limit: 200 });
    expect(api.get).toHaveBeenCalledWith('/migrations/b1/issues', { params: { limit: 200 } });
    await validateMigration('b1');
    await commitMigration('b1');
    await rollbackMigration('b1');
    expect(vi.mocked(api.post).mock.calls.map((c) => c[0])).toEqual(['/migrations/b1/validate', '/migrations/b1/commit', '/migrations/b1/rollback']);
  });

  it('downloads the certificate with the session and a long timeout', async () => {
    await downloadCertificate('12345678-aaaa');
    expect(authedBlob).toHaveBeenCalledWith('/migrations/12345678-aaaa/certificate', { timeout: 180_000 });
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'migration-certificate-12345678.pdf');
  });

  it('rethrows API errors with their code for the pages to explain', async () => {
    const err = Object.assign(new Error('Books not empty'), { code: 'MIGRATION_REQUIRES_EMPTY_BOOKS' });
    vi.mocked(api.post).mockRejectedValue(err);
    await expect(createMigration({ sourceSystem: 'tally', cutoverDate: '2026-06-30' })).rejects.toMatchObject({ code: 'MIGRATION_REQUIRES_EMPTY_BOOKS' });
  });
});

describe('dataPortabilityNetwork', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts a backup with the workbook option and lists newest first as returned', async () => {
    vi.mocked(api.post).mockResolvedValue(ok({ id: 'e1', status: 'queued' }));
    await createExport(true);
    expect(api.post).toHaveBeenCalledWith('/data-portability/exports', { includeXlsx: true });
    vi.mocked(api.get).mockResolvedValue(ok([{ id: 'e2' }, { id: 'e1' }]));
    expect((await listExports()).map((e) => e.id)).toEqual(['e2', 'e1']);
    vi.mocked(api.get).mockResolvedValue(ok(null));
    expect(await listExports()).toEqual([]);
  });
});
