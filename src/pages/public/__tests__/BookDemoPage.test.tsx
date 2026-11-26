// @vitest-environment jsdom

// /book-demo: Pakistani mobile numbers only, consent required, a time chosen
// from the server's slots (Pakistan time, grouped by day and part of the day),
// business details as tappable choices, the honeypot sent as typed so the
// server can drop bots, and the server's form token passed back. A slot taken
// meanwhile clears the choice and reloads the times.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/networks/launch/launchNetwork', async (orig) => ({
  ...(await orig<typeof import('@/networks/launch/launchNetwork')>()),
  getDemoSlots: vi.fn(),
  bookDemo: vi.fn(),
  getPublicConfig: vi.fn(async () => ({
    signupMode: 'trial',
    trialAutoApprove: true,
    trialDays: 30,
    demoBookingEnabled: true,
    supportEmail: 'help@example.com',
    supportWhatsapp: '+92 300 1112223',
    turnstileSiteKey: '',
  })),
}));

import { groupSlots, PK_MOBILE, slotPeriod, slotsByPeriod, slotTimeLabel } from '@/models/demoBooking';
import * as launch from '@/networks/launch/launchNetwork';
import { ApiError } from '@/networks/network/apiHelpers';
import BookDemoPage from '@/pages/public/BookDemoPage';
import { renderScreen } from '@/test/launchHarness';

// Mon 7 Dec 2026 and Tue 8 Dec, Pakistan time (UTC+5).
const SLOTS = [
  { at: '2026-12-07T05:00:00.000Z', date: '2026-12-07', time: '10:00' },
  { at: '2026-12-07T05:30:00.000Z', date: '2026-12-07', time: '10:30' },
  { at: '2026-12-07T09:00:00.000Z', date: '2026-12-07', time: '14:00' },
  { at: '2026-12-08T12:30:00.000Z', date: '2026-12-08', time: '17:30' },
];

beforeEach(() => {
  vi.mocked(launch.getDemoSlots).mockReset();
  vi.mocked(launch.bookDemo).mockReset();
  vi.mocked(launch.getDemoSlots).mockResolvedValue({
    timezone: 'Asia/Karachi',
    minutes: 30,
    formToken: 'signed-token',
    slots: SLOTS,
  });
});

describe('booking helpers', () => {
  it('accepts Pakistani mobiles in their usual spellings, nothing else', () => {
    for (const ok of ['03001234567', '+923001234567', '923001234567']) expect(PK_MOBILE.test(ok)).toBe(true);
    for (const bad of ['0300123456', '04235761234', '+443001234567', '003001234567', '3001234567']) {
      expect(PK_MOBILE.test(bad)).toBe(false);
    }
  });
  it('groups slots by Pakistan date, then by part of the day', () => {
    expect(groupSlots(SLOTS).map((d) => [d.date, d.slots.length])).toEqual([
      ['2026-12-07', 3],
      ['2026-12-08', 1],
    ]);
    expect(slotsByPeriod(groupSlots(SLOTS)[0].slots).map((g) => [g.period, g.slots.length])).toEqual([
      ['morning', 2],
      ['afternoon', 1],
    ]);
    expect(slotPeriod('17:30')).toBe('evening');
    expect(slotTimeLabel('2026-12-07T09:00:00.000Z')).toBe('2:00 pm');
  });
});

const show = (at = '/book-demo') => renderScreen(<BookDemoPage />, { path: '/book-demo', at });
const type = (label: string, value: string) => fireEvent.input(screen.getByLabelText(label), { target: { value } });

async function fillValid() {
  const grid = await screen.findByTestId('slot-grid');
  fireEvent.click(within(grid).getByRole('button', { name: '10:30 am' }));
  type('Full name', 'Ayesha Khan');
  type('Business name', 'Khan Traders');
  type('Mobile number', '0300 123 4567');
  type('Email', 'ayesha@example.com');
  type('City', 'Lahore');
  fireEvent.click(screen.getByRole('radio', { name: 'Retail' }));
  fireEvent.click(screen.getByRole('checkbox', { name: /agree to be contacted/i }));
}

