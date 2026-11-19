// ═══ FinMatrix Web — large uploads: a Peachtree / Sage 50 backup, up to 2 GB ═══
//
//   POST   /migrations/:id/uploads                       { name, size } → the upload
//                                                        (the same name and size resume it)
//   PUT    /migrations/:id/uploads/:uploadId/parts/:n    raw bytes · x-part-sha256
//   POST   /migrations/:id/uploads/:uploadId/complete    → read in the background
//   GET    /migrations/:id/uploads/:uploadId             status, pieces held, reading progress
//   DELETE /migrations/:id/uploads/:uploadId             cancel
//
// The file is never read whole: each 8 MB piece is sliced from the File,
// hashed, and sent on its own (three at a time). A piece that fails is sent
// again, three times with a growing pause; a 401 is refreshed by the api
// client and only that piece is repeated. Stopped for any reason — closed
// tab, lost connection, Pause — choosing the same file again continues from
// the pieces the server already holds.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import type { MigrationUploadProgress } from '@/models/migration';

export interface LargeUpload {
  id: string;
  batchId: string;
  name: string;
  size: number;
  partSize: number;
  parts: number;
  status: 'receiving' | 'received' | 'reading' | 'read' | 'failed';
  /** Pieces the server holds (while receiving). */
  received: number[];
  progress: MigrationUploadProgress | null;
  errorCode: string | null;
  error: string | null;
  fileId: string | null;
}

export interface LargeUploadProgress {
  uploadId: string;
  /** Bytes the server has, plus bytes of pieces on their way. */
  sent: number;
  total: number;
  partsDone: number;
  parts: number;
}

export interface LargeUploadOptions {
  onProgress?: (p: LargeUploadProgress) => void;
  signal?: AbortSignal;
  /** Pieces in flight at once. */
  concurrency?: number;
  /** Further attempts per piece after the first. */
  retries?: number;
  /** Pause before attempt n (1-based); tests pass 0. */
  backoffMs?: (attempt: number) => number;
}

const base = (batchId: string) => `/migrations/${batchId}/uploads`;
/** A piece of up to 8 MB on a slow line: far longer than the default 30 s. */
const PART_TIMEOUT_MS = 180_000;

const call = async <T>(fn: () => Promise<{ data: unknown }>): Promise<T> => {
  try {
    return unwrapEnvelope<T>((await fn()).data);
  } catch (e) {
    throw toApiError(e);
  }
};

export const startLargeUpload = (batchId: string, file: { name: string; size: number }) =>
  call<LargeUpload>(() => api.post(base(batchId), { name: file.name, size: file.size }));
export const getLargeUpload = (batchId: string, uploadId: string) => call<LargeUpload>(() => api.get(`${base(batchId)}/${uploadId}`));
export const completeLargeUpload = (batchId: string, uploadId: string) => call<LargeUpload>(() => api.post(`${base(batchId)}/${uploadId}/complete`));
export const cancelLargeUpload = (batchId: string, uploadId: string) => call<{ id: string; cancelled: boolean }>(() => api.delete(`${base(batchId)}/${uploadId}`));

/** SHA-256 of a piece, hex; null where the browser offers no Web Crypto (plain http). */
export async function sha256Hex(data: ArrayBuffer): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Codes a repeat cannot fix: stop at once and say why. */
const FINAL_CODES = new Set(['MIGRATION_INVALID_TRANSITION', 'MIGRATION_FILE_TOO_LARGE', 'NOT_FOUND', 'FORBIDDEN', 'COMPANY_NOT_ACTIVE']);

function isFinal(e: unknown): boolean {
  const err = e as { code?: string; status?: number; statusCode?: number; name?: string };
  if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return true;
  if (err?.code && FINAL_CODES.has(err.code)) return true;
  const status = err?.status ?? err?.statusCode;
  // 4xx other than a damaged piece (400 PART_CORRUPT), a timeout or throttling is final.
  return typeof status === 'number' && status >= 400 && status < 500 && ![400, 408, 429].includes(status);
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(abortError());
      },
      { once: true },
    );
  });

function abortError(): Error {
  const e = new Error('The upload was paused.');
  e.name = 'AbortError';
  return e;
}

/**
 * Send `file` to the batch in pieces, resuming whatever the server already
 * holds, and mark it complete. Resolves with the upload, now `received`
 * (queued to be read) — or `reading`/`read` when it already was.
 */
export async function uploadLargeFile(batchId: string, file: File, opts: LargeUploadOptions = {}): Promise<LargeUpload> {
  const { signal, onProgress } = opts;
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const retries = Math.max(0, opts.retries ?? 3);
  const backoff = opts.backoffMs ?? ((n: number) => 1000 * 2 ** (n - 1) + Math.random() * 500);

  let upload = await startLargeUpload(batchId, file);
  if (upload.status !== 'receiving') return upload;

  const pieceSize = (n: number) => Math.min(upload.partSize, file.size - n * upload.partSize);
  const held = new Set(upload.received);
  const inFlight = new Map<number, number>();
  let doneBytes = [...held].reduce((t, n) => t + pieceSize(n), 0);
  const report = () =>
    onProgress?.({
      uploadId: upload.id,
      sent: doneBytes + [...inFlight.values()].reduce((t, v) => t + v, 0),
      total: file.size,
      partsDone: held.size,
      parts: upload.parts,
    });
  report();

  const sendPiece = async (n: number) => {
    const start = n * upload.partSize;
    const data = await file.slice(start, start + pieceSize(n)).arrayBuffer();
    const sha = await sha256Hex(data);
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw abortError();
      try {
        await api.put(`${base(batchId)}/${upload.id}/parts/${n}`, data, {
          headers: { 'Content-Type': 'application/octet-stream', ...(sha ? { 'x-part-sha256': sha } : {}) },
          timeout: PART_TIMEOUT_MS,
          signal,
          // The api client would otherwise JSON-encode the body.
          transformRequest: [(body: unknown) => body],
          onUploadProgress: (e) => {
            inFlight.set(n, Math.min(e.loaded ?? 0, data.byteLength));
            report();
          },
        });
        inFlight.delete(n);
        held.add(n);
        doneBytes += data.byteLength;
        report();
        return;
      } catch (e) {
        inFlight.delete(n);
        if (signal?.aborted) throw abortError();
        const err = toApiError(e);
        if (isFinal(err) || attempt >= retries) throw err;
        await sleep(backoff(attempt + 1), signal);
      }
    }
  };

  const runPieces = async (pieces: number[]) => {
    const queue = [...pieces];
    let failure: unknown = null;
    const worker = async () => {
      while (queue.length && !failure) {
        const n = queue.shift()!;
        try {
          await sendPiece(n);
        } catch (e) {
          failure ??= e;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
    if (failure) throw failure;
  };

  const missing = () => Array.from({ length: upload.parts }, (_, n) => n).filter((n) => !held.has(n));
  await runPieces(missing());
  try {
    return await completeLargeUpload(batchId, upload.id);
  } catch (e) {
    const err = e as { code?: string };
    if (err?.code !== 'MIGRATION_UPLOAD_INCOMPLETE') throw e;
    // The server is missing a piece it acknowledged (it should never be):
    // ask which, send those once more, and complete.
    upload = await getLargeUpload(batchId, upload.id);
    held.clear();
    upload.received.forEach((n) => held.add(n));
    doneBytes = [...held].reduce((t, n) => t + pieceSize(n), 0);
    await runPieces(missing());
    return completeLargeUpload(batchId, upload.id);
  }
}
