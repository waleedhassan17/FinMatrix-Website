// @vitest-environment node
//
// ═══════════════════════════════════════════════════════
// The public site: what a reviewer without JavaScript sees
// ═══════════════════════════════════════════════════════
// Renders every public page exactly as the build does (src/prerender/entry.tsx
// → scripts/prerender.mjs) and checks what it says, and that the files the
// host serves (vercel.json, robots.txt, index.html) agree with siteMeta.ts.
//
// Why these checks exist: FinMatrix applies to Meta's WhatsApp Business
// Platform, whose review reads this site. A page that oversells, claims to be a
// financial service, or says WhatsApp messaging is live before it is would be
// both untrue and a reason to be refused. If a check here fails, fix the copy,
// not the pattern.

import { describe, expect, it } from 'vitest';

// Read through Vite rather than node:fs: this file is type-checked with the
// app's browser-only tsconfig, which has no Node types.
import indexHtml from '../../../../index.html?raw';
import packageJson from '../../../../package.json?raw';
import robotsTxt from '../../../../public/robots.txt?raw';
import vercelJson from '../../../../vercel.json?raw';
import tourSource from '../../landing/ProductTourSection.tsx?raw';

import { CONTACT_EMAILS, CONTACT_WHATSAPP_DISPLAY } from '@/features/landing/constants';
import { BUSINESS, DEFAULT_PAGE, PUBLIC_PAGES, SITE_URL } from '@/features/site/siteMeta';
import { PRERENDER_PATHS, render } from '@/prerender/entry';

/** Files under public/screenshots, as "/screenshots/<name>". */
const SCREENSHOTS = Object.keys(import.meta.glob('../../../../public/screenshots/*.webp')).map((k) =>
  k.replace(/^.*\/public/, ''),
);

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&[a-z]+;|&#\d+;/g, ' ')
    .replace(/\s+/g, ' ');

const rendered = new Map<string, string>();
const pageText = async (p: string) => {
  if (!rendered.has(p)) rendered.set(p, textOf(await render(p)));
  return rendered.get(p) as string;
};

/** Banned on every public page. Same reasons as landingHonesty.test.tsx. */
const BANNED: [RegExp, string][] = [
  [/\bFBR\b/i, 'tax-authority compliance claim'],
  [/tax[- ]ready|tax compliance/i, 'tax-authority compliance claim'],
  [/trusted by/i, 'invented social proof'],
  [/\d+\s*\+?\s*(active )?(users|businesses|customers|companies)\b/i, 'invented usage figure'],
  [/most popular/i, 'popularity claim with no figures behind it'],
  [/\b(99\.9|99)%\s*uptime/i, 'uptime claim with no SLA behind it'],
  [/bank[- ]grade/i, 'unsubstantiated security claim'],
  [/\bcertified\b|\bISO \d+/i, 'certification FinMatrix does not hold'],
  [/(licensed|regulated|authori[sz]ed) by/i, 'regulatory status FinMatrix does not have'],
  [/partner(ed)? with (meta|whatsapp|facebook)|official (meta|whatsapp) partner/i, 'partnership that does not exist'],
  [/instant(ly)? (access|approval|activation)/i, 'accounts are reviewed by a person'],
  [/FinMatrix is (a |an )?(bank|lender|payment (provider|processor)|financial institution|wallet)\b/i, 'financial-service self-description'],
];

describe('every public page', () => {
  it('is registered for prerendering', () => {
    expect([...PRERENDER_PATHS].sort()).toEqual(PUBLIC_PAGES.map((p) => p.path).sort());
  });

  it.each(PUBLIC_PAGES.map((p) => p.path))('%s renders an h1 and real content', async (p) => {
    const html = await render(p);
    expect(html).toMatch(/<h1[^>]*>[^<]+/);
    expect(textOf(html).split(' ').length).toBeGreaterThan(150);
  });

  it.each(PUBLIC_PAGES.map((p) => p.path))('%s makes no claim FinMatrix cannot stand behind', async (p) => {
    const text = await pageText(p);
    for (const [pattern, why] of BANNED) {
      expect(text, `${p}: ${why}`).not.toMatch(pattern);
    }
  });

  it.each(PUBLIC_PAGES.map((p) => p.path))('%s links to the policies from its footer', async (p) => {
    const html = await render(p);
    for (const href of ['/privacy-policy', '/terms-of-service', '/acceptable-use-policy', '/contact', '/about']) {
      expect(html, `${p} → ${href}`).toContain(`href="${href}"`);
    }
    expect(html).not.toMatch(/href="#"/);
  });
});

