// ═══════════════════════════════════════════════════════
// FinMatrix — public site facts
// ═══════════════════════════════════════════════════════
// The single source for how FinMatrix describes itself in public: the business
// facts every page repeats, and the list of public pages with the title and
// description each one carries.
//
// Pure data, no React. The router, the build-time prerender
// (scripts/prerender.mjs), the sitemap and the tests all import this file, so a
// page cannot be added to one of them and forgotten in the others.
//
// EVERY FACT HERE IS ONE THE OWNER HAS CONFIRMED. Nothing is filled in to look
// complete. There is deliberately no legal entity name, registration number or
// street address: FinMatrix has none to publish yet, and an invented one is
// exactly what a reviewer (or Meta) is checking for. When they exist, add them
// here and render them on /about and /contact.

/** The live origin. Every canonical, og:url and sitemap entry is built on it. */
export const SITE_URL = 'https://finmatrix-theta.vercel.app';

/** The same truthful description everywhere: homepage, About, Contact, metadata. */
export const BUSINESS = {
  name: 'FinMatrix',
  type: 'ERP software (software as a service)',
  industry: 'Information technology / software development',
  model: 'Business management software provider',
  country: 'Pakistan',
  website: `${SITE_URL}/`,
  /** One sentence, reused as the default description. */
  summary:
    'FinMatrix is ERP software for businesses: one integrated system for inventory, sales, purchases, accounting, deliveries and business reporting.',
  /**
   * What FinMatrix is NOT. Shown on the homepage and /about because the name
   * starts with "Fin" and the product handles invoices and payments, so a
   * reader (or an automated reviewer) could take it for a financial service.
   */
  notAFinancialService:
    'FinMatrix is business software. It is not a bank, lender, investment or brokerage firm, payment provider or financial institution. It records the transactions a business makes; it does not hold, move or lend anyone’s money.',
} as const;

export interface PublicPage {
  /** The URL path, as routed. */
  path: string;
  /** <title>; keep it under ~65 characters. */
  title: string;
  /** <meta name="description">; one or two plain sentences. */
  description: string;
  /**
   * Where the canonical link points. Usually the page's own path; /privacy is
   * the older address of /privacy-policy and points there.
   */
  canonical: string;
  /** Listed in sitemap.xml. False for aliases. */
  inSitemap: boolean;
  /** ISO date of the last content change, for the sitemap's <lastmod>. */
  updated: string;
}

/**
 * Every page a visitor can open without an account, and that a crawler should
 * be able to read without running JavaScript. Each one is prerendered to static
 * HTML at build time.
 */
export const PUBLIC_PAGES: readonly PublicPage[] = [
  {
    path: '/',
    title: 'FinMatrix — ERP software for inventory, sales, accounting and deliveries',
    description:
      'FinMatrix is ERP software that brings inventory, sales, purchases, accounting, deliveries and business reporting into one integrated system. Web console and Android app.',
    canonical: '/',
    inSitemap: true,
    updated: '2026-11-08',
  },
  {
    path: '/about',
    title: 'About FinMatrix — ERP software for businesses',
    description:
      'What FinMatrix is, who it is for and what it is not: business management software from Pakistan, not a bank or payment provider.',
    canonical: '/about',
    inSitemap: true,
    updated: '2026-11-08',
  },
  {
    path: '/contact',
    title: 'Contact FinMatrix',
    description:
      'Email or WhatsApp the FinMatrix team about the software, your account, privacy or data deletion.',
    canonical: '/contact',
    inSitemap: true,
    updated: '2026-11-08',
  },
  {
    path: '/privacy-policy',
    title: 'Privacy policy — FinMatrix',
    description:
      'What information FinMatrix collects, how it is used, stored and shared, how long it is kept, and the choices you have.',
    canonical: '/privacy-policy',
    inSitemap: true,
    updated: '2026-11-08',
  },
  {
    path: '/privacy',
    title: 'Privacy policy — FinMatrix',
    description:
      'What information FinMatrix collects, how it is used, stored and shared, how long it is kept, and the choices you have.',
    canonical: '/privacy-policy',
    inSitemap: false,
    updated: '2026-11-08',
  },
  {
    path: '/terms-of-service',
    title: 'Terms of service — FinMatrix',
    description:
      'The terms for using FinMatrix ERP software: the service, accounts, acceptable use, billing, suspension, liability and support.',
    canonical: '/terms-of-service',
    inSitemap: true,
    updated: '2026-11-08',
  },
  {
    path: '/acceptable-use-policy',
    title: 'Acceptable use and WhatsApp messaging policy — FinMatrix',
    description:
      'What FinMatrix may and may not be used for, and the rules for WhatsApp messages sent through FinMatrix: transactional only, with consent, and STOP to opt out.',
    canonical: '/acceptable-use-policy',
    inSitemap: true,
    updated: '2026-11-08',
  },
  {
    path: '/data-deletion',
    title: 'Deleting your data — FinMatrix',
    description:
      'How to have your FinMatrix account and your company’s records deleted, and what to do if a business sent you documents through FinMatrix.',
    canonical: '/data-deletion',
    inSitemap: true,
    updated: '2026-11-06',
  },
];

/** The defaults index.html carries, restored when a public page unmounts. */
export const DEFAULT_PAGE: PublicPage = PUBLIC_PAGES[0];

export const publicPageFor = (path: string): PublicPage | undefined =>
  PUBLIC_PAGES.find((p) => p.path === path);

/** Absolute URL for a site path. */
export const absoluteUrl = (path: string): string =>
  path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`;
