// ═══════════════════════════════════════════════════════
// FinMatrix Web — Observe once, animate once
// ═══════════════════════════════════════════════════════
// The entrance trigger shared by <Reveal>, the hero chart's draw and the KPI
// counters. It was inlined in Reveal first; a second copy for the chart would
// have drifted, and the failure mode of THIS logic drifting is a blank page.
//
// ── WHY TWO FLAGS AND NOT ONE ──────────────────────────
// `armed` says "this element will animate, attach the transition". `inView` says
// "play it now". A caller must attach its transition/dash/transform styles only
// when `armed`, because when the hook bails the element has to render byte for
// byte what it rendered before any of this existed.
//
// ── FAIL COMPLETE, AND NOT THE WAY IT LOOKS ────────────
// The seed is `armed: false, inView: true` — the FINISHED state. Everything
// below only ever moves away from that.
//
// The obvious guard, `typeof IntersectionObserver === 'undefined'`, DOES NOT
// catch the test environment. src/test/setup.ts stubs IntersectionObserver with
// a mock that never fires, and stubs matchMedia to report matches:false. Under
// test both of those bails are dead code. What actually keeps the suite green is
// the RECT CHECK: jsdom returns an all-zero rect and an innerHeight of 768, so
// every element reads as already on screen and this hook returns its seed.
//
// Get that wrong and nothing throws. The observer is simply handed a node it
// will never report on, `inView` stays false forever, and the chart renders at
// full dash offset — an invisible line and counters frozen at zero, in tests and
// in any browser where the element happens to start on screen.

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Read the preference once, without subscribing.
 *
 * Deliberately NOT usePrefersReducedMotion() from useScrollY: that one holds
 * state and updates on `change`, which would re-run the layout effect below and
 * replay a finished entrance animation mid-scroll.
 */
const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(REDUCED_QUERY).matches;

export type InView<T extends Element> = {
  ref: RefObject<T | null>;
  /** Attach transitions only when true. */
  armed: boolean;
  /** Play now. */
  inView: boolean;
};

export function useInView<T extends Element = HTMLElement>({
  threshold = 0.01,
  playOnMount = false,
}: {
  threshold?: number;
  /**
   * Play once shortly after mount instead of waiting to be scrolled into view.
   *
   * The rect check below skips anything already on screen, which is right for a
   * scroll reveal and wrong for the hero: its chart and counters sit above the
   * fold, so without this they would never animate on a desktop load — the two
   * best effects on the page, never once seen.
   *
   * This does not put the <h1> behind a transition. Only the picture opts in,
   * and the headline is what LCP measures.
   */
  playOnMount?: boolean;
} = {}): InView<T> {
  const ref = useRef<T | null>(null);
  const [armed, setArmed] = useState(false);
  const [inView, setInView] = useState(true);

  // A LAYOUT effect, for the same reason Reveal uses one: the decision has to
  // land before the browser paints, or on-screen content paints visible, hides a
  // frame later and fades back in.
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;

    const node = ref.current;
    if (!node) return;

    if (playOnMount) {
      setArmed(true);
      setInView(false);

      // Two frames, not one. Arming and un-arming inside a single frame lets the
      // browser collapse both into one style recalculation and skip the
      // transition entirely; the second frame guarantees a painted start state
      // for it to animate away from.
      if (typeof requestAnimationFrame !== 'function') {
        setInView(true);
        return;
      }

      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setInView(true));
      });
      return () => {
        cancelAnimationFrame(first);
        if (second) cancelAnimationFrame(second);
      };
    }

    if (typeof IntersectionObserver === 'undefined') return;

    // THE GUARD THE TEST SUITE DEPENDS ON — see the header. Already on screen, or
    // already scrolled past on a reload part-way down: leave it exactly as it is.
    if (node.getBoundingClientRect().top < window.innerHeight) return;

    setArmed(true);
    setInView(false);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setInView(true);
          observer.disconnect();
        }
      },
      // No negative bottom margin. Anything resting in the last pixels of the
      // screen at load would be hidden and never revealed until the visitor
      // scrolled — a band of missing content sitting right at the fold.
      { rootMargin: '0px', threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, playOnMount]);

  return { ref, armed, inView };
}

export default useInView;
