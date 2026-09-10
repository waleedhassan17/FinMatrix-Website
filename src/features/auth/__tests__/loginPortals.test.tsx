// @vitest-environment jsdom

// ═══════════════════════════════════════════════════════
// The staff portal is login-only — enforced, not eyeballed
// ═══════════════════════════════════════════════════════
// This is the assertion the whole role-aware sign-in exists to make. The staff
// door must offer a username, a password, a Sign in button and a way back to the
// owner door — and NOTHING else.
//
// It is worth a test rather than a review note because every one of the forbidden
// affordances is the kind of thing a later change adds back absent-mindedly, and
// each one would be a dead end rather than a cosmetic slip:
//
//   "Forgot password?" → the reset flow is an email OTP, and a staff account has
//                        no email. The owner resets it via /settings/users.
//   "Create account"   → /auth/signup REFUSES role 'staff'. The server would 400.
//   "Join with code"   → no such route, and no endpoint behind it.

import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import LoginPage from '@/pages/auth/LoginPage';
import authReducer from '@/store/authSlice';

const renderLogin = (search: string) => {
  const store = configureStore({ reducer: { auth: authReducer } });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/login${search}`]}>
          <LoginPage />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
};

/** Every affordance that must not exist on the staff door. */
const FORBIDDEN_ON_STAFF = [
  /forgot/i,
  /reset your password/i,
  /create (a |an )?(business )?account/i,
  /sign ?up/i,
  /invite/i,
  /join/i,
  /new to finmatrix/i,
  /start a business/i,
];

describe('staff portal (/login?role=staff)', () => {
  it('asks for a username, not an email', () => {
    renderLogin('?role=staff');

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
  });

  it('offers a password and a Sign in button', () => {
    renderLogin('?role=staff');

    // Exact: /password/i would also catch the "Show password" toggle's aria-label.
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it.each(FORBIDDEN_ON_STAFF)('shows nothing matching %s', (pattern) => {
    const { container } = renderLogin('?role=staff');
    expect(container.textContent ?? '').not.toMatch(pattern);
  });

  it('links to no route other than the owner portal switch', () => {
    const { container } = renderLogin('?role=staff');

    // A staff member has nowhere else to go from here, so any <a href> would be
    // a door onto something they cannot use.
    const hrefs = [...container.querySelectorAll('a[href]')].map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toEqual([]);
  });

  it('keeps a way back to the owner door', () => {
    renderLogin('?role=staff');
    expect(
      screen.getByRole('button', { name: /business owner/i }),
    ).toBeInTheDocument();
  });

  it('names the portal so the door is unmistakable', () => {
    renderLogin('?role=staff');
    expect(screen.getByText(/team member portal/i)).toBeInTheDocument();
  });
});

describe('owner portal (/login?role=admin)', () => {
  it('asks for an email', () => {
    renderLogin('?role=admin');

    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();
  });

  it('offers password recovery — the owner has an inbox to recover through', () => {
    renderLogin('?role=admin');

    const forgot = screen.getByRole('link', { name: /forgot password/i });
    expect(forgot).toHaveAttribute('href', '/forgot-password');
  });

  it('offers signup on the same screen, so an owner is never bounced', () => {
    renderLogin('?role=admin');

    const create = screen.getByRole('link', { name: /create a business account/i });
    expect(create).toHaveAttribute('href', '/register');
  });

  it('switches to the staff door', () => {
    renderLogin('?role=admin');
    expect(
      screen.getByRole('button', { name: /team member\? sign in here/i }),
    ).toBeInTheDocument();
  });
});

describe('role resolution', () => {
  it('defaults to the owner door when no role is given', () => {
    renderLogin('');
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
  });

  it('ignores a role it does not recognise rather than rendering neither form', () => {
    renderLogin('?role=wharrgarbl');
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
  });
});
