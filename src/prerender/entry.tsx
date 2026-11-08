// ═══════════════════════════════════════════════════════
// FinMatrix — build-time render of the public pages
// ═══════════════════════════════════════════════════════
// Built by `vite build --ssr` and run by scripts/prerender.mjs after the
// normal client build. It renders each public page to HTML once, at build
// time, so the files Vercel serves for /, /about, /contact and the policies
// already contain their words. Crawlers and reviewers that do not run
// JavaScript (Meta's among them) see the real page instead of an empty
// <div id="root">.
//
// The browser still boots the SPA as before: main.tsx uses createRoot, which
// replaces this markup with the identical page on its first render. These pages
// are eager and outside SessionGate (router.tsx), so there is no spinner in
// between.
//
// Nothing here runs in the browser bundle.

/* oxlint-disable react/only-export-components -- a build-time module, never
   hot-reloaded: the fast-refresh rule has nothing to protect here. */

import type { ReactElement } from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import { StaticRouter } from 'react-router-dom';

import LandingPage from '@/pages/LandingPage';
import AcceptableUsePage from '@/pages/legal/AcceptableUsePage';
import DataDeletionPage from '@/pages/legal/DataDeletionPage';
import PrivacyPage from '@/pages/legal/PrivacyPage';
import TermsPage from '@/pages/legal/TermsPage';
import AboutPage from '@/pages/site/AboutPage';
import ContactPage from '@/pages/site/ContactPage';

export { PUBLIC_PAGES, SITE_URL, absoluteUrl } from '@/features/site/siteMeta';

/** The same element router.tsx mounts at each public path. */
const ELEMENTS: Record<string, () => ReactElement> = {
  '/': () => <LandingPage />,
  '/about': () => <AboutPage />,
  '/contact': () => <ContactPage />,
  '/privacy-policy': () => <PrivacyPage />,
  '/privacy': () => <PrivacyPage />,
  '/terms-of-service': () => <TermsPage />,
  '/acceptable-use-policy': () => <AcceptableUsePage />,
  '/data-deletion': () => <DataDeletionPage />,
};

export const PRERENDER_PATHS = Object.keys(ELEMENTS);

/** The page's markup, as the browser's first render will produce it. */
export async function render(path: string): Promise<string> {
  const element = ELEMENTS[path];
  if (!element) throw new Error(`No public page registered for ${path}`);

  const { prelude } = await prerenderToNodeStream(
    <StaticRouter location={path}>{element()}</StaticRouter>,
  );
  // A Node stream; read it without Node's Buffer type, which this tsconfig
  // (browser types only) does not load.
  const decoder = new TextDecoder();
  let html = '';
  for await (const chunk of prelude as unknown as AsyncIterable<Uint8Array | string>) {
    html += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
  }
  return html + decoder.decode();
}
