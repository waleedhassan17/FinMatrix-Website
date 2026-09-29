// @vitest-environment jsdom

// ═══════════════════════════════════════════════════════
// Back returns to the page it was opened from
// ═══════════════════════════════════════════════════════
// QA: a form opened from the Dashboard's New menu went "back" to its list; an
// invoice opened from an estimate went back to Invoices; a journal entry opened
// from the General Ledger went back to Journal Entries. These drive the real
// BackLink through a data router wired to navHistory the way src/app/router.tsx
// wires it.

import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { BackLink, CancelButton } from '@/components/layout/BackLink';
import { navHistory, SHELL_ROUTE_ID, useLeaveForm } from '@/features/shell/navHistory';

let seq = 0;

function Form() {
  const leave = useLeaveForm();
  return (
    <div>
      <h1>Invoice form</h1>
      <BackLink fallback={{ to: '/invoices', label: 'Invoices' }} />
      <CancelButton fallback="/invoices" />
      <button type="button" onClick={() => leave('/invoices/7')}>
        Save
      </button>
    </div>
  );
}

function setup(start: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Outlet />,
        children: [
          { path: 'login', element: <h1>Sign in</h1> },
          {
            id: SHELL_ROUTE_ID,
            element: <Outlet />,
            children: [
              {
                path: 'dashboard',
                element: (
                  <div>
                    <h1>Dashboard</h1>
                    <Link to="/invoices/new">New invoice</Link>
                  </div>
                ),
              },
              { path: 'invoices', element: <h1>Invoice list</h1> },
              { path: 'invoices/new', element: <Form /> },
              { path: 'invoices/:id/edit', element: <Form /> },
              {
                path: 'invoices/:id',
                element: (
                  <div>
                    <h1>Invoice 7</h1>
                    <BackLink fallback={{ to: '/invoices', label: 'Invoices' }} />
                    <Link to="/invoices/7/edit">Edit</Link>
                  </div>
                ),
              },
            ],
          },
        ],
      },
    ],
    // A unique key per test: the tracker is a module singleton, and memory
    // routers otherwise all start on the key "default".
    { initialEntries: [{ pathname: start, key: `start-${++seq}` }] },
  );
  navHistory.track(router.state);
  router.subscribe((state) => navHistory.track(state));
  render(<RouterProvider router={router} />);
  return router;
}

describe('BackLink', () => {
  it('goes back to the Dashboard a form was opened from, and says so', async () => {
    const router = setup('/dashboard');
    fireEvent.click(screen.getByText('New invoice'));
    expect(await screen.findByRole('heading', { name: 'Invoice form' })).toBeInTheDocument();

    const back = screen.getByRole('link', { name: 'Dashboard' });
    expect(back).toHaveAttribute('href', '/dashboard');

    fireEvent.click(back);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    // Through history, not a new entry on top of it.
    expect(router.state.historyAction).toBe('POP');
  });

  it('Cancel leaves the same way', async () => {
    setup('/dashboard');
    fireEvent.click(screen.getByText('New invoice'));
    await screen.findByRole('heading', { name: 'Invoice form' });
    fireEvent.click(screen.getByRole('link', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('keeps the list link for a page opened cold', async () => {
    setup('/invoices/new');
    await screen.findByRole('heading', { name: 'Invoice form' });
    expect(screen.getByRole('link', { name: 'Invoices' })).toHaveAttribute('href', '/invoices');
  });

  it('a record saved from a form goes back to where the form was opened', async () => {
    setup('/dashboard');
    fireEvent.click(screen.getByText('New invoice'));
    await screen.findByRole('heading', { name: 'Invoice form' });

    // Create: the saved invoice replaces the form.
    act(() => {
      fireEvent.click(screen.getByText('Save'));
    });
    expect(await screen.findByRole('heading', { name: 'Invoice 7' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('saving an edit steps back to the record instead of stacking a copy of it', async () => {
    const router = setup('/invoices/7');
    fireEvent.click(await screen.findByText('Edit'));
    await screen.findByRole('heading', { name: 'Invoice form' });

    act(() => {
      fireEvent.click(screen.getByText('Save'));
    });
    expect(await screen.findByRole('heading', { name: 'Invoice 7' })).toBeInTheDocument();
    expect(router.state.historyAction).toBe('POP');
    // Opened cold, the record still offers its list — not a dead link to itself.
    expect(screen.getByRole('link', { name: 'Invoices' })).toHaveAttribute('href', '/invoices');
  });

  it('never goes back to a page outside the app', async () => {
    const router = setup('/login');
    await act(() => router.navigate('/invoices/new'));
    await screen.findByRole('heading', { name: 'Invoice form' });
    expect(screen.getByRole('link', { name: 'Invoices' })).toHaveAttribute('href', '/invoices');
  });
});
