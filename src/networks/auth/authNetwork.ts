// ═══════════════════════════════════════════════════════
// FinMatrix Web — Auth Network
// ═══════════════════════════════════════════════════════
// Ported from the app's src/networks/auth/authNetwork.ts, trimmed to the
// admin + staff paths. The rider sign-in and the company-creation /
// super-admin flows are deliberately absent: this console does not host them.

import {
  api,
  clearTokens,
  extractErrorMessage,
  setStoredCompanyId,
  setTokens,
  toApiError,
  unwrapEnvelope,
} from '@/networks/network/apiHelpers';
import {
  companiesSerializer,
  identitySerializer,
  type CompanyMembership,
  type RawAuthPayload,
} from '@/serializers/authSerializer';
import {
  isRoleAllowedOnWebPortal,
  portalMismatch,
} from '@/features/auth/portalAccess';
import type { Identity } from '@/store/authSlice';
import type { TokenPair, UserRole } from '@/types';
import type { PortalRole } from '@/utils/storage';

/**
 * An auth failure carrying the server's code.
 *
 * The code is the ONLY thing to branch on. The backend's exception filter
 * copies just `code`, `message` and `details` off a thrown error — every other
 * key is dropped, so `companyStatus`, `rejectionReason` and `email` never
 * arrive even though the auth service throws them. The optional fields below
 * are populated when present and are null in practice against the current
 * server; they are kept because reading them costs nothing and a filter change
 * would make them useful again.
 */
export class AuthError extends Error {
  code?: string;
  email?: string;
  companyStatus?: string | null;
  rejectionReason?: string | null;
  /** WRONG_PORTAL only: the role of the account that was refused. */
  accountType?: UserRole | null;

  constructor(
    message: string,
    code?: string,
    email?: string,
    extra?: {
      companyStatus?: string | null;
      rejectionReason?: string | null;
      accountType?: UserRole | null;
    },
  ) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.email = email;
    this.companyStatus = extra?.companyStatus ?? null;
    this.rejectionReason = extra?.rejectionReason ?? null;
    this.accountType = extra?.accountType ?? null;
  }
}

/**
 * Codes that stop sign-in outright.
 *
 * Note what is NOT here: `draft` and `inactive` companies sign in fine and
 * receive a real token, so the client can reach onboarding or the renewal
 * flow. CompanyGuard then 403s every business route with COMPANY_NOT_ACTIVE.
 * That 403, not a login failure, is what routes them to the gate screen.
 */
const LOGIN_GATE_CODES = [
  'COMPANY_PENDING',
  'COMPANY_INACTIVE',
  'COMPANY_REJECTED',
];

interface RawErrorBody {
  error?: {
    code?: string;
    message?: string;
    email?: string;
    companyStatus?: string | null;
    rejectionReason?: string | null;
    details?: { accountType?: string; portal?: string };
  };
  code?: string;
  email?: string;
}

const USER_ROLES: readonly UserRole[] = ['admin', 'staff', 'delivery', 'super_admin'];
const asUserRole = (v: unknown): UserRole | null =>
  USER_ROLES.includes(v as UserRole) ? (v as UserRole) : null;

/** Re-throw an auth failure with its gate code intact. */
function asAuthError(e: unknown): never {
  const body = (e as { response?: { data?: RawErrorBody } })?.response?.data;
  const err = body?.error ?? body ?? {};
  const code = ('code' in err ? err.code : undefined) ?? body?.code;
  const email = ('email' in err ? err.email : undefined) ?? body?.email;

  if (code === 'EMAIL_NOT_VERIFIED') {
    throw new AuthError(
      'Please verify your email before signing in.',
      'EMAIL_NOT_VERIFIED',
      email,
    );
  }

  if (code === 'WRONG_PORTAL') {
    const accountType = asUserRole('details' in err ? err.details?.accountType : undefined);
    throw new AuthError(
      accountType
        ? portalMismatch(accountType).message
        : (('message' in err ? err.message : undefined) ?? 'This account cannot sign in here.'),
      'WRONG_PORTAL',
      undefined,
      { accountType },
    );
  }

  if (code && LOGIN_GATE_CODES.includes(code)) {
    throw new AuthError(
      ('message' in err ? err.message : undefined) ??
        'Sign in is not available yet.',
      code,
      email,
      {
        companyStatus:
          ('companyStatus' in err ? err.companyStatus : undefined) ?? null,
        rejectionReason:
          ('rejectionReason' in err ? err.rejectionReason : undefined) ?? null,
      },
    );
  }

  throw new AuthError(extractErrorMessage(e), code, email);
}

// ─── Sign in ────────────────────────────────────────
export interface SignInPayload {
  /** Email OR username — owner-created staff accounts have no inbox. */
  identifier: string;
  password: string;
  /** The door being used. Only accounts of that kind may sign in through it. */
  portal: PortalRole;
}

interface SignInResponse extends Identity {
  tokens: TokenPair;
}

/**
 * Sign in through one door and persist the session.
 *
 * `identifier` accepts a username or an email; `email` is sent alongside it so
 * a server predating username login keeps working. `portal` names the door: the
 * server refuses an account that belongs on another one (WRONG_PORTAL) before
 * issuing a token, so the owner's email on the team member door is an error,
 * not the owner dashboard. The server still decides the role; the portal only
 * decides whether that role may come in this way.
 */
