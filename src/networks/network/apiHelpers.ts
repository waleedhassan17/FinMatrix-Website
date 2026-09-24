// ═══════════════════════════════════════════════════════
// FinMatrix Web — API Infrastructure
// ═══════════════════════════════════════════════════════
// Ported from the app's src/networks/network/apiHelpers.ts. The refresh
// choreography, the error extractors and the ApiError class are kept
// behaviourally identical so both clients fail the same way.

import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getStoredCompanyId,
  setStoredCompanyId,
  setTokens,
} from '@/utils/storage';
import {
  emitCompanyStatusStale,
  emitSessionExpired,
  isIntentionalSignOut,
} from '@/utils/authEvents';

// ★ BACKEND BASE URL ★
// Production by default so a normal build is unchanged. Override to run
// against a backend you are still working on:
//
//   VITE_API_URL=http://localhost:3000/api/v1 npm run dev
//
export const API_BASE_URL =
  import.meta.env.VITE_API_URL?.trim() ||
  'https://finmatrix-api-prod-665c6b5cb6a1.herokuapp.com/api/v1';

// Re-exported so domain network files import everything from one module,
// matching the app's convention.
export {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getStoredCompanyId,
  setStoredCompanyId,
  setTokens,
};

// ─── Axios instance ─────────────────────────────────
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request interceptor ────────────────────────────
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // NOTE: this header does NOT scope the request. CompanyGuard reads
    // companyId from the JWT; x-company-id is honoured by exactly one route
    // (POST /companies/subscribe, where a fresh admin's token has no company
    // yet) and is otherwise only Sentry context and an idempotency partition
    // key. It is sent for parity with the app and for that one route — never
    // rely on it to switch company.
    const companyId = getStoredCompanyId();
    if (companyId) {
      config.headers['x-company-id'] = companyId;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ─── Response interceptor (401 refresh) ─────────────
// Single-flight: the first 401 refreshes, every concurrent 401 queues and is
// replayed with the new token. Without the queue, five parallel list requests
// would fire five refreshes, and since refresh ROTATES the token server-side,
// four of them would be rejected and log the user out.
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error || token === null) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
};

/**
 * Swap the refresh token for a new pair NOW, rather than on the next 401.
 *
 * The company a request acts on travels inside the token, and a new owner's
 * session is minted before their company exists — so it carries none. The
 * server fills it in on refresh; this asks for that refresh at the two moments
 * it matters (the company is created, the company is approved) instead of
 * leaving the owner on a dashboard where every request answers
 * NOT_COMPANY_MEMBER until the access token happens to expire.
 *
 * Shares the interceptor's single-flight lock: refresh rotates the token, so
 * two refreshes racing would revoke each other and sign the owner out. Returns
 * false rather than throwing — the caller's screen is still correct either
 * way, and the 401 path remains the backstop.
 */
