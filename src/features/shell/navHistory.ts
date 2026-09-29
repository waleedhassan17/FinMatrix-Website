import type { MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ADMIN_NAV, STAFF_NAV, type NavGroup } from '@/config/nav';

// ═══════════════════════════════════════════════════════
// Where each page was opened from
// ═══════════════════════════════════════════════════════
// Back used to be a hardcoded link to the record's list, so an invoice opened
// from an estimate, a journal entry opened from the General Ledger, or a form
// opened from the Dashboard's New menu all "went back" somewhere the user had
// never been. QA found it on every create flow and every View customer / View
// vendor link.
//
// This records, for each history entry, the page it was opened FROM, keyed by
// React Router's `location.key`. Back then walks the real history (navigate(-1))
// so the page underneath comes back as it was — scroll, filters in the URL —
// and the old list link is kept only as the fallback for a page opened cold: a
// pasted URL, a new tab, the first page after sign-in.
//
// It hangs off `router.subscribe` rather than a component so the origin is
// already known when the new page first renders; a layout effect would run
// after the page and label its Back link a frame late.

/** The id of the authenticated shell route in the router. */
export const SHELL_ROUTE_ID = 'app';

export interface NavEntry {
  key: string;
  pathname: string;
  search: string;
}

/** The slice of React Router's RouterState this reads. */
export interface NavState {
  historyAction: string;
  location: NavEntry;
  matches: ReadonlyArray<{ route: { id: string } }>;
  navigation: { state: string };
}

const STORAGE_KEY = 'finmatrix:nav-origins';
/** Plenty for one tab's session; the oldest are dropped past it. */
const MAX_ENTRIES = 200;

const isEntry = (v: unknown): v is NavEntry =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as NavEntry).key === 'string' &&
  typeof (v as NavEntry).pathname === 'string' &&
  typeof (v as NavEntry).search === 'string';

export function createNavHistory(storage: Pick<Storage, 'getItem' | 'setItem'> | null) {
  const origins = new Map<string, NavEntry>();
  let current: (NavEntry & { inShell: boolean }) | null = null;

  // sessionStorage, because `location.key` lives in history.state and survives
  // a reload — so Back on a reloaded page still knows where it came from.
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      for (const pair of parsed) {
        if (Array.isArray(pair) && typeof pair[0] === 'string' && isEntry(pair[1])) {
          origins.set(pair[0], pair[1]);
        }
      }
    }
  } catch {
    /* unreadable or blocked storage: start empty, Back falls back to the list */
  }

  const persist = () => {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify([...origins]));
    } catch {
      /* a private window or a full quota: origins just do not survive a reload */
    }
  };

  const record = (key: string, origin: NavEntry) => {
    origins.delete(key);
    origins.set(key, origin);
    while (origins.size > MAX_ENTRIES) {
      origins.delete(origins.keys().next().value as string);
    }
    persist();
  };

  return {
    track(state: NavState) {
      if (state.navigation.state !== 'idle') return;
      const { key, pathname, search } = state.location;
      if (current?.key === key) return;

      // Only pages inside the app shell count as somewhere to go back to, so
      // the sign-in screen or onboarding is never a Back target.
      const inShell = state.matches.some((m) => m.route.id === SHELL_ROUTE_ID);
      if (inShell && current?.inShell) {
        if (state.historyAction === 'PUSH') {
          record(key, { key: current.key, pathname: current.pathname, search: current.search });
        } else if (state.historyAction === 'REPLACE') {
          // A replace stands in for the entry it replaced, so it inherits that
          // entry's origin: a new invoice saved from a form opened on the
          // Dashboard still goes back to the Dashboard.
          const inherited = origins.get(current.key);
          if (inherited) record(key, inherited);
        }
        // POP: moving through entries that already have their origins.
      }
      current = { key, pathname, search, inShell };
    },

    originOf(key: string): NavEntry | null {
      return origins.get(key) ?? null;
    },
  };
}

const sessionStore = (() => {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
})();

export const navHistory = createNavHistory(sessionStore);

// ─── Labels ──────────────────────────────────────────────────────────────

