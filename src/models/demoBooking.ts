// ═══════════════════════════════════════════════════════
// FinMatrix Web — Book a Demo helpers
// ═══════════════════════════════════════════════════════

import type { DemoSlot } from '@/networks/launch/launchNetwork';

export const CITY_SUGGESTIONS = [
  'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar',
  'Quetta', 'Gujranwala', 'Sialkot', 'Hyderabad', 'Sargodha', 'Bahawalpur', 'Sukkur',
];

/** Pakistani mobile: 03XX XXXXXXX, +92 3XX…, 92 3XX… */
export const PK_MOBILE = /^(?:\+?92|0)3\d{9}$/;

/** Slots grouped by their Pakistan calendar date. */
export function groupSlots(slots: DemoSlot[]): Array<{ date: string; slots: DemoSlot[] }> {
  const map = new Map<string, DemoSlot[]>();
  for (const s of slots) map.set(s.date, [...(map.get(s.date) ?? []), s]);
  return [...map.entries()].map(([date, list]) => ({ date, slots: list }));
}

export type SlotPeriod = 'morning' | 'afternoon' | 'evening';

/** Which part of the day a PKT "HH:MM" time falls in, for grouping the times. */
export const slotPeriod = (time: string): SlotPeriod => {
  const hour = Number(time.slice(0, 2));
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
};

export const PERIOD_LABEL: Record<SlotPeriod, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

/** A day's times split into morning / afternoon / evening, empty groups dropped. */
export function slotsByPeriod(slots: DemoSlot[]): Array<{ period: SlotPeriod; slots: DemoSlot[] }> {
  const order: SlotPeriod[] = ['morning', 'afternoon', 'evening'];
  return order
    .map((period) => ({ period, slots: slots.filter((s) => slotPeriod(s.time) === period) }))
    .filter((g) => g.slots.length > 0);
}

/** "Wed", "3", "Dec" for a PKT calendar date (YYYY-MM-DD). */
export function dayParts(date: string): { weekday: string; day: string; month: string } {
  const d = new Date(`${date}T12:00:00+05:00`);
  const part = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { ...o, timeZone: 'Asia/Karachi' }).format(d);
  return { weekday: part({ weekday: 'short' }), day: part({ day: 'numeric' }), month: part({ month: 'short' }) };
}

/** "11:30 am" in Pakistan time. */
export const slotTimeLabel = (at: string): string =>
  new Date(at)
    .toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' })
    .replace(/\s?([ap])\.?m\.?$/i, ' $1m')
    .toLowerCase();

/** "Wednesday 3 December at 11:30 am" in Pakistan time. */
export const slotLongLabel = (at: string): string => {
  const d = new Date(at);
  const date = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Karachi',
  }).format(d);
  return `${date} at ${slotTimeLabel(at)}`;
};
