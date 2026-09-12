// @vitest-environment jsdom

// ═══════════════════════════════════════════════════════
// Each sign-in door admits only its own accounts
// ═══════════════════════════════════════════════════════
// The owner's email and password typed into the team member door used to sign
// in and open the owner dashboard. The door is now part of the request, and a
// WRONG_PORTAL answer must leave the visitor on the sign-in screen with an
// error and a way to the right door — never signed in.

import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/networks/auth/authNetwork', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/networks/auth/authNetwork')>();
  return { ...actual, authLogin: vi.fn() };
});

import { portalMismatch } from '@/features/auth/portalAccess';
import { AuthError, authLogin } from '@/networks/auth/authNetwork';
import LoginPage from '@/pages/auth/LoginPage';
import authReducer from '@/store/authSlice';

const login = vi.mocked(authLogin);

const renderAt = (search: string) => {
  const store = configureStore({ reducer: { auth: authReducer } });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/login${search}`]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<p>Dashboard page</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
  return store;
};

const fillAndSubmit = (identifierLabel: RegExp, identifier: string, password: string) => {
  fireEvent.input(screen.getByLabelText(identifierLabel), { target: { value: identifier } });
  fireEvent.input(screen.getByLabelText(/^password$/i), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
};

describe('portal enforcement on sign-in', () => {
  beforeEach(() => {
    login.mockReset();
  });

  it('keeps the owner off the team member door, with a way to the right one', async () => {
    login.mockRejectedValueOnce(
      new AuthError(portalMismatch('admin').message, 'WRONG_PORTAL', undefined, {
        accountType: 'admin',
      }),
    );
    const store = renderAt('?role=staff');

    fillAndSubmit(/username/i, 'warehouse@gmail.com', '123456');

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/business owner account/i),
    );
    expect(login).toHaveBeenCalledWith({
      identifier: 'warehouse@gmail.com',
      password: '123456',
      portal: 'staff',
    });
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument();
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(screen.getByLabelText(/^password$/i)).toHaveValue('');

    // Exact: the staff door's footer also reads "…Sign in as business owner".
    fireEvent.click(
      within(screen.getByRole('alert')).getByRole('button', { name: /^sign in as business owner$/i }),
    );
    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a team member off the owner door', async () => {
    login.mockRejectedValueOnce(
      new AuthError(portalMismatch('staff').message, 'WRONG_PORTAL', undefined, {
        accountType: 'staff',
      }),
    );
    renderAt('?role=admin');

    fillAndSubmit(/^email$/i, 'staff@example.com', 'pw');

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/team member account/i),
    );
    expect(login).toHaveBeenCalledWith(expect.objectContaining({ portal: 'admin' }));
    expect(
      within(screen.getByRole('alert')).getByRole('button', { name: /^sign in as team member$/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument();
  });

  it('offers no web door to a rider', async () => {
    login.mockRejectedValueOnce(
      new AuthError(portalMismatch('delivery').message, 'WRONG_PORTAL', undefined, {
        accountType: 'delivery',
      }),
    );
    renderAt('?role=staff');

    fillAndSubmit(/username/i, 'rider.one', 'pw');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/android app/i));
    expect(within(screen.getByRole('alert')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('signs an owner in through the owner door', async () => {
    login.mockResolvedValueOnce({
      user: {
        id: 'u1',
        email: 'warehouse@gmail.com',
        username: null,
        displayName: 'Warehouse Admin',
        role: 'admin',
        phone: null,
        companyId: 'c1',
        defaultCompanyId: 'c1',
        isEmailVerified: true,
      },
      companyId: 'c1',
      company: { id: 'c1', name: 'Warehouse Co', status: 'approved' },
      companyStatus: 'active',
      companyType: 'warehouse',
      features: null,
      tokens: { accessToken: 'a', refreshToken: 'r', expiresIn: 900 },
    });
    const store = renderAt('?role=admin');

    fillAndSubmit(/^email$/i, 'warehouse@gmail.com', '123456');

    await waitFor(() => expect(screen.getByText('Dashboard page')).toBeInTheDocument());
    expect(login).toHaveBeenCalledWith(expect.objectContaining({ portal: 'admin' }));
    expect(store.getState().auth.user?.role).toBe('admin');
  });
});