/** Nav titles that read oddly as a destination. */
const LIST_OVERRIDES: Record<string, string> = {
  '/payments': 'Payments',
  '/tax': 'Tax',
};

const listTitles = (() => {
  const titles = new Map<string, string>();
  const add = (groups: NavGroup[]) => {
    for (const g of groups) {
      if (g.path && !titles.has(g.path)) titles.set(g.path, g.title);
      for (const item of g.items ?? []) {
        if (!titles.has(item.path)) titles.set(item.path, item.title);
      }
    }
  };
  add(ADMIN_NAV);
  add(STAFF_NAV as NavGroup[]);
  for (const [path, title] of Object.entries(LIST_OVERRIDES)) titles.set(path, title);
  return titles;
})();

/** One record, named by its list's path. Checked longest-prefix first. */
const RECORD_NAMES: Array<[prefix: string, name: string]> = [
  ['/reports/inventory-valuation/', 'Item report'],
  ['/payroll/runs/', 'Payroll run'],
  ['/reconciliations/reconcile/', 'Reconciliation'],
  ['/invoices/', 'Invoice'],
  ['/estimates/', 'Estimate'],
  ['/sales-orders/', 'Sales order'],
  ['/payments/', 'Payment'],
  ['/credit-memos/', 'Credit memo'],
  ['/customers/', 'Customer'],
  ['/vendors/', 'Vendor'],
  ['/bills/', 'Bill'],
  ['/purchase-orders/', 'Purchase order'],
  ['/vendor-credits/', 'Vendor credit'],
  ['/inventory/', 'Item'],
  ['/deliveries/', 'Delivery'],
  ['/delivery-personnel/', 'Rider'],
  ['/employees/', 'Employee'],
  ['/budgets/', 'Budget'],
  ['/accounts/', 'Account'],
  ['/journal-entries/', 'Journal entry'],
  ['/reconciliations/', 'Reconciliation'],
  ['/approvals/', 'Request'],
  ['/my-requests/', 'Request'],
];

/** What a Back link to this path is called: "Dashboard", "Estimate", "General Ledger". */
export function backLabelFor(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const listed = listTitles.get(path);
  if (listed) return listed;
  for (const [prefix, name] of RECORD_NAMES) {
    if (!path.startsWith(prefix) || path.length <= prefix.length) continue;
    const rest = path.slice(prefix.length);
    if (rest === 'new') return `New ${name.toLowerCase()}`;
    if (rest.endsWith('/edit')) return `Edit ${name.toLowerCase()}`;
    return name;
  }
  return 'Back';
}

// ─── Hooks ───────────────────────────────────────────────────────────────

export interface BackTarget {
  to: string;
  label: string;
}

export interface BackAction extends BackTarget {
  /** Set when Back walks history; absent when it is the fallback link. */
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Where this page's Back goes: the page it was opened from, or `fallback`.
 *
 * Render the result as a real link — `to` is the origin's URL, so middle-click
 * and "open in new tab" still work; a plain click goes back through history
 * instead, which restores the page as it was rather than stacking a new copy.
 */
export function useBack(fallback: BackTarget): BackAction {
  const location = useLocation();
  const navigate = useNavigate();
  const origin = navHistory.originOf(location.key);
  if (!origin) return fallback;

  return {
    to: origin.pathname + origin.search,
    label: backLabelFor(origin.pathname),
    onClick: (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      e.preventDefault();
      navigate(-1);
    },
  };
}

/**
 * Leaving a form after an edit is saved.
 *
 * Opened from the record itself (the usual Edit button), the form steps back to
 * it: replacing the form with a second copy of the record would leave Back on
 * that copy returning to the first, a click that appears to do nothing.
 * Opened from anywhere else, the saved record replaces the form.
 */
export function useLeaveForm(): (detailPath: string) => void {
  const location = useLocation();
  const navigate = useNavigate();
  return (detailPath: string) => {
    const origin = navHistory.originOf(location.key);
    if (origin && origin.pathname === detailPath) navigate(-1);
    else navigate(detailPath, { replace: true });
  };
}
