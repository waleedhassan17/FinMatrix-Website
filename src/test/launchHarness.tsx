// A store, a query client and a router around one screen, for the launch
// (trial / demo / account status) component tests. The auth slice can be
// pre-filled; a probe route records where the screen navigated to.

import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import authReducer, { type AuthState } from '@/store/authSlice';
import type { SubscriptionSummary } from '@/types';

const BASE_AUTH: AuthState = {
  user: null,
  companyId: null,
  company: null,
  companyStatus: null,
  companyType: null,
  features: null,
  subscription: null,
  pendingKind: null,
  isAuthenticated: false,
  status: 'anonymous',
  error: '',
  selectedRole: null,
};

/** A signed-in owner (or staff) of company c1. */
export const signedInAuth = (over: Partial<AuthState> = {}): AuthState => ({
  ...BASE_AUTH,
  user: {
    id: 'u1',
    email: 'owner@example.com',
    username: null,
    displayName: 'Owner',
    role: 'admin',
    phone: '+923001234567',
    companyId: 'c1',
    defaultCompanyId: 'c1',
    isEmailVerified: true,
  },
  companyId: 'c1',
  company: { id: 'c1', name: 'Al-Noor Traders' } as AuthState['company'],
  companyStatus: 'active',
  isAuthenticated: true,
  status: 'authenticated',
  ...over,
});

export const trialSubscription = (over: Partial<SubscriptionSummary> = {}): SubscriptionSummary => ({
  plan: 'warehouse_trial',
  planLabel: 'Warehouse — 30-day free trial',
  expiryDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
  paymentStatus: 'none',
  isTrial: true,
  trialStartedAt: new Date().toISOString(),
  trialConvertedAt: null,
  subscriptionStatus: 'active',
  trialEnded: false,
  suspended: false,
  ...over,
});

/** Where the screen navigated to: any route other than the one under test lands here. */
function Probe() {
  const loc = useLocation();
  return <p data-testid="probe">{loc.pathname}</p>;
}

export function renderScreen(
  element: ReactElement,
  { auth = BASE_AUTH, path = '/', at = path, state }: { auth?: AuthState; path?: string; at?: string; state?: unknown } = {},
) {
  const store = configureStore({ reducer: { auth: authReducer }, preloadedState: { auth } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const utils = render(
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[{ pathname: at.split('?')[0], search: at.includes('?') ? `?${at.split('?')[1]}` : '', state }]}>
          <Routes>
            <Route path={path} element={element} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
  return { ...utils, store, client };
}
