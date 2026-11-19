import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/networks/network/apiHelpers', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  toApiError: vi.fn((e: unknown) => e),
  unwrapEnvelope: (r: unknown) => (r && typeof r === 'object' && 'data' in r ? (r as { data: unknown }).data : r),
}));

import { api } from '@/networks/network/apiHelpers';
import { cancelLargeUpload, sha256Hex, uploadLargeFile, type LargeUpload } from '@/networks/settings/migrationLargeUpload';

const ok = (data: unknown) => ({ data: { success: true, data } });
const fail = (code: string | undefined, status?: number) => Object.assign(new Error(code ?? 'network'), { code, status });

/** A 20-byte "backup" in 8-byte pieces: 8, 8, 4. */
const bytes = Uint8Array.from({ length: 20 }, (_, i) => i + 1);
const file = new File([bytes], 'company.ptb');
const upload = (over: Partial<LargeUpload> = {}): LargeUpload => ({
  id: 'u1',
  batchId: 'b1',
  name: 'company.ptb',
  size: 20,
  partSize: 8,
  parts: 3,
  status: 'receiving',
  received: [],
  progress: null,
  errorCode: null,
  error: null,
  fileId: null,
  ...over,
});
const putCalls = () => vi.mocked(api.put).mock.calls.map((c) => ({ url: c[0] as string, body: new Uint8Array(c[1] as ArrayBuffer), headers: (c[2] as { headers: Record<string, string> }).headers }));
const noWait = { backoffMs: () => 0 };

describe('uploadLargeFile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends each piece once, sliced from the file, with its SHA-256, then completes', async () => {
    vi.mocked(api.post).mockResolvedValueOnce(ok(upload())).mockResolvedValueOnce(ok(upload({ status: 'received' })));
    vi.mocked(api.put).mockResolvedValue(ok({ received: true }));
    const progress: number[] = [];
    const r = await uploadLargeFile('b1', file, { ...noWait, onProgress: (p) => progress.push(p.sent) });
    expect(api.post).toHaveBeenNthCalledWith(1, '/migrations/b1/uploads', { name: 'company.ptb', size: 20 });
    const calls = putCalls().sort((a, b) => a.url.localeCompare(b.url));
    expect(calls.map((c) => c.url)).toEqual(['/migrations/b1/uploads/u1/parts/0', '/migrations/b1/uploads/u1/parts/1', '/migrations/b1/uploads/u1/parts/2']);
    expect(calls.map((c) => Array.from(c.body))).toEqual([Array.from(bytes.slice(0, 8)), Array.from(bytes.slice(8, 16)), Array.from(bytes.slice(16))]);
    for (const c of calls) {
      expect(c.headers['Content-Type']).toBe('application/octet-stream');
      // sha256Hex is itself checked against the standard vector below.
      expect(c.headers['x-part-sha256']).toBe(await sha256Hex(c.body.slice().buffer));
    }
    expect(api.post).toHaveBeenNthCalledWith(2, '/migrations/b1/uploads/u1/complete');
    expect(r.status).toBe('received');
    expect(progress.at(-1)).toBe(20);
  });

  it('resumes: sends only the pieces the server does not hold', async () => {
    vi.mocked(api.post).mockResolvedValueOnce(ok(upload({ received: [0, 2] }))).mockResolvedValueOnce(ok(upload({ status: 'received' })));
    vi.mocked(api.put).mockResolvedValue(ok({ received: true }));
    const progress: number[] = [];
    await uploadLargeFile('b1', file, { ...noWait, onProgress: (p) => progress.push(p.sent) });
    expect(putCalls().map((c) => c.url)).toEqual(['/migrations/b1/uploads/u1/parts/1']);
    expect(progress[0]).toBe(12); // pieces 0 (8) and 2 (4) already there
  });

  it('repeats a piece that failed on the way, then carries on', async () => {
    vi.mocked(api.post).mockResolvedValueOnce(ok(upload({ received: [0, 1] }))).mockResolvedValueOnce(ok(upload({ status: 'received' })));
    vi.mocked(api.put)
      .mockRejectedValueOnce(fail(undefined))
      .mockRejectedValueOnce(fail('MIGRATION_UPLOAD_PART_CORRUPT', 400))
      .mockResolvedValue(ok({ received: true }));
    await uploadLargeFile('b1', file, noWait);
    expect(api.put).toHaveBeenCalledTimes(3);
    expect(api.post).toHaveBeenLastCalledWith('/migrations/b1/uploads/u1/complete');
  });

  it('gives up on a piece after its retries, without completing', async () => {
    vi.mocked(api.post).mockResolvedValueOnce(ok(upload({ received: [0, 1] })));
    vi.mocked(api.put).mockRejectedValue(fail(undefined, 503));
    await expect(uploadLargeFile('b1', file, { ...noWait, retries: 2 })).rejects.toMatchObject({ status: 503 });
    expect(api.put).toHaveBeenCalledTimes(3);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('stops at once on an answer a repeat cannot change', async () => {
    vi.mocked(api.post).mockResolvedValueOnce(ok(upload({ received: [0, 1] })));
    vi.mocked(api.put).mockRejectedValue(fail('MIGRATION_INVALID_TRANSITION', 409));
    await expect(uploadLargeFile('b1', file, noWait)).rejects.toMatchObject({ code: 'MIGRATION_INVALID_TRANSITION' });
    expect(api.put).toHaveBeenCalledTimes(1);
  });

  it('pauses when aborted, and does not complete', async () => {
    const controller = new AbortController();
    vi.mocked(api.post).mockResolvedValueOnce(ok(upload()));
    vi.mocked(api.put).mockImplementation(async () => {
      controller.abort();
      throw Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' });
    });
    await expect(uploadLargeFile('b1', file, { ...noWait, signal: controller.signal, concurrency: 1 })).rejects.toMatchObject({ name: 'AbortError' });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('sends again what the server says is missing when completing, once', async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce(ok(upload({ received: [0, 1, 2] })))
      .mockRejectedValueOnce(fail('MIGRATION_UPLOAD_INCOMPLETE', 400))
      .mockResolvedValueOnce(ok(upload({ status: 'received' })));
    vi.mocked(api.get).mockResolvedValueOnce(ok(upload({ received: [0, 2] })));
    vi.mocked(api.put).mockResolvedValue(ok({ received: true }));
    const r = await uploadLargeFile('b1', file, noWait);
    expect(putCalls().map((c) => c.url)).toEqual(['/migrations/b1/uploads/u1/parts/1']);
    expect(r.status).toBe('received');
  });

  it('an upload already complete is not sent again', async () => {
    vi.mocked(api.post).mockResolvedValueOnce(ok(upload({ status: 'reading' })));
    const r = await uploadLargeFile('b1', file, noWait);
    expect(api.put).not.toHaveBeenCalled();
    expect(r.status).toBe('reading');
  });

  it('cancel deletes the upload', async () => {
    vi.mocked(api.delete).mockResolvedValue(ok({ id: 'u1', cancelled: true }));
    await cancelLargeUpload('b1', 'u1');
    expect(api.delete).toHaveBeenCalledWith('/migrations/b1/uploads/u1');
  });
});

describe('sha256Hex', () => {
  it('matches the standard SHA-256', async () => {
    const data = new TextEncoder().encode('abc');
    expect(await sha256Hex(data.buffer as ArrayBuffer)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
