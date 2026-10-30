// ═══════════════════════════════════════════════════════
// FinMatrix Web — Rendering a report page in a test
// ═══════════════════════════════════════════════════════

import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

import authReducer from '@/store/authSlice';
import type { AuthUser, UserRole } from '@/types';
import { LocationProbe } from '@/test/LocationProbe';
import { requestLog } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';

/** Wire the MSW server into this test file's lifecycle. */
export const startMsw = () => {
  beforeAll(() => {
    // recharts' ResponsiveContainer and Radix both measure with it; jsdom has none.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    server.listen({ onUnhandledRequest: 'error' });
  });
  afterEach(() => {
    server.resetHandlers();
    requestLog.length = 0;
  });
  afterAll(() => server.close());
};

export { locationRef } from '@/test/locationRef';

/**
 * Render a page at a URL with everything it needs: a store (no company, so
 * the letterhead query stays off), a fresh query client with no retries, and
 * a router whose location the test can read.
 *
 * No one is signed in unless `role` says who: links a role may not open —
 * a customer's record, the item itself — then stay hidden, as they would.
 */
export const renderReport = (
  path: string,
  url: string,
  page: ReactElement,
  { role }: { role?: UserRole } = {},
) => {
  const signedIn = role ? { auth: { ...authReducer(undefined, { type: '@@init' }), user: { role } as AuthUser } } : undefined;
  const store = configureStore({ reducer: { auth: authReducer }, preloadedState: signedIn });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>
          <LocationProbe />
          <Routes>
            <Route path={path} element={page} />
            <Route path="*" element={<p>Navigated away</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
};
