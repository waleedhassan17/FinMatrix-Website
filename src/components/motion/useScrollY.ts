// ═══════════════════════════════════════════════════════
// FinMatrix Web — Scroll position & motion preference
// ═══════════════════════════════════════════════════════
// Drives the landing nav's transparent→solid flip and the hero's parallax.
//
// Reads are coalesced onto one rAF frame: a scroll listener that calls setState
// per event re-renders the whole landing page dozens of times a second, which is
// how a marketing page ends up janky on a mid-range phone.
//
// Scroll tracking is NOT gated on prefers-reduced-motion. The nav going solid is
// legibility, not decoration — left transparent it puts white links over whatever
// light section scrolled under them. Parallax is the decorative part, so the hero
// zeroes its own offset via usePrefersReducedMotion instead.

import { useEffect, useState } from 'react';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  // Read during the first render, not in an effect, so a reduced-motion visitor
  // never sees one animated frame before the preference lands.
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(REDUCED_QUERY).matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mql = window.matchMedia(REDUCED_QUERY);

    // Honour a change made while the page is open, not only at load.
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

export function useScrollY(): number {
  // Seeded during render. The nav is white-on-dark at the top of the page and
  // dark-on-white once scrolled; seeding in an effect instead would paint one
  // frame of white links over a light section on a reload part-way down.
  const [scrollY, setScrollY] = useState(() =>
    typeof window === 'undefined' ? 0 : window.scrollY,
  );

  useEffect(() => {
    let frame = 0;

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setScrollY(window.scrollY);
      });
    };

    // The browser may restore the scroll position after the first render. Read
    // it directly rather than through rAF, which not every environment provides.
    setScrollY(window.scrollY);

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return scrollY;
}

export default useScrollY;
