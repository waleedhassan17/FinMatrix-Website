// ═══════════════════════════════════════════════════════
// FinMatrix Web — Error reporting
// ═══════════════════════════════════════════════════════
// Sentry, matching the app's observability — but only when a DSN is
// configured. Without VITE_SENTRY_DSN the SDK is never downloaded: it is a
// dynamic import, so it stays out of the first chunk every visitor loads,
// including the public landing page.
//
// Errors only (no tracing), and no PII: the SDK is told not to attach user IPs
// or cookies, and nothing here sends names, emails or amounts.

type SentryModule = typeof import('@sentry/react');

let sentry: Promise<SentryModule> | null = null;

export const initObservability = (): void => {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || sentry) return;
  sentry = import('@sentry/react').then((S) => {
    S.init({
      dsn,
      environment: import.meta.env.MODE,
      release: (import.meta.env.VITE_RELEASE as string | undefined) || undefined,
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
    return S;
  });
};

/** Report a caught error. A no-op when Sentry is not configured. */
export const reportError = (error: unknown, context?: Record<string, unknown>): void => {
  void sentry?.then((S) => S.captureException(error, context ? { extra: context } : undefined));
};
