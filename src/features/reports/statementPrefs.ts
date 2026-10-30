// ═══════════════════════════════════════════════════════
// FinMatrix Web — Statement display preferences
// ═══════════════════════════════════════════════════════
// Row density is a reader's preference, not part of the report: it is kept in
// this browser, applies to every statement, and is not in the URL (a link
// should open someone else's view at their own density).
//
// One store for the whole page, so the toggle and every table read the same
// value and change together.

import { useSyncExternalStore } from 'react';

export type StatementDensity = 'comfortable' | 'compact';

const KEY = 'finmatrix.reports.density';

// Storage can be blocked (private mode, a locked-down browser); the preference
// then lasts for the page, which is all that is lost.
const read = (): StatementDensity => {
  try {
    return localStorage.getItem(KEY) === 'compact' ? 'compact' : 'comfortable';
  } catch {
    return 'comfortable';
  }
};

let current: StatementDensity | null = null;
const listeners = new Set<() => void>();

const getSnapshot = (): StatementDensity => (current ??= read());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setStatementDensity = (density: StatementDensity) => {
  current = density;
  try {
    localStorage.setItem(KEY, density);
  } catch {
    // See `read`.
  }
  listeners.forEach((l) => l());
};

/** For tests: forget the cached value so the next read goes to storage. */
export const resetStatementDensityCache = () => {
  current = null;
};

export function useStatementDensity(): [StatementDensity, (d: StatementDensity) => void] {
  const density = useSyncExternalStore(subscribe, getSnapshot, () => 'comfortable' as const);
  return [density, setStatementDensity];
}