export const authLogin = async ({
  identifier,
  password,
  portal,
}: SignInPayload): Promise<SignInResponse> => {
  try {
    const trimmed = identifier.trim();
    const response = await api.post('/auth/signin', {
      identifier: trimmed,
      email: trimmed,
      password,
      portal,
    });

    const data = unwrapEnvelope<RawAuthPayload & { tokens?: TokenPair }>(
      response.data,
    );
    const tokens = data?.tokens;
    if (!tokens?.accessToken) {
      throw new AuthError(
        'Signed in, but the server returned no token. Please try again.',
      );
    }

    setTokens(tokens.accessToken, tokens.refreshToken);

    const identity = identitySerializer(data);

    // The server enforces the portal, but the web is stricter than it has to
    // be — no platform console and no rider app live here — and a server that
    // predates the check would let any role through. Either way the session it
    // just issued is revoked and nothing reaches the store.
    if (!isRoleAllowedOnWebPortal(portal, identity.user.role)) {
      await authSignOut();
      clearTokens();
      throw new AuthError(portalMismatch(identity.user.role).message, 'WRONG_PORTAL', undefined, {
        accountType: identity.user.role,
      });
    }

    if (identity.companyId) {
      setStoredCompanyId(identity.companyId);
    }

    return { ...identity, tokens };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    asAuthError(e);
  }
};

// ─── Registration ───────────────────────────────────

export interface RegisterPayload {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
}

/**
 * Create an OWNER account.
 *
 * `role: 'admin'` is hardcoded and not a parameter, because the only other value
 * the server will take here is 'delivery' — it REFUSES 'staff' outright. Staff
 * accounts exist only because an owner created one through
 * POST /settings/users, which is also the only place a staff password is reset.
 * Self-signup is therefore an owner-shaped act by definition, and making the role
 * configurable would invite a caller to try the one value that 400s.
 *
 * Returns nothing useful: the server issues no token here. The account must
 * verify its email first, so the caller's next stop is /verify-email.
 */
export const authRegister = async ({
  email,
  password,
  displayName,
  phone,
}: RegisterPayload): Promise<void> => {
  try {
    const trimmedPhone = phone?.trim();
    await api.post('/auth/signup', {
      email: email.trim(),
      password,
      displayName: displayName.trim(),
      role: 'admin',
      // Omitted entirely when blank: '' fails the server's @IsOptional check,
      // which is how the app learned to strip it rather than send an empty one.
      ...(trimmedPhone ? { phone: trimmedPhone } : {}),
    });
  } catch (e) {
    asAuthError(e);
  }
};

// ─── Session ────────────────────────────────────────
export interface MeResponse extends Identity {
  companies: CompanyMembership[];
}

/**
 * Re-hydrate the session. Called on boot, and again whenever a 403
 * COMPANY_NOT_ACTIVE says our cached companyStatus has gone stale.
 *
 * This is also the only way to learn that a role changed mid-session:
 * /auth/refresh-token returns tokens alone and carries the OLD token's role
 * and companyId forward, so a refresh will never tell us.
 */
export const authMe = async (): Promise<MeResponse> => {
  try {
    const response = await api.get('/auth/me');
    const data = unwrapEnvelope<RawAuthPayload & { companies?: unknown }>(
      response.data,
    );
    const identity = identitySerializer(data);
    if (identity.companyId) {
      setStoredCompanyId(identity.companyId);
    }
    return { ...identity, companies: companiesSerializer(data?.companies) };
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Sign out. Best-effort by design: the local session is cleared whatever the
 * server says, because a user who clicked "sign out" must end up signed out
 * even if the network is down.
 */
export const authSignOut = async (): Promise<void> => {
  try {
    await api.post('/auth/signout');
  } catch {
    /* the local clear below is what actually matters */
  } finally {
    clearTokens();
  }
};

// ─── Password reset ─────────────────────────────────
// Three steps: request an OTP, exchange it for a reset token, then set the
// password. The OTP allows 5 attempts before the server locks it (OTP_LOCKED).

export const authForgotPassword = async (email: string): Promise<void> => {
  try {
    await api.post('/auth/forgot-password', { email: email.trim() });
  } catch (e) {
    throw toApiError(e);
  }
};

export const authVerifyOtp = async (
  email: string,
  otp: string,
): Promise<{ resetToken: string }> => {
  try {
    const response = await api.post('/auth/verify-otp', {
      email: email.trim(),
      otp,
    });
    return unwrapEnvelope<{ resetToken: string }>(response.data);
  } catch (e) {
    throw toApiError(e);
  }
};

export const authResetPassword = async (params: {
  email: string;
  resetToken: string;
  password: string;
}): Promise<void> => {
  try {
    await api.post('/auth/reset-password', {
      email: params.email.trim(),
      resetToken: params.resetToken,
      password: params.password,
    });
  } catch (e) {
    throw toApiError(e);
  }
};

// ─── Email verification ─────────────────────────────
export const authVerifyEmail = async (token: string): Promise<void> => {
  try {
    await api.post('/auth/verify-email', { token });
  } catch (e) {
    throw toApiError(e);
  }
};

export const authResendVerification = async (email: string): Promise<void> => {
  try {
    await api.post('/auth/resend-verification', { email: email.trim() });
  } catch (e) {
    throw toApiError(e);
  }
};
