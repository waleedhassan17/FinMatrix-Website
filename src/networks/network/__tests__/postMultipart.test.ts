import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// postMultipart talks to fetch directly, so it has no axios interceptor: an
// access token that expired while someone sat on an import preview used to
// sign them out on the spot. It now refreshes once and retries — and only a
// refresh that fails ends the session.

vi.mock('@/utils/storage', () => ({
  clearTokens: vi.fn(),
  getAccessToken: vi.fn(),
  getRefreshToken: vi.fn(() => 'refresh-1'),
  getStoredCompanyId: vi.fn(() => 'co-1'),
  setStoredCompanyId: vi.fn(),
  setTokens: vi.fn(),
}));
vi.mock('@/utils/authEvents', () => ({
  emitCompanyStatusStale: vi.fn(),
  emitSessionExpired: vi.fn(),
  isIntentionalSignOut: vi.fn(() => false),
}));

import { ApiError, postMultipart } from '@/networks/network/apiHelpers';
import { emitSessionExpired } from '@/utils/authEvents';
import { clearTokens, getAccessToken, setTokens } from '@/utils/storage';

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(getAccessToken).mockReturnValueOnce('old').mockReturnValue('new');
});
afterEach(() => vi.unstubAllGlobals());

describe('postMultipart', () => {
  it('refreshes an expired token once and retries with the new one', async () => {
    fetchMock.mockResolvedValueOnce(respond(401, {})).mockResolvedValueOnce(respond(201, { success: true, data: { id: 'x' } }));
    const refresh = vi.spyOn(axios, 'post').mockResolvedValueOnce({ data: { data: { accessToken: 'new', refreshToken: 'r2' } } });

    await expect(postMultipart('/inventory/import/preview', new FormData())).resolves.toEqual({ id: 'x' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setTokens).toHaveBeenCalledWith('new', 'r2');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
    expect(emitSessionExpired).not.toHaveBeenCalled();
  });

  it('ends the session only when the refresh itself fails', async () => {
    fetchMock.mockResolvedValueOnce(respond(401, { error: { message: 'Expired' } }));
    vi.spyOn(axios, 'post').mockRejectedValueOnce(new Error('revoked'));

    await expect(postMultipart('/inventory/items/i1/image', new FormData())).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(clearTokens).toHaveBeenCalled();
    expect(emitSessionExpired).toHaveBeenCalled();
  });

  it('sends extra headers and keeps the server code on a refusal', async () => {
    fetchMock.mockResolvedValueOnce(
      respond(409, { success: false, error: { code: 'IMPORT_PREVIEW_STALE', message: 'Review the preview again' } }),
    );
    const err = await postMultipart('/inventory/import', new FormData(), {
      headers: { 'Idempotency-Key': 'k1' },
    }).catch((e: unknown) => e);
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe('k1');
    expect(fetchMock.mock.calls[0][1].headers['x-company-id']).toBe('co-1');
    expect(err).toMatchObject({ code: 'IMPORT_PREVIEW_STALE', status: 409, message: 'Review the preview again' });
  });
});
