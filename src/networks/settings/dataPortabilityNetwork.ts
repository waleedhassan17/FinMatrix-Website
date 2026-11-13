// ═══ FinMatrix Web — Company backup network (owner only) ═══
//
//   POST /data-portability/exports         { includeXlsx } → { id, status: 'queued' }
//   GET  /data-portability/exports         newest first
//   GET  /data-portability/exports/:id     one, with `error` when it failed
//
// A ready export carries a signed `downloadUrl`. The link is its own
// authorisation (no bearer header), so it is opened as a plain link — the
// browser streams a large ZIP to disk instead of holding it in memory.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import type { CompanyExport } from '@/models/dataPortability';

export async function createExport(includeXlsx: boolean): Promise<{ id: string; status: string }> {
  try {
    return unwrapEnvelope(await api.post('/data-portability/exports', { includeXlsx }).then((r) => r.data));
  } catch (e) {
    throw toApiError(e);
  }
}

export async function listExports(): Promise<CompanyExport[]> {
  try {
    const data = unwrapEnvelope<CompanyExport[]>(await api.get('/data-portability/exports').then((r) => r.data));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    throw toApiError(e);
  }
}

export async function getExport(id: string): Promise<CompanyExport> {
  try {
    return unwrapEnvelope<CompanyExport>(await api.get(`/data-portability/exports/${id}`).then((r) => r.data));
  } catch (e) {
    throw toApiError(e);
  }
}

/** Start the browser's own download of a ready backup. */
export function downloadExport(e: Pick<CompanyExport, 'downloadUrl' | 'fileName'>): boolean {
  if (!e.downloadUrl) return false;
  const link = document.createElement('a');
  link.href = e.downloadUrl;
  link.download = e.fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}
