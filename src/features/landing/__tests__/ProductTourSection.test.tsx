// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProductTourSection } from '@/features/landing/ProductTourSection';

const frontTitle = () => screen.getByRole('heading', { level: 3 }).textContent;
const counter = () => screen.getByText(/^\d+ \/ \d+$/).textContent;
/** Every stacked screenshot, by file name, whether or not it is in front. */
const shot = (name: string) => document.querySelector<HTMLImageElement>(`img[src="/screenshots/${name}.webp"]`)!;
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

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

  describe('moving between pages never blinks', () => {
    it('keeps the same card and every screenshot mounted from page to page', () => {
      render(<ProductTourSection />);
      const card = document.querySelector('figure');
      expect(document.querySelectorAll('figure img')).toHaveLength(6);
      next();
      fireEvent.click(screen.getByRole('button', { name: /^Reports/ }));
      expect(document.querySelector('figure')).toBe(card);
      expect(document.querySelectorAll('figure img')).toHaveLength(6);
    });

    it('only the front page’s screenshot is announced, and it follows the page at once', () => {
      render(<ProductTourSection />);
      next();
      const img = screen.getByRole('img');
      expect(img.getAttribute('src')).toBe('/screenshots/invoices.webp');
      expect(img.getAttribute('alt')).toMatch(/invoice list/);
    });

    it('holds the last screenshot until the next one has loaded, then swaps', async () => {
      render(<ProductTourSection />);
      fireEvent.load(shot('dashboard'));
      await waitFor(() => expect(shot('dashboard').dataset.state).toBe('shown'));

      next();
      expect(frontTitle()).toBe('Invoices');
      expect(shot('dashboard').dataset.state).toBe('shown');
      expect(shot('invoices').dataset.state).toBe('hidden');

      fireEvent.load(shot('invoices'));
      await waitFor(() => expect(shot('invoices').dataset.state).toBe('shown'));
      expect(shot('dashboard').dataset.state).toBe('hidden');
    });

    it('a screenshot that fails to load does not stall the deck', async () => {
      render(<ProductTourSection />);
      fireEvent.load(shot('dashboard'));
      next();
      fireEvent.error(shot('invoices'));
      await waitFor(() => expect(shot('invoices').dataset.state).toBe('shown'));
    });

    it('shows one screenshot at a time', async () => {
      render(<ProductTourSection />);
      for (const img of document.querySelectorAll('figure img')) fireEvent.load(img);
      next();
      next();
      await waitFor(() => expect(shot('customers').dataset.state).toBe('shown'));
      expect(document.querySelectorAll('figure img[data-state="shown"]')).toHaveLength(1);
    });
  });
});
