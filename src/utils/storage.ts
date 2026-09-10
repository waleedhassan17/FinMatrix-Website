// ═══════════════════════════════════════════════════════
// FinMatrix Web — Session Storage
// ═══════════════════════════════════════════════════════
// The web counterpart of the app's src/utils/storageUtils.ts. Same six
// functions, same storage keys, so a value written by one client is legible to
// anyone reading the other's code.
//
// Two deliberate differences from the app:
//
//   1. These are SYNCHRONOUS. AsyncStorage forced a Promise on the app;
//      localStorage does not, and route guards need to answer "is there a
//      token?" during render without an await.
//   2. Every access is guarded. localStorage throws outright — not returns
//      null — when a browser blocks site data (Safari private mode, hardened
//      privacy settings). An unguarded read there would crash the app at
//      boot rather than send the user to the sign-in screen.

const ACCESS_TOKEN_KEY = '@finmatrix/accessToken';
const REFRESH_TOKEN_KEY = '@finmatrix/refreshToken';
const COMPANY_ID_KEY = '@finmatrix/companyId';

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked — the session simply will not survive a reload */
  }
}

function removeKeys(...keys: string[]): void {
  try {
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    /* storage blocked — nothing was persisted to begin with */
  }
}

export const setTokens = (accessToken: string, refreshToken: string): void => {
  writeKey(ACCESS_TOKEN_KEY, accessToken);
  writeKey(REFRESH_TOKEN_KEY, refreshToken);
};

export const getAccessToken = (): string | null => readKey(ACCESS_TOKEN_KEY);

export const getRefreshToken = (): string | null => readKey(REFRESH_TOKEN_KEY);

export const setStoredCompanyId = (companyId: string): void =>
  writeKey(COMPANY_ID_KEY, companyId);

export const getStoredCompanyId = (): string | null => readKey(COMPANY_ID_KEY);

export const clearTokens = (): void =>
  removeKeys(ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, COMPANY_ID_KEY);

/** Cheap synchronous "might we be signed in?" test for route guards. */
export const hasSession = (): boolean => getAccessToken() !== null;

// ─── Chosen portal ──────────────────────────────────
// Which sign-in door the visitor picked at /get-started: the owner's email form
// or the staff username form.
//
// This is a UI PREFERENCE AND NOTHING ELSE. Authority comes from `user.role`,
// which only the server sets — /auth/signin ignores any role the client sends.
// Storing it is safe for the same reason storing it is useful: it cannot grant
// anything, it only saves a staff member from picking their portal every visit.
//
// Deliberately NOT cleared by clearTokens(): signing out should not make the next
// sign-in harder for the person who just used this machine.

const SELECTED_ROLE_KEY = '@finmatrix/selectedRole';

/** The two roles that have a portal on the web. Riders use the Android app. */
export type PortalRole = 'admin' | 'staff';

const isPortalRole = (v: unknown): v is PortalRole =>
  v === 'admin' || v === 'staff';

export const setStoredPortalRole = (role: PortalRole): void =>
  writeKey(SELECTED_ROLE_KEY, role);

/**
 * Validated on the way out. localStorage is writable by anyone at the keyboard,
 * and an unrecognised value flowing into the UI would pick neither form.
 */
export const getStoredPortalRole = (): PortalRole | null => {
  const raw = readKey(SELECTED_ROLE_KEY);
  return isPortalRole(raw) ? raw : null;
};

export const clearStoredPortalRole = (): void => removeKeys(SELECTED_ROLE_KEY);
