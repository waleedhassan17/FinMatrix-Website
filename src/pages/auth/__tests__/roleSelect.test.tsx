// @vitest-environment jsdom

// ═══════════════════════════════════════════════════════
// The role cards are real controls
// ═══════════════════════════════════════════════════════
// They are <div role="button"> rather than <button>, because a button cannot
// legally contain the block layout these cards use. That trade means the keyboard
// behaviour a real button gets for free has to be implemented — and therefore
// tested, or the page is mouse-only and nobody notices until someone cannot use it.

import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import RoleSelectPage from '@/pages/auth/RoleSelectPage';
import authReducer from '@/store/authSlice';
import { getStoredPortalRole } from '@/utils/storage';

/** Renders the current path so a navigation can be asserted. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="path">{`${location.pathname}${location.search}`}</div>;
}

const setup = () => {
  const store = configureStore({ reducer: { auth: authReducer } });

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/get-started']}>
        <Routes>
          <Route path="/get-started" element={<RoleSelectPage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

  return { store };
};

const card = (name: RegExp) =>
  screen.getByRole('button', { name }) as HTMLElement;

describe('role selection', () => {
  it('offers exactly the two portals the web has', () => {
    setup();

    expect(card(/business owner/i)).toBeInTheDocument();
    expect(card(/team member/i)).toBeInTheDocument();
  });

  it('tells a delivery rider to use the app instead of signing up here', () => {
    // The server accepts role 'delivery' at signup but this console has no
    // delivery view, so without this a rider creates an account they cannot use.
    setup();
    expect(screen.getByText(/delivery rider\?/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /delivery rider/i }),
    ).not.toBeInTheDocument();
  });

  it('puts both cards in the tab order', () => {
    setup();
    expect(card(/business owner/i)).toHaveAttribute('tabindex', '0');
    expect(card(/team member/i)).toHaveAttribute('tabindex', '0');
  });

  it.each([
    ['{Enter}', 'Enter'],
    [' ', 'Space'],
  ])('activates the staff card with %s', async (key) => {
    const { store } = setup();
    const user = userEvent.setup();

    card(/team member/i).focus();
    await user.keyboard(key);

    expect(store.getState().auth.selectedRole).toBe('staff');
    expect(screen.getByTestId('path')).toHaveTextContent('/login?role=staff');
  });

  it('activates the owner card by click and records the choice', async () => {
    const { store } = setup();
    const user = userEvent.setup();

    await user.click(card(/business owner/i));

    expect(store.getState().auth.selectedRole).toBe('admin');
    // Persisted, so a reload returns to the same door.
    expect(getStoredPortalRole()).toBe('admin');
    expect(screen.getByTestId('path')).toHaveTextContent('/login?role=admin');
  });

  it('offers a way to start a business under the owner card only', () => {
    setup();

    const links = screen.getAllByRole('link');
    // Exactly one link on the page, and it is the owner's. A staff member has
    // nothing to self-serve: /auth/signup refuses role 'staff'.
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/register');
    expect(links[0]).toHaveTextContent(/start a business/i);
  });
});
