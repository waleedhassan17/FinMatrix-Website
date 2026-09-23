// ═══════════════════════════════════════════════════════
// FinMatrix — public contact details
// ═══════════════════════════════════════════════════════
// A LIST, not the support@/sales@ split that stood here before. Those addresses
// were on a domain nobody owns yet, so every one of them bounced. Two addresses
// that work beat two that look tidier and go nowhere.
//
// THE PAGE SAYS NOTHING ABOUT WHO IS BEHIND THEM. An earlier draft introduced
// these as the founders' addresses; that is a fact the company knows about
// itself and does not announce. Naming the size of the team is not a thing
// enterprise software does on its contact card, and a buyer is asking where to
// write, not how many people will read it.
//
// NO NAMES HERE ON PURPOSE either. Only addresses were given, and a person's
// name guessed from the local part of their email is not something to publish.

/** Both addresses, in the order they should be listed. Either reaches a person. */
export const CONTACT_EMAILS = [
  'waleedhassansfd@gmail.com',
  'zaidvirk49@gmail.com',
] as const;

/** Where a single link has to go — the FAQ card's headline address. */
export const CONTACT_EMAIL_PRIMARY = CONTACT_EMAILS[0];

/**
 * Recipient list for a `mailto:`.
 *
 * RFC 6068 allows a comma-separated `to`, and every mail client in use honours
 * it, so one demo request arrives with both founders on it rather than being
 * routed to whichever of us the visitor happened to pick.
 */
export const CONTACT_EMAILS_MAILTO = CONTACT_EMAILS.join(',');

/**
 * WhatsApp, in E.164 with the country code.
 *
 * It was stored and displayed as a local Pakistani mobile ('03124890176',
 * shown as '0312 4890176'), which only resolves for a reader already in
 * Pakistan — the exact reader this page is no longer written for. The number is
 * unchanged; only its form is.
 */
export const CONTACT_WHATSAPP = '+923124890176';

/** The same number grouped for reading: +92 312 489 0176. */
export const CONTACT_WHATSAPP_DISPLAY = '+92 312 489 0176';

/**
 * Where the company is. Kept, and kept quiet — in the footer rather than the
 * hero. A vendor whose location cannot be established anywhere reads as evasive
 * to anyone running diligence; a vendor that leads with it reads as local-only.
 */
export const COMPANY_ORIGIN = 'Built in Pakistan · Working worldwide';
