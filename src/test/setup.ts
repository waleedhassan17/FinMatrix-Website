// ═══════════════════════════════════════════════════════
// FinMatrix Web — Test setup
// ═══════════════════════════════════════════════════════
// Runs before every test file, in BOTH environments — most suites here are pure
// logic under node, and only the component tests opt into jsdom with a
// `@vitest-environment jsdom` docblock. So everything DOM-shaped below is guarded
// on a document existing; unguarded, it would crash every logic suite at import.

import { afterEach, vi } from 'vitest';

const hasDom = typeof window !== 'undefined';

if (hasDom) {
  // Matchers, and an unmount between tests. Without cleanup, queries like
  // getByLabelText start matching leftovers from the previous test and the
  // failures make no sense.
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  // jsdom has no IntersectionObserver, and <Reveal> plus the landing nav's
  // scroll-spy both construct one. A stub that never fires is the right default:
  // Reveal renders children visible when it cannot observe, which is exactly what
  // a test should see.
  class MockIntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = '';
    readonly thresholds: ReadonlyArray<number> = [];
    disconnect(): void {}
    observe(): void {}
    unobserve(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

  // jsdom omits matchMedia entirely. matches:false means tests see the animated
  // path by default; a test about reduced motion overrides this itself.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}
