// ═══════════════════════════════════════════════════════
// FinMatrix — Pakistani phone validation + normalisation
// ═══════════════════════════════════════════════════════
// Mirror of the backend's src/common/validation/phone.ts (and of the app's
// src/utils/phone.ts, which this is copied from). Keep the three in
// sync: the client validates so the user gets an instant, friendly message
// in the form, and normalises so the server is only ever sent the canonical
// shape it stores — +92XXXXXXXXXX (E.164, e.g. +923124890176).
//
// Accepts every way a Pakistani number is actually typed:
//   03124890176 · +923124890176 · 923124890176 · 0312-4890176 · +92 312 4890176

/** Canonical mobile: +92 3XX XXXXXXX (Pakistani mobiles always start with 3). */
const PK_MOBILE_CANONICAL = /^\+923\d{9}$/;

/** Canonical landline: +92 <area, never starting with 3> <subscriber>. */
const PK_LANDLINE_CANONICAL = /^\+92(?!3)[2-9]\d{8,10}$/;

/**
 * Reduce anything the user typed to `+92XXXXXXXXXX`.
 *
 * Returns `undefined` for blank input so callers can omit the field entirely
 * rather than posting `''` — an empty string is not `undefined`, so the
 * server's `@IsOptional()` would not skip it and a blank optional phone
 * would fail validation.
 *
 * Unrecognised input comes back stripped but otherwise unchanged, so the
 * validators below can reject it with a friendly message instead of the
 * value being silently mangled.
 */
export function normalizePkPhone(raw: string | null | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;

  const stripped = raw.replace(/[\s\-().]/g, '');
  if (stripped === '') return undefined;

  if (/^0\d+$/.test(stripped)) return `+92${stripped.slice(1)}`;
  if (/^92\d+$/.test(stripped)) return `+${stripped}`;
  return stripped;
}

/** True for a valid Pakistani MOBILE number in any accepted input format. */
export function isValidPkMobile(raw: string | null | undefined): boolean {
  const n = normalizePkPhone(raw);
  return n !== undefined && PK_MOBILE_CANONICAL.test(n);
}

/** True for a valid Pakistani mobile OR landline in any accepted input format. */
export function isValidPkPhone(raw: string | null | undefined): boolean {
  const n = normalizePkPhone(raw);
  return (
    n !== undefined &&
    (PK_MOBILE_CANONICAL.test(n) || PK_LANDLINE_CANONICAL.test(n))
  );
}

/**
 * Canonical form → a readable local form for display only.
 *   +923124890176 → 0312 4890176
 *   +924235761234 → 042 35761234
 * Anything not recognisably Pakistani is returned untouched.
 */
export function formatPkPhoneForDisplay(raw: string | null | undefined): string {
  const n = normalizePkPhone(raw);
  if (!n) return '';
  if (PK_MOBILE_CANONICAL.test(n)) {
    const nsn = n.slice(3); // 3124890176
    return `0${nsn.slice(0, 3)} ${nsn.slice(3)}`;
  }
  if (PK_LANDLINE_CANONICAL.test(n)) {
    const nsn = n.slice(3);
    // Area codes are 2 digits for the big cities (21/42/51), 3 otherwise.
    const areaLen = ['21', '42', '51'].includes(nsn.slice(0, 2)) ? 2 : 3;
    return `0${nsn.slice(0, areaLen)} ${nsn.slice(areaLen)}`;
  }
  return raw ?? '';
}

/** The message to show when a mobile-only field fails. */
export const PK_MOBILE_MESSAGE =
  'Enter a valid Pakistani mobile number (e.g. 0312 3456789)';

/** The message to show when a field accepting landlines fails. */
export const PK_PHONE_MESSAGE =
  'Enter a valid Pakistani phone number (e.g. 0312 3456789 or 042 35761234)';