export const refreshSessionTokens = async (): Promise<boolean> => {
  if (isRefreshing) {
    try {
      await new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      });
      return true;
    } catch {
      return false;
    }
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  isRefreshing = true;
  try {
    const { data } = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
      refreshToken,
    });
    const pair = (data?.data ?? data) as { accessToken?: string; refreshToken?: string };
    if (!pair?.accessToken || !pair.refreshToken) {
      processQueue(new Error('No token in refresh response'), null);
      return false;
    }
    setTokens(pair.accessToken, pair.refreshToken);
    processQueue(null, pair.accessToken);
    return true;
  } catch (e) {
    processQueue(e, null);
    return false;
  } finally {
    isRefreshing = false;
  }
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    const url = originalRequest?.url ?? '';
    // A 401 on an auth route IS the real error — never try to refresh past it.
    //
    // The public price list is here for a different reason: it is fetched by the
    // LANDING PAGE, by visitors who are not signed in. The request interceptor
    // still attaches whatever stale token is sitting in localStorage, so without
    // this a 401 there would start a refresh and, on failure, clearTokens() —
    // silently signing someone out for the crime of reading the homepage.
    const isAuthRoute =
      url.includes('/auth/signin') ||
      url.includes('/auth/signup') ||
      url.includes('/auth/refresh-token') ||
      url.includes('/super-admin/plans/public');

    // ── Company no longer active (server gate) ──────────────────────────
    // CompanyGuard 403s every business request once the company stops being
    // active — subscription lapsed (enforced live, ahead of the billing cron),
    // deactivated, or un-approved. Identity only learns companyStatus at
    // signin and cold start, so without this the user sits on dead screens.
    if (error.response?.status === 403) {
      if (extractErrorCode(error) === 'COMPANY_NOT_ACTIVE') {
        emitCompanyStatusStale();
      }
    }

    // The user just signed out on purpose: a 401 on a request that was still
    // in flight is expected. Refreshing would fail (the refresh token was
    // revoked) and, worse, a late failure could clear the tokens of a sign-in
    // made seconds later.
    if (error.response?.status === 401 && !isAuthRoute && isIntentionalSignOut()) {
      return Promise.reject(error);
    }

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthRoute
    ) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = getRefreshToken();
        if (!refreshToken) {
          throw new Error('No refresh token');
        }
        // Deliberately a bare axios call, not `api` — routing this through the
        // instance would re-enter this same interceptor on failure.
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
          refreshToken,
        });
        const newAccess: string = data.data.accessToken;
        const newRefresh: string = data.data.refreshToken;
        setTokens(newAccess, newRefresh);
        processQueue(null, newAccess);
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearTokens();
        // Skipped for sign-out itself: that flow already resets state, and a
        // "Session expired" toast would be wrong during an intentional exit.
        if (!url.includes('/auth/signout') && !url.includes('/auth/logout')) {
          emitSessionExpired();
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// ─── Error extraction ───────────────────────────────
export const extractErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as
      | { error?: { message?: string }; message?: string | string[] }
      | string
      | undefined;

    // A Heroku error page is HTML, not JSON — don't try to read fields off it.
    if (typeof data === 'string' && data.includes('<!DOCTYPE')) {
      if (status === 502 || status === 503)
        return 'Server is temporarily unavailable. Please try again in a moment.';
      if (status === 500) return 'Internal server error. Please try again later.';
      return `Server error (${status}). Please try again later.`;
    }

    if (typeof data === 'object' && data !== null) {
      // NestJS standard: { error: { message } }
      const serverMsg = data.error?.message;
      if (serverMsg) return serverMsg;
      // Validation pipe: { message } or { message: [...] }
      if (data.message) {
        return Array.isArray(data.message)
          ? data.message.join(', ')
          : String(data.message);
      }
    }

    if (status === 401) return 'Invalid email or password.';
    if (status === 429) return 'Too many requests. Please wait a moment.';
    if (status === 403) return 'You do not have permission for this action.';
    if (status === 404) return 'Resource not found.';
    if (status === 502 || status === 503)
      return 'Server is temporarily unavailable. Please try again in a moment.';
    if (status === 500) return 'Internal server error. Please try again later.';
    if (!error.response) return 'Network error. Please check your connection.';
  }
  return (error as Error)?.message || 'An unexpected error occurred.';
};

/**
 * The server's `error.code`.
 *
 * This matters more here than it did on mobile: the backend's exception filter
 * copies only `code`, `message` and `details` off a thrown error and DROPS
 * every other key — `companyStatus`, `rejectionReason`, `email`, `feature` are
 * all thrown by the auth module and none of them arrive. The code is the only
 * reliable discriminator a screen has.
 */
export const extractErrorCode = (error: unknown): string | undefined => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { error?: { code?: string }; code?: string }
      | undefined;
    return data?.error?.code ?? data?.code;
  }
  return (error as { code?: string })?.code;
};

/**
 * The structured `error.details` the server attaches to some refusals — the
 * short items of a backorder, the breakdown of a credit-limit check.
 */
export const extractErrorDetails = (error: unknown): unknown => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: { details?: unknown } } | undefined;
    return data?.error?.details;
  }
  return (error as { details?: unknown })?.details;
};

