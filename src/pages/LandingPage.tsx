// ═══════════════════════════════════════════════════════
// FinMatrix Web — Landing page
// ═══════════════════════════════════════════════════════
// The public front door, at `/`.
//
// THIS PAGE MUST MOUNT OUTSIDE SessionGate. SessionGate holds a <BootSplash/>
// until /auth/me settles, so a visitor carrying a stale token would watch a
// spinner on the marketing homepage — seconds of it, on a sleeping dyno. Routed
// as a sibling of the session-gated tree, this paints immediately.
//
// The consequence is that `selectAuthStatus` is permanently 'unknown' here, so it
// must not be read. hasSession() is the synchronous localStorage check that
// exists for exactly this, and it answers in time for the first paint — which is
// why a signed-in visitor is redirected without a flash of the sales pitch.

import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';

import { AssuranceSection } from '@/features/landing/AssuranceSection';
import { CtaSection } from '@/features/landing/CtaSection';
import { FaqSection } from '@/features/landing/FaqSection';
import { HeroSection } from '@/features/landing/HeroSection';
import { LandingFooter } from '@/features/landing/LandingFooter';
import { LandingNav } from '@/features/landing/LandingNav';
import { ModulesSection } from '@/features/landing/ModulesSection';
// BILLING-DISABLED BUILD: un-comment with the section in the page below.
// import { PricingSection } from '@/features/landing/PricingSection';
import { ProofStrip } from '@/features/landing/ProofStrip';
import { RolesSection } from '@/features/landing/RolesSection';
import { WorkflowSection } from '@/features/landing/WorkflowSection';
import { hasSession } from '@/utils/storage';

/**
 * Smooth anchor scrolling, for as long as the landing page is mounted.
 *
 * Scoped here rather than set on `html` in index.css. A global rule reaches the
 * whole ERP behind sign-in: every programmatic scroll and every default
 * `scrollIntoView` there would animate too — a long list sliding back to the top
 * on each navigation. The nav's in-page anchors are the only thing that wants it.
 *
 * Skipped under prefers-reduced-motion, where the jump is the accessible
 * behaviour.
 */
function useSmoothAnchorScrolling() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'smooth';
    return () => {
      root.style.scrollBehavior = previous;
    };
  }, []);
}

export default function LandingPage() {
  // Called before the redirect below, so the hook order never changes between
  // renders.
  useSmoothAnchorScrolling();

  // Read once per mount, before paint. A signed-in owner who types the bare
  // domain wants their dashboard, not the pitch.
  if (hasSession()) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-sm focus:left-sm focus:z-[60] focus:rounded-sm focus:bg-surface focus:px-md focus:py-sm focus:text-label-md focus:text-primary focus:shadow-card"
      >
        Skip to content
      </a>

      <LandingNav />

      <main id="main">
        <HeroSection />
        <ProofStrip />
        <ModulesSection />
        <WorkflowSection />
        {/* The dark anchor in the middle of the page, and the answer to "why
            should I believe the figures". It sits where PricingSection used to,
            which is also what keeps the light sections from running five deep. */}
        <AssuranceSection />
        <RolesSection />
        {/* BILLING-DISABLED BUILD: the public plan grid. Nothing is for
            sale during the warehouse testing phase. */}
        {/* <PricingSection /> */}
        <FaqSection />
        <CtaSection />
      </main>

      <LandingFooter />
    </div>
  );
}