describe('BookDemoPage', () => {
  it('shows the days with free-time counts and the times by part of the day', async () => {
    show();
    const grid = await screen.findByTestId('slot-grid');
    expect(within(grid).getByText('Morning')).toBeInTheDocument();
    expect(within(grid).getByText('Afternoon')).toBeInTheDocument();
    expect(within(grid).getAllByRole('button')).toHaveLength(3);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveTextContent('3 free');
    fireEvent.click(tabs[1]);
    await waitFor(() => expect(within(screen.getByTestId('slot-grid')).getByText('Evening')).toBeInTheDocument());
    expect(within(screen.getByTestId('slot-grid')).getByRole('button')).toHaveTextContent('5:30 pm');
  });

  it('picking a time shows it back in words', async () => {
    show();
    const grid = await screen.findByTestId('slot-grid');
    fireEvent.click(within(grid).getByRole('button', { name: '2:00 pm' }));
    expect(screen.getByTestId('slot-summary')).toHaveTextContent('Monday 7 December at 2:00 pm · 30 min');
    expect(within(grid).getByRole('button', { name: '2:00 pm' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('refuses an empty form, a non-Pakistani number and a missing consent — nothing is sent', async () => {
    show();
    await screen.findByTestId('slot-grid');
    type('Mobile number', '+44 7700 900123');
    fireEvent.click(screen.getByRole('button', { name: 'Book my demo' }));
    expect(await screen.findByText(/valid Pakistani mobile/i)).toBeInTheDocument();
    expect(screen.getByText('Choose a time for your demo.')).toBeInTheDocument();
    expect(screen.getByText('Choose your type of business.')).toBeInTheDocument();
    expect(screen.getByText(/agree to be contacted about your demo/i)).toBeInTheDocument();
    expect(launch.bookDemo).not.toHaveBeenCalled();
  });

  it('choices behave as radios; optional ones can be cleared', async () => {
    show();
    await screen.findByTestId('slot-grid');
    const size = screen.getByRole('radio', { name: '6–20' });
    fireEvent.click(size);
    expect(size).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(size);
    expect(size).toHaveAttribute('aria-checked', 'false');
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

  it('a valid booking sends the time, choices, form token and UTM, then explains what happens next', async () => {
    vi.mocked(launch.bookDemo).mockResolvedValue({ received: true });
    show('/book-demo?utm_source=facebook&utm_campaign=launch');
    await fillValid();
    fireEvent.click(screen.getByRole('radio', { name: 'Tally' }));
    fireEvent.click(screen.getByRole('button', { name: 'Book my demo' }));
    expect(await screen.findByRole('heading', { name: 'Your demo request is in' })).toBeInTheDocument();
    expect(screen.getByTestId('done-time')).toHaveTextContent('Monday 7 December at 10:30 am');
    expect(screen.getByText('What happens next')).toBeInTheDocument();
    const sent = vi.mocked(launch.bookDemo).mock.calls[0][0];
    expect(sent).toMatchObject({
      fullName: 'Ayesha Khan',
      phone: '0300 123 4567',
      email: 'ayesha@example.com',
      city: 'Lahore',
      businessType: 'retail',
      currentSystem: 'tally',
      slot: SLOTS[1].at,
      consent: true,
      website: '',
      formToken: 'signed-token',
      utm: { source: 'facebook', campaign: 'launch' },
    });
    expect(sent).not.toHaveProperty('language');
    expect(screen.getByRole('link', { name: /add to calendar/i }).getAttribute('href')).toMatch(/^data:text\/calendar/);
    expect(screen.getByRole('link', { name: /start your free trial/i })).toHaveAttribute('href', '/register');
  });

  it('a time taken meanwhile: says so, clears the choice and reloads the times', async () => {
    vi.mocked(launch.bookDemo).mockRejectedValue(new ApiError('Taken', 'DEMO_SLOT_TAKEN', 409));
    show();
    await fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Book my demo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/just taken/i);
    await waitFor(() => expect(launch.getDemoSlots).toHaveBeenCalledTimes(2));
    for (const b of within(screen.getByTestId('slot-grid')).getAllByRole('button')) {
      expect(b).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('offers WhatsApp and email for anyone who would rather talk', async () => {
    show();
    expect(await screen.findByRole('link', { name: /whatsapp us/i })).toHaveAttribute('href', 'https://wa.me/923001112223');
    expect(screen.getByRole('link', { name: /help@example.com/i })).toHaveAttribute('href', 'mailto:help@example.com');
  });
});
