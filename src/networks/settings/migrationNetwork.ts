// ═══ FinMatrix Web — Migration Center network (owner only) ═══
//
//   POST   /migrations                          { sourceSystem, cutoverDate }
//   GET    /migrations · /migrations/:id
//   GET    /migrations/template                 starter workbook (XLSX)
//   POST   /migrations/:id/files                multipart `files` (many; ZIP allowed)
//   DELETE /migrations/:id/files/:fileId
//   GET    /migrations/:id/mappings · PATCH { mappings: [...] }
//   GET    /migrations/:id/issues · PATCH /issues/:issueId { action, value?, reason? }
//   POST   /migrations/:id/validate · /dry-run · /sign-off · /commit · /rollback · /close
//   GET    /migrations/:id/certificate          PDF
//
// Errors carry the server's `code`; the pages turn it into a sentence with
// migrationErrorMessage().

import { downloadBlob } from '@/features/pdf/renderPdf';
import { api, authedBlob, postMultipart, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import type { CertificatePreview, IssuePage, MappingsView, MigrationBatch } from '@/models/migration';

const call = async <T>(fn: () => Promise<{ data: unknown }>): Promise<T> => {
  try {
    return unwrapEnvelope<T>((await fn()).data);
  } catch (e) {
    throw toApiError(e);
  }
};

export const listMigrations = () => call<MigrationBatch[]>(() => api.get('/migrations'));
export const getMigration = (id: string) => call<MigrationBatch>(() => api.get(`/migrations/${id}`));
export const createMigration = (body: { sourceSystem: string; cutoverDate: string }) => call<MigrationBatch>(() => api.post('/migrations', body));

export async function uploadMigrationFiles(id: string, files: File[]): Promise<MigrationBatch> {
  const form = new FormData();
  for (const f of files) form.append('files', f, f.name);
  return postMultipart<MigrationBatch>(`/migrations/${id}/files`, form);
}

export const removeMigrationFile = (id: string, fileId: string) => call<MigrationBatch>(() => api.delete(`/migrations/${id}/files/${fileId}`));
export const getMappings = (id: string) => call<MappingsView>(() => api.get(`/migrations/${id}/mappings`));
export const patchMappings = (id: string, mappings: Array<{ kind: string; sheet?: string; source: string; target: string | null }>) =>
  call<MigrationBatch>(() => api.patch(`/migrations/${id}/mappings`, { mappings }));

export const listIssues = (id: string, params: { code?: string; page?: number; limit?: number; state?: 'open' | 'resolved' | 'all' } = {}) =>
  call<IssuePage>(() => api.get(`/migrations/${id}/issues`, { params }));
export const resolveIssue = (id: string, issueId: string, body: { action: 'edit' | 'map' | 'skip'; value?: string; reason?: string; applyToAll?: boolean }) =>
  call<MigrationBatch>(() => api.patch(`/migrations/${id}/issues/${issueId}`, body));

export const validateMigration = (id: string) => call<MigrationBatch>(() => api.post(`/migrations/${id}/validate`));
export const dryRunMigration = (id: string) => call<{ batch: MigrationBatch; certificate: CertificatePreview }>(() => api.post(`/migrations/${id}/dry-run`));
export const signOffMigration = (id: string) => call<MigrationBatch>(() => api.post(`/migrations/${id}/sign-off`, { confirmed: true, spotCheckDone: true }));
export const commitMigration = (id: string) => call<{ batch: MigrationBatch; certificate: CertificatePreview }>(() => api.post(`/migrations/${id}/commit`));
export const rollbackMigration = (id: string) => call<{ batch: MigrationBatch; result: { reversed: number; removed: Record<string, number> } }>(() => api.post(`/migrations/${id}/rollback`));
export const closeMigration = (id: string) => call<MigrationBatch>(() => api.post(`/migrations/${id}/close`));

/** Long timeouts: the certificate preview runs the whole dry run on the server. */
export async function downloadCertificate(id: string): Promise<void> {
  const blob = await authedBlob(`/migrations/${id}/certificate`, { timeout: 180_000 });
  downloadBlob(blob, `migration-certificate-${id.slice(0, 8)}.pdf`);
}

export async function downloadStarterWorkbook(cutoverDate?: string): Promise<void> {
  const blob = await authedBlob(`/migrations/template${cutoverDate ? `?cutoverDate=${cutoverDate}` : ''}`);
  downloadBlob(blob, 'FinMatrix-Starter-Workbook.xlsx');
}
