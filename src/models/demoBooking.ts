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
