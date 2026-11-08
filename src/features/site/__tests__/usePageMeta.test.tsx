// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_PAGE, SITE_URL, publicPageFor } from '@/features/site/siteMeta';
import { usePageMeta } from '@/features/site/usePageMeta';
import NotFoundPage from '@/pages/site/NotFoundPage';

function Probe({ path }: { path: string }) {
  usePageMeta(publicPageFor(path));
  return null;
}

const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href');
const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content');

afterEach(() => {
  document.head.innerHTML = '';
  document.title = '';
});

describe('usePageMeta', () => {
  it('sets the page title, description and canonical', () => {
    render(<Probe path="/terms-of-service" />);
    expect(document.title).toBe('Terms of service — FinMatrix');
    expect(canonical()).toBe(`${SITE_URL}/terms-of-service`);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toMatch(/terms/i);
  });

  it('points the old /privacy address at /privacy-policy', () => {
    render(<Probe path="/privacy" />);
    expect(canonical()).toBe(`${SITE_URL}/privacy-policy`);
  });

  it('leaves the app shell defaults, with no canonical, on unmount', () => {
    const { unmount } = render(<Probe path="/about" />);
    unmount();
    expect(document.title).toBe(DEFAULT_PAGE.title);
    expect(canonical()).toBeUndefined();
  });
});

describe('the public 404', () => {
  it('says the page was not found, offers a way on, and asks not to be indexed', () => {
    render(
      <MemoryRouter initialEntries={['/no-such-page']}>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
    expect(screen.getByText('/no-such-page')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the homepage' }).getAttribute('href')).toBe('/');
    expect(robots()).toBe('noindex');
  });
});
