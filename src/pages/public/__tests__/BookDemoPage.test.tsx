// @vitest-environment jsdom

// /book-demo: Pakistani mobile numbers only, consent required, a slot chosen
// from the server's grid (Pakistan time, grouped by day), the honeypot sent
// as typed so the server can drop bots, and the server's form token passed
// back. A slot taken meanwhile clears the choice and reloads the grid.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Radix Select needs pointer capture jsdom lacks; a native select keeps the
// form logic under test.
vi.mock('@/components/ui/Select', () => ({
  Select: ({ label, value, onChange, options, error }: {
    label?: string;
    value: string;
    onChange: (v: string) => void;
    options: Array<{ value: string; label: string }>;
    error?: string;
  }) => (
    <label>
      {label}
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <span>{error}</span>}
    </label>
  ),
}));

vi.mock('@/networks/launch/launchNetwork', async (orig) => ({
  ...(await orig<typeof import('@/networks/launch/launchNetwork')>()),
  getDemoSlots: vi.fn(),
  bookDemo: vi.fn(),
}));

import { setLang } from '@/i18n/lang';
import * as launch from '@/networks/launch/launchNetwork';
import { ApiError } from '@/networks/network/apiHelpers';
import { groupSlots, PK_MOBILE } from '@/models/demoBooking';
import BookDemoPage from '@/pages/public/BookDemoPage';
import { renderScreen } from '@/test/launchHarness';

// Mon 7 Dec 2026 and Tue 8 Dec, Pakistan time (UTC+5).
const SLOTS = [
  { at: '2026-12-07T05:00:00.000Z', date: '2026-12-07', time: '10:00' },
  { at: '2026-12-07T05:30:00.000Z', date: '2026-12-07', time: '10:30' },
  { at: '2026-12-08T09:00:00.000Z', date: '2026-12-08', time: '14:00' },
];

beforeEach(() => {
  vi.clearAllMocks();
  setLang('en');
  vi.mocked(launch.getDemoSlots).mockResolvedValue({
    timezone: 'Asia/Karachi',
    minutes: 30,
    formToken: 'signed-token',
    slots: SLOTS,
  });
});

describe('PK_MOBILE and groupSlots', () => {
  it('accepts Pakistani mobiles in their usual spellings, nothing else', () => {
    for (const ok of ['03001234567', '+923001234567', '923001234567']) expect(PK_MOBILE.test(ok)).toBe(true);
    for (const bad of ['0300123456', '04235761234', '+443001234567', '003001234567', '3001234567']) {
      expect(PK_MOBILE.test(bad)).toBe(false);
    }
  });
  it('groups slots by their Pakistan date, in order', () => {
    expect(groupSlots(SLOTS).map((d) => [d.date, d.slots.length])).toEqual([
      ['2026-12-07', 2],
      ['2026-12-08', 1],
    ]);
  });
});

const show = (at = '/book-demo') => renderScreen(<BookDemoPage />, { path: '/book-demo', at });
const type = (label: string, value: string) =>
  fireEvent.input(screen.getByLabelText(label), { target: { value } });

async function fillValid() {
  type('Full name', 'Ayesha Khan');
  type('Business name', 'Khan Traders');
  type('Mobile number', '0300 123 4567');
  type('Email', 'ayesha@example.com');
  type('City', 'Lahore');
  fireEvent.change(screen.getByLabelText('Business type'), { target: { value: 'retail' } });
  const grid = await screen.findByTestId('slot-grid');
  fireEvent.click(within(grid).getAllByRole('button')[1]);
  fireEvent.click(screen.getByRole('checkbox'));
}

describe('BookDemoPage', () => {
  it('shows the server slots by day; switching day switches the grid', async () => {
    show();
    const grid = await screen.findByTestId('slot-grid');
    expect(within(grid).getAllByRole('button')).toHaveLength(2);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    fireEvent.click(tabs[1]);
    await waitFor(() => expect(within(screen.getByTestId('slot-grid')).getAllByRole('button')).toHaveLength(1));
    expect(within(screen.getByTestId('slot-grid')).getByRole('button')).toHaveTextContent(/2:00\s*pm/i);
  });

  it('refuses an empty form, a non-Pakistani number and a missing consent — nothing is sent', async () => {
    show();
    await screen.findByTestId('slot-grid');
    type('Mobile number', '+44 7700 900123');
    fireEvent.click(screen.getByRole('button', { name: 'Book my demo' }));
    expect(await screen.findByText(/pakistani mobile/i)).toBeInTheDocument();
    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
    expect(launch.bookDemo).not.toHaveBeenCalled();
  });

  it('the honeypot is hidden from people and passed through as typed', async () => {
    show();
    await screen.findByTestId('slot-grid');
    const trap = screen.getByLabelText('Website', { selector: 'input' });
    expect(trap).toHaveAttribute('tabindex', '-1');
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
    vi.mocked(launch.bookDemo).mockResolvedValue({ received: true });
    await fillValid();
    fireEvent.input(trap, { target: { value: 'http://spam.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Book my demo' }));
    await waitFor(() => expect(launch.bookDemo).toHaveBeenCalled());
    expect(vi.mocked(launch.bookDemo).mock.calls[0][0].website).toBe('http://spam.example');
  });

  it('a valid booking sends the slot, form token and UTM, then confirms', async () => {
    vi.mocked(launch.bookDemo).mockResolvedValue({ received: true });
    show('/book-demo?utm_source=facebook&utm_campaign=launch');
    await screen.findByTestId('slot-grid');
    await fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Book my demo' }));
    expect(await screen.findByRole('heading', { name: 'Your demo request is in' })).toBeInTheDocument();
    const sent = vi.mocked(launch.bookDemo).mock.calls[0][0];
    expect(sent).toMatchObject({
      fullName: 'Ayesha Khan',
      phone: '0300 123 4567',
      email: 'ayesha@example.com',
      city: 'Lahore',
      businessType: 'retail',
      slot: SLOTS[1].at,
      consent: true,
      website: '',
      formToken: 'signed-token',
      language: 'en',
      utm: { source: 'facebook', campaign: 'launch' },
    });
    expect(screen.getByRole('link', { name: /add requested time to calendar/i }).getAttribute('href')).toMatch(
      /^data:text\/calendar/,
    );
  });

  it('a slot taken meanwhile: says so, clears the choice and reloads the slots', async () => {
    vi.mocked(launch.bookDemo).mockRejectedValue(new ApiError('Taken', 'DEMO_SLOT_TAKEN', 409));
    show();
    await screen.findByTestId('slot-grid');
    await fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Book my demo' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await waitFor(() => expect(launch.getDemoSlots).toHaveBeenCalledTimes(2));
    for (const b of within(screen.getByTestId('slot-grid')).getAllByRole('button')) {
      expect(b).toHaveAttribute('aria-pressed', 'false');
    }
  });
});