/** An Error that reaches a screen with its server code, status and details intact. */
export class ApiError extends Error {
  code?: string;
  status?: number;
  details?: unknown;
  constructor(message: string, code?: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Wrap a caught axios error, keeping both the readable message and the code.
 * Drop-in replacement for `new Error(extractErrorMessage(e))`.
 */
export const toApiError = (error: unknown): ApiError =>
  new ApiError(
    extractErrorMessage(error),
    extractErrorCode(error),
    axios.isAxiosError(error) ? error.response?.status : undefined,
    extractErrorDetails(error),
  );

// ─── Response unwrapping ────────────────────────────
/**
 * THE unwrapper. Use this on every response; never reach for `res.data.data`.
 *
 * Most handlers are wrapped by ResponseEnvelopeInterceptor into
 * `{ success, data }`. Nine report endpoints are not: ReportsController writes
 * `res.json(data)` directly, so profit-loss, balance-sheet, ar-aging, ap-aging,
 * inventory-valuation, trial-balance, cash-flow, delivery-report and aging come
 * back as bare payloads. `/reports/dashboard` and `/reports/analytics-dashboard`
 * ARE enveloped. The three-way fallback below covers both without the caller
 * needing to know which kind it asked for.
 *
 * Caveat worth knowing before you build pagination: the envelope keeps only
 * `data` and `message`. A service returning `{ data, summary, pagination }` or
 * `{ data, total }` is flattened, and that metadata never reaches us.
 */
export const unwrapEnvelope = <T = unknown>(response: unknown): T => {
  const r = response as
    | { success?: boolean; data?: unknown }
    | undefined;
  if (r?.success && r.data !== undefined) return r.data as T;
  const nested = r?.data as { success?: boolean; data?: unknown } | undefined;
  if (nested?.success && nested.data !== undefined) return nested.data as T;
  return (r?.data ?? r) as T;
};

// ─── Maker-checker ──────────────────────────────────
/**
 * What a staff member gets back instead of the document they submitted.
 *
 * There is no "create approval" endpoint. Each domain controller branches
 * inline: staff POST the ordinary business endpoint and receive HTTP 200/201
 * with this payload, having created exactly one approval row — no ledger entry,
 * no document, no stock movement. The raw request body is stored and replayed
 * when an owner approves.
 *
 * So a 2xx does NOT mean the invoice exists. Every gated write must ask.
 */
export interface PendingApproval {
  pending: true;
  requestId: string;
  type: string;
  summary: string;
  message: string;
}

export const isPendingApproval = (data: unknown): data is PendingApproval =>
  typeof data === 'object' &&
  data !== null &&
  (data as { pending?: unknown }).pending === true;

// ─── Binary endpoints ───────────────────────────────
/**
 * Fetch an authenticated binary route as an object URL.
 *
 * Seven routes stream bytes rather than JSON — invoice PDFs, payslip PDFs, bill
 * payment proofs, delivery bill photos, billing screenshots. None of them are
 * public, so a plain `<a href>` or `<img src>` 401s: the browser will not
 * attach the Authorization header. Fetch it here, hand back a blob URL.
 *
 * The caller owns the URL and must URL.revokeObjectURL() it when done, or the
 * blob is pinned in memory for the life of the document.
 */
export const authedBlobUrl = async (
  path: string,
  config?: AxiosRequestConfig,
): Promise<string> => URL.createObjectURL(await authedBlob(path, config));

/** The file itself, for printing, downloading or sharing it. */
export const authedBlob = async (path: string, config?: AxiosRequestConfig): Promise<Blob> => {
  const response = await api.get<Blob>(path, {
    ...config,
    responseType: 'blob',
  });
  return response.data;
};

// ─── Multipart upload ───────────────────────────────
/**
 * POST a FormData with auth headers, via fetch rather than axios.
 *
 * Content-Type is deliberately unset: the browser generates the
 * `multipart/form-data; boundary=…` header itself, and setting it by hand drops
 * the boundary so the server's multer parser never finds the file.
 */
export const postMultipart = async <T = unknown>(
  path: string,
  form: FormData,
): Promise<T> => {
  const token = getAccessToken();
  const companyId = getStoredCompanyId();

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(companyId ? { 'x-company-id': companyId } : {}),
      },
      body: form,
    });
  } catch {
    throw new ApiError('Network error. Please check your connection.');
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }

  if (res.status === 401) emitSessionExpired();

  if (!res.ok) {
    const body = json as
      | { error?: { message?: string; code?: string }; message?: string | string[] }
      | null;
    const raw = body?.error?.message ?? body?.message;
    const msg = Array.isArray(raw) ? raw.join(', ') : raw;
    throw new ApiError(
      typeof msg === 'string' && msg
        ? msg
        : `Upload failed (${res.status}). Please try again.`,
      body?.error?.code,
      res.status,
    );
  }

  return unwrapEnvelope<T>(json);
};
