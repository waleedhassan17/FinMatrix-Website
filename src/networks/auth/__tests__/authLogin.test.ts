import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/networks/network/apiHelpers', () => ({
  api: { post: vi.fn(), get: vi.fn() },
  clearTokens: vi.fn(),
  setTokens: vi.fn(),
  setStoredCompanyId: vi.fn(),
  extractErrorMessage: vi.fn(() => 'Request failed'),
  toApiError: vi.fn((e: unknown) => e),
  unwrapEnvelope: (r: unknown) =>
    r && typeof r === 'object' && 'data' in r ? (r as { data: unknown }).data : r,
}));

import { portalMismatch } from '@/features/auth/portalAccess';
import { AuthError, authLogin } from '@/networks/auth/authNetwork';
import {
  api,
  clearTokens,
  setStoredCompanyId,
  setTokens,
} from '@/networks/network/apiHelpers';

const post = vi.mocked(api.post);

const okResponse = (role: string) => ({
  data: {
    success: true,
    data: {
      user: { id: 'u1', email: 'owner@x.z', username: null, displayName: 'Owner', role },
      tokens: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 },
      companyId: 'c1',
      company: { id: 'c1', name: 'Acme', status: 'approved' },
      companyStatus: 'active',
      companyType: 'warehouse',
      features: null,
    },
  },
});

describe('authLogin portal enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tells the server which door is being used', async () => {
    post.mockResolvedValueOnce(okResponse('staff'));
    await authLogin({ identifier: ' verify.staff ', password: 'pw', portal: 'staff' });
    expect(post).toHaveBeenCalledWith('/auth/signin', {
      identifier: 'verify.staff',
      email: 'verify.staff',
      password: 'pw',
      portal: 'staff',
    });
  });

  it('returns the session when the account belongs on this door', async () => {
    post.mockResolvedValueOnce(okResponse('admin'));
    const result = await authLogin({ identifier: 'owner@x.z', password: 'pw', portal: 'admin' });
    expect(result.user.role).toBe('admin');
    expect(setStoredCompanyId).toHaveBeenCalledWith('c1');
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it('turns the server’s WRONG_PORTAL into a clear error naming the account type', async () => {
    post.mockRejectedValueOnce({
      response: {
        status: 403,
        data: {
          success: false,
          error: {
            code: 'WRONG_PORTAL',
            message: 'server wording',
            details: { accountType: 'admin', portal: 'staff' },
          },
        },
      },
    });

    const error = await authLogin({
      identifier: 'owner@x.z',
      password: 'pw',
      portal: 'staff',
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AuthError);
    expect(error).toMatchObject({
      code: 'WRONG_PORTAL',
      accountType: 'admin',
      message: portalMismatch('admin').message,
    });
    expect(setTokens).not.toHaveBeenCalled();
  });

  it('refuses and revokes a session the server let through on the wrong door', async () => {
    // A server without the portal check signs the owner in anyway.
    post.mockResolvedValueOnce(okResponse('admin'));
    post.mockResolvedValueOnce({ data: { success: true } }); // /auth/signout

    const error = await authLogin({
      identifier: 'owner@x.z',
      password: 'pw',
      portal: 'staff',
    }).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'WRONG_PORTAL', accountType: 'admin' });
    expect(post).toHaveBeenLastCalledWith('/auth/signout');
    expect(clearTokens).toHaveBeenCalled();
    expect(setStoredCompanyId).not.toHaveBeenCalled();
  });

  it('refuses a platform administrator on the web owner door', async () => {
    post.mockResolvedValueOnce(okResponse('super_admin'));
    post.mockResolvedValueOnce({ data: { success: true } });

    await expect(
      authLogin({ identifier: 'root@x.z', password: 'pw', portal: 'admin' }),
    ).rejects.toMatchObject({ code: 'WRONG_PORTAL', accountType: 'super_admin' });
    expect(clearTokens).toHaveBeenCalled();
  });
});
