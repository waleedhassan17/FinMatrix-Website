// ═══════════════════════════════════════════════════════
// FinMatrix Web — Auth Events (session bridge)
// ═══════════════════════════════════════════════════════
// Ported from the app's src/utils/authEvents.ts.
//
// The axios client cannot import the Redux store: the store imports slices,
// slices import networks, networks import the client, and the cycle would
// break module init. So the client emits, and a component near the root
// registers the handler.

type Handler = () => void;

// ─── Session expired ────────────────────────────────────────────────────
// Fired when the 401-refresh flow has exhausted its options. The handler
// dispatches signOut() so the UI actually returns to sign-in, instead of
// sitting on dead screens whose every request 401s until the next reload.

let sessionExpiredHandler: Handler | null = null;

export const setSessionExpiredHandler = (h: Handler | null): void => {
  sessionExpiredHandler = h;
};

export const emitSessionExpired = (): void => {
  sessionExpiredHandler?.();
};

// ─── Company status stale (403 COMPANY_NOT_ACTIVE) ──────────────────────
// Fired when a business request is rejected because the company is no longer
// active — the subscription lapsed mid-session (the server enforces expiry
// live, ahead of the billing cron) or a super admin deactivated the account.
// The handler re-fetches /auth/me so identity picks up the fresh
// companyStatus and the router can send the user to the matching gate.

let companyStatusStaleHandler: Handler | null = null;

export const setCompanyStatusStaleHandler = (h: Handler | null): void => {
  companyStatusStaleHandler = h;
};

export const emitCompanyStatusStale = (): void => {
  companyStatusStaleHandler?.();
};