describe('what FinMatrix is', () => {
  it('the homepage names the category in its headline', async () => {
    const html = await render('/');
    const h1 = textOf(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '');
    expect(h1).toMatch(/ERP/);
  });

  it.each(['/', '/about'])('%s says plainly that it is not a financial service', async (p) => {
    const text = await pageText(p);
    expect(text).toMatch(/not a bank, lender, investment or brokerage firm, payment provider or financial institution/);
  });

  it('/about states the business facts', async () => {
    const text = await pageText('/about');
    for (const fact of [BUSINESS.name, BUSINESS.type, BUSINESS.industry, BUSINESS.model, BUSINESS.country, BUSINESS.website]) {
      expect(text).toContain(fact);
    }
  });

  it('/contact lists every working channel and invents none', async () => {
    const text = await pageText('/contact');
    for (const email of CONTACT_EMAILS) expect(text).toContain(email);
    expect(text).toContain(CONTACT_WHATSAPP_DISPLAY);
    expect(text).toContain(BUSINESS.country);
    // No office hours or response-time promise has been given.
    expect(text).not.toMatch(/\b(9|10) ?(am|a\.m\.)|within \d+ (hours|minutes)|24\/7/i);
  });
});

describe('the WhatsApp messaging policy', () => {
  it('says server-sent messaging is not live yet', async () => {
    const text = await pageText('/acceptable-use-policy');
    expect(text).toMatch(/WhatsApp messaging policy/);
    expect(text).toMatch(/not yet available/);
  });

  it('lists only the messages FinMatrix can actually send', async () => {
    const text = await pageText('/acceptable-use-policy');
    expect(text).toMatch(/invoices and receipts/);
    expect(text).toMatch(/payment|reminders/);
    // Not built, so not promised.
    expect(text).not.toMatch(/order confirmation|delivery (status )?update|account (alert|notification)|OTP|one-time (code|password)/i);
  });

  it('covers consent, opt-out, no marketing and the WhatsApp policies', async () => {
    const text = await pageText('/acceptable-use-policy');
    expect(text).toMatch(/agreed to receive/);
    expect(text).toMatch(/STOP/);
    expect(text).toMatch(/START/);
    expect(text).toMatch(/does not send marketing, promotional or bulk messages/);
    expect(text).toMatch(/WhatsApp Business Messaging Policy/);
    expect(text).toMatch(/policy for commerce/);
  });

  it('the privacy policy agrees that it is not live yet', async () => {
    expect(await pageText('/privacy-policy')).toMatch(/not yet available/);
  });
});

describe('the terms of service', () => {
  it('cover what the brief asks for', async () => {
    const text = await pageText('/terms-of-service');
    for (const heading of [
      'The service',
      'Accounts',
      'Acceptable use',
      'Fees and billing',
      'Suspension and termination',
      'Limitation of liability',
      'Support',
    ]) {
      expect(text).toContain(heading);
    }
    expect(text).toMatch(/free of charge/);
  });
});

describe('what the host serves', () => {
  const vercel = JSON.parse(vercelJson) as {
    buildCommand: string;
    rewrites: { source: string; destination: string }[];
  };

  it('builds with the prerender step', () => {
    expect(vercel.buildCommand).toBe('npm run build');
    expect(JSON.parse(packageJson).scripts.build).toContain('scripts/prerender.mjs');
  });

  it('maps every public page to its prerendered file, before the app shell', () => {
    const last = vercel.rewrites[vercel.rewrites.length - 1];
    expect(last.destination).toBe('/app-shell.html');
    for (const page of PUBLIC_PAGES) {
      const file = page.path === '/' ? '/index.html' : `${page.path}.html`;
      const idx = vercel.rewrites.findIndex((r) => r.source === page.path && r.destination === file);
      expect(idx, page.path).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(vercel.rewrites.length - 1);
    }
  });

  it('robots.txt points at the sitemap on the live origin', () => {
    expect(robotsTxt).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });

  it('index.html carries the homepage defaults and no placeholder origin', () => {
    const html = indexHtml;
    expect(html).not.toMatch(/YOUR-DOMAIN|NO-DOMAIN/);
    expect(html).toContain(`<title>${DEFAULT_PAGE.title}</title>`);
    expect(html).toContain(`content="${DEFAULT_PAGE.description}"`);
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/" />`);
    expect(html).toContain(`<meta property="og:url" content="${SITE_URL}/" />`);
    expect(html).toContain(`<meta property="og:image" content="${SITE_URL}/og-image.png" />`);
  });

  it('page titles and descriptions are present and distinct', () => {
    const real = PUBLIC_PAGES.filter((p) => p.canonical === p.path);
    expect(new Set(real.map((p) => p.title)).size).toBe(real.length);
    expect(new Set(real.map((p) => p.description)).size).toBe(real.length);
    for (const p of PUBLIC_PAGES) {
      expect(p.title.length, p.path).toBeLessThanOrEqual(75);
      expect(p.description.length, p.path).toBeGreaterThan(50);
      expect(p.description.length, p.path).toBeLessThanOrEqual(200);
    }
  });

  it('every screenshot the product tour shows exists', () => {
    const srcs = [...tourSource.matchAll(/src: '(\/screenshots\/[^']+)'/g)].map((m) => m[1]);
    expect(srcs.length).toBe(6);
    for (const src of srcs) expect(SCREENSHOTS, src).toContain(src);
  });
});
