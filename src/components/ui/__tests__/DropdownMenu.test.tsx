// @vitest-environment jsdom

// ═══════════════════════════════════════════════════════
// A menu item can be a link
// ═══════════════════════════════════════════════════════
// `DropdownMenuItem asChild` wraps a <Link> so a menu row navigates like a
// link — middle-click, open in new tab, the URL in the status bar. Radix's Slot
// requires EXACTLY one element child for that, and React counts an absent
// `icon` rendered beside the child as a node of its own. So every link item
// threw on open, taking the whole route down with it: the "View customer" rows
// in the detail pages' More menus, and the dashboard's New menu.

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Link } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';

const renderOpen = (item: React.ReactNode) =>
  render(
    <MemoryRouter>
      <DropdownMenu open>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>{item}</DropdownMenuContent>
      </DropdownMenu>
    </MemoryRouter>,
  );

describe('DropdownMenuItem', () => {
  it('slots onto a single link child when asChild', () => {
    renderOpen(
      <DropdownMenuItem asChild>
        <Link to="/invoices/new">New invoice</Link>
      </DropdownMenuItem>,
    );
    const item = screen.getByRole('menuitem', { name: 'New invoice' });
    expect(item.tagName).toBe('A');
    expect(item.getAttribute('href')).toBe('/invoices/new');
  });

  it('still renders an icon beside plain content', () => {
    renderOpen(
      <DropdownMenuItem icon={<svg data-testid="icon" />}>Duplicate</DropdownMenuItem>,
    );
    const item = screen.getByRole('menuitem', { name: 'Duplicate' });
    expect(item.querySelector('[data-testid="icon"]')).not.toBeNull();
  });
});
