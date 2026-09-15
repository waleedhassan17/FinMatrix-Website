/**
 * The only contact address on record for FinMatrix, carried over from the
 * reference project. Swap it for a support inbox before launch — a public
 * address that bounces is worse than none. The FAQ and the footer both read it,
 * so it changes in one place.
 */
export const CONTACT_EMAIL = 'waleedhassansfd@gmail.com';

/** Who is behind FinMatrix, named in the footer's Contact column. */
export const OWNER_NAME = 'Muhammad Waleed Hassan';

/** WhatsApp, as a Pakistani mobile number. The footer builds the wa.me link from it. */
export const CONTACT_WHATSAPP = '03124890176';

/** The same number grouped for reading: 0312 4890176. */
export const CONTACT_WHATSAPP_DISPLAY = `${CONTACT_WHATSAPP.slice(0, 4)} ${CONTACT_WHATSAPP.slice(4)}`;
