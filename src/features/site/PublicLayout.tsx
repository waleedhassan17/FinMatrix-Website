// ═══════════════════════════════════════════════════════
// FinMatrix — frame for the public pages
// ═══════════════════════════════════════════════════════
// /about, /contact, the policies and the public 404 share the homepage's header
// and footer, so a visitor (or a reviewer) moving between them never meets a
// page that looks like a different site.
//
// These pages sit OUTSIDE SessionGate, like the homepage, and make no API calls:
// they must open instantly for anyone, signed in or not, and they are rendered
// to static HTML at build time (scripts/prerender.mjs) for crawlers that do not
// run JavaScript.
//
// They are also outside the router's <ScrollRestoration>, which lives under
// Root. Without the effect below, following "Terms of service" from the bottom
// of the footer would open the terms scrolled to their bottom too.

import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { LandingFooter } from '@/features/landing/LandingFooter';
import { LandingNav } from '@/features/landing/LandingNav';
import { publicPageFor } from '@/features/site/siteMeta';
import { usePageMeta } from '@/features/site/usePageMeta';

function useScrollOnArrive(pathname: string, hash: string) {
  useEffect(() => {
    if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
}

export function PublicLayout({ children }: { children: ReactNode }) {
  const { pathname, hash } = useLocation();
  usePageMeta(publicPageFor(pathname));
  useScrollOnArrive(pathname, hash);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-sm focus:left-sm focus:z-[60] focus:rounded-sm focus:bg-surface focus:px-md focus:py-sm focus:text-label-md focus:text-primary focus:shadow-card"
      >
        Skip to content
      </a>

      <LandingNav onPage />

      {/* The bar is fixed and 60px tall in its solid state. */}
      <main id="main" className="flex-1 pt-[60px]">
        {children}
      </main>

      <LandingFooter />
    </div>
  );
}

export default PublicLayout;
