// ═══════════════════════════════════════════════════════
// FinMatrix — public "page not found"
// ═══════════════════════════════════════════════════════
// What a signed-out visitor sees at an address no page answers. Before this, a
// mistyped public link bounced to the sign-in screen, which tells a visitor
// (or a reviewer) nothing about what went wrong.
//
// Signed-in users never see this: NotFoundRoute (router.tsx) gives them the
// in-app "Page not found" inside the sidebar shell, as before.
//
// The host answers every unknown path with the app shell and a 200 (it is a
// single-page app), so the page marks itself noindex for crawlers instead.

import { Compass } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { PublicLayout } from '@/features/site/PublicLayout';
import { usePageMeta } from '@/features/site/usePageMeta';

const META = {
  title: 'Page not found — FinMatrix',
  description: 'There is no page at this address.',
  canonical: '/',
  noindex: true,
};

export default function NotFoundPage() {
  const { pathname } = useLocation();
  usePageMeta(META);

  return (
    <PublicLayout>
      <div className="mx-auto flex max-w-[560px] flex-col items-center px-xl py-section text-center">
        <Compass className="size-12 text-text-tertiary" aria-hidden="true" />
        <h1 className="mt-lg text-h1 text-text-primary">Page not found</h1>
        <p className="mt-sm text-body-lg text-text-secondary">
          There is nothing at this address. The link may be mistyped, or the page may have moved.
        </p>
        <p className="mt-xs break-all text-caption text-text-tertiary">{pathname}</p>
        <div className="mt-xl flex flex-wrap justify-center gap-sm">
          <Button asChild>
            <Link to="/">Go to the homepage</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/contact">Contact us</Link>
          </Button>
          <Button asChild variant="text">
            <Link to="/get-started">Sign in</Link>
          </Button>
        </div>
      </div>
    </PublicLayout>
  );
}
