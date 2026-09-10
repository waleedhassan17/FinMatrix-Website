// @vitest-environment jsdom
// createBrowserRouter builds a browser history at module scope, which needs a
// document — even though nothing here renders.

import { describe, expect, it } from 'vitest';

import { router } from '@/app/router';

/**
 * The public surface, asserted rather than assumed.
 *
 * Two things this pins:
 *
 * 1. `/join` DOES NOT EXIST, and stays gone. Invite-code joining was dropped from
 *    the web: a staff account can only be created by an owner in Settings → Users,
 *    and the server has no working join endpoint behind it (the app's
 *    joinCompanyAPI is dead code that matches codes against local state). Nothing
 *    was deleted to "remove" it — this is the guard against it being re-added,
 *    which is the only deliverable a removal of something absent can have.
 *
 * 2. Nothing new leaks into the UNGATED set by accident. A route added as a
 *    sibling of the session gate is reachable with no token at all, so the list
 *    below should be short and every entry should be deliberate.
 */

interface RouteLike {
  path?: string;
  index?: boolean;
  children?: RouteLike[];
}

const collectPaths = (routes: RouteLike[], acc: string[] = []): string[] => {
  for (const route of routes) {
    if (route.path) acc.push(route.path);
    if (route.children) collectPaths(route.children, acc);
  }
  return acc;
};

const ALL_PATHS = collectPaths(router.routes as RouteLike[]);

/** Top-level entries: matched with no session boot at all. */
const UNGATED = (router.routes as RouteLike[])
  .filter((r) => r.path !== undefined)
  .map((r) => r.path as string);

describe('/join is gone and stays gone', () => {
  it('is not a route', () => {
    expect(ALL_PATHS).not.toContain('/join');
    expect(ALL_PATHS).not.toContain('join');
  });

  it('has no invite-code route under any spelling', () => {
    for (const path of ALL_PATHS) {
      expect(path).not.toMatch(/join|invite/i);
    }
  });
});

describe('the ungated surface', () => {
  it('is the landing page and nothing else', () => {
    // Everything else — including /login — sits under SessionGate so the axios
    // client's session handlers are registered before anything can 401.
    expect(UNGATED).toEqual(['/']);
  });
});

describe('the public (pre-auth) routes', () => {
  it('are exactly the screens a visitor with no account needs', () => {
    const expected = [
      '/',
      '/get-started',
      '/welcome',
      '/login',
      '/register',
      '/forgot-password',
      '/verify-email',
    ];

    for (const path of expected) {
      expect(ALL_PATHS).toContain(path);
    }
  });
});

describe('the dashboard moved off the index', () => {
  it('registers /dashboard', () => {
    expect(ALL_PATHS).toContain('dashboard');
  });

  it('leaves no index route to fight the landing page for "/"', () => {
    const authedLayout = (router.routes as RouteLike[]).find(
      (r) => r.path === undefined && r.children !== undefined,
    );
    const layoutChildren = authedLayout?.children ?? [];

    // An index route on the pathless authed layout would resolve to `/`, which
    // the landing page owns.
    const findIndex = (routes: RouteLike[]): boolean =>
      routes.some((r) => r.index === true || findIndex(r.children ?? []));

    expect(findIndex(layoutChildren)).toBe(false);
  });
});

describe('owner-only billing routes', () => {
  it.each(['/onboarding/company', '/onboarding/plan', '/onboarding/pay', '/account/renew'])(
    'registers %s',
    (path) => {
      expect(ALL_PATHS).toContain(path);
    },
  );
});
