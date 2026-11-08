// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProductTourSection } from '@/features/landing/ProductTourSection';

const frontTitle = () => screen.getByRole('heading', { level: 3 }).textContent;
const counter = () => screen.getByText(/^\d+ \/ \d+$/).textContent;

describe('the product tour deck', () => {
  it('speaks of a product tour and pages, not screens', () => {
    render(<ProductTourSection />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Explore the FinMatrix platform');
    expect(document.body.textContent).not.toMatch(/\bscreens?\b/i);
    expect(document.body.innerHTML).not.toMatch(/aria-label="[^"]*screen/i);
  });

  it('starts on the dashboard with every page in the deck', () => {
    render(<ProductTourSection />);
    expect(frontTitle()).toBe('Dashboard');
    expect(counter()).toBe('1 / 6');
    expect(screen.getByRole('img').getAttribute('src')).toBe('/screenshots/dashboard.webp');
  });

  it('steps forward and wraps backwards', () => {
    render(<ProductTourSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(frontTitle()).toBe('Invoices');
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(frontTitle()).toBe('Analytics');
  });

  it('a category shows only its own pages, from the first', () => {
    render(<ProductTourSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.click(screen.getByRole('button', { name: /^Sales/ }));
    expect(frontTitle()).toBe('Invoices');
    expect(counter()).toBe('1 / 2');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(frontTitle()).toBe('Customers');
  });

  it('a category with one page has no arrows to press', () => {
    render(<ProductTourSection />);
    fireEvent.click(screen.getByRole('button', { name: /^Inventory/ }));
    expect(frontTitle()).toBe('Inventory valuation');
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
  });

  it('shows no profit & loss or inventory list page', () => {
    render(<ProductTourSection />);
    const all = [...document.querySelectorAll('button[aria-label^="Show "]')].map((b) => b.getAttribute('aria-label'));
    expect(all).toEqual([
      'Show Dashboard',
      'Show Invoices',
      'Show Customers',
      'Show Bills',
      'Show Inventory valuation',
      'Show Analytics',
    ]);
  });
});
