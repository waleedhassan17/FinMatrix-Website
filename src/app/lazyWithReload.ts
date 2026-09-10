// ═══════════════════════════════════════════════════════
// FinMatrix Web — Resilient lazy()
// ═══════════════════════════════════════════════════════
// React.lazy, hardened against the one failure every code-split SPA on an
// immutable host eventually hits:
//
//   TypeError: Failed to fetch dynamically imported module:
//   https://…/assets/LoginPage-B0W0XjI_.js
//
// WHY IT HAPPENS. Vite content-hashes every chunk, so a page whose source
// changed gets a new filename on every build. Vercel deployments are immutable
// snapshots — once we redeploy, the production alias serves only the NEW file
// list, and the old hash is gone. A tab that loaded index.html before the deploy
// still holds the old names in its module graph. Nothing is fetched until the
// user navigates (that is the whole point of lazyPages.ts), so the request for a
// now-deleted chunk goes out minutes or hours later, 404s into the SPA fallback,
// and the browser rejects index.html where it expected JavaScript.
//
// It is not a bug in the page being loaded. The fix is not to retry forever — the
// file is genuinely gone — but to reload the document, because a fresh index.html
// carries the current hashes and the navigation then completes.
//
// THE LADDER, cheapest rung first:
//   1. Retry once after a short pause. Covers the honest cases — a dropped
//      connection, a flaky tunnel, a request killed by tab suspension — without
//      throwing away the user's in-memory state.
//   2. Reload the document once. Covers the stale-deploy case above.
//   3. Rethrow, so router.tsx's errorElement renders something human.
//
// Rung 3 is what makes this safe. Without a persisted marker, a chunk that fails
// for a reason a reload cannot fix (an ad blocker, an offline device, a genuinely
// broken deploy) would reload, fail, reload — an infinite refresh loop, a far
// worse experience than the error screen it was trying to avoid. The sentinel
// below is what remembers "we already tried that".

import { lazy, type ComponentType } from 'react';

/**
 * Marks that a reload has already been spent on a failed chunk.
 *
 * sessionStorage, not localStorage, on purpose: the marker should die with the
 * tab. A stale entry surviving into next week would spend the app's one recovery
 * attempt on an unrelated failure months later.
 */
const RELOAD_MARKER = '@finmatrix/chunkReloadAttempted';

// Every access guarded — sessionStorage does not return null when a browser
// blocks site data, it throws. See the same reasoning in utils/storage.ts.
function reloadAlreadyAttempted(): boolean {
  try {
    return window.sessionStorage.getItem(RELOAD_MARKER) !== null;
  } catch {
    // Storage blocked. Report "already attempted" so we never reload: with no
    // way to persist the marker, a reload could not be counted and would loop.
    return true;
  }
}

function markReloadAttempted(): void {
  try {
    window.sessionStorage.setItem(RELOAD_MARKER, String(Date.now()));
  } catch {
    /* unreachable — reloadAlreadyAttempted() short-circuits when storage throws */
  }
}

function clearReloadMarker(): void {
  try {
    window.sessionStorage.removeItem(RELOAD_MARKER);
  } catch {
    /* nothing was stored to begin with */
  }
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Long enough to outlast a blip, short enough to read as a slow page load. */
const RETRY_DELAY_MS = 500;

type Loader<T extends ComponentType<unknown>> = () => Promise<{ default: T }>;

/**
 * Drop-in replacement for React.lazy that survives a deploy landing mid-session.
 *
 * The returned promise deliberately never resolves on the reload path: the
 * document is being replaced, and resolving would let React render against a
 * page that is on its way out.
 */
export function lazyWithReload<T extends ComponentType<unknown>>(
  loader: Loader<T>,
) {
  return lazy(async () => {
    try {
      const mod = await loader();
      // A chunk loaded, so whatever went wrong before is behind us. Clearing
      // here — rather than on boot — keeps the app's one reload available for a
      // *later* deploy in the same long-lived tab.
      clearReloadMarker();
      return mod;
    } catch (firstError) {
      // Rung 1: one honest retry.
      await wait(RETRY_DELAY_MS);
      try {
        const mod = await loader();
        clearReloadMarker();
        return mod;
      } catch (secondError) {
        // Rung 3 (checked before 2): we already spent the reload. Let the error
        // boundary render rather than starting a refresh loop.
        if (reloadAlreadyAttempted()) {
          throw secondError;
        }

        // Rung 2: the chunk is almost certainly gone from the server. Get a
        // fresh index.html and the current hashes with it.
        console.warn(
          '[lazyWithReload] chunk failed to load twice; reloading for a fresh build',
          firstError,
        );
        markReloadAttempted();
        window.location.reload();

        // Hang until the document goes away. See the note above.
        return new Promise<never>(() => {});
      }
    }
  });
}
