// ═══════════════════════════════════════════════════════
// FinMatrix Web — Scroll reveal
// ═══════════════════════════════════════════════════════
// The landing page's entire motion budget, in one component and no dependency.
//
// Why not framer-motion: the effects the landing needs are a fade and a short
// rise, staggered down a section. That is an IntersectionObserver and a CSS
// transition. A 60 KB animation runtime on the route whose load time is the first
// thing a visitor experiences is a bad trade.
//
// Four things this must never do:
//   1. Animate under prefers-reduced-motion. Motion sickness is not a taste.
//   2. Hide content when the observer is unavailable — a non-visible element that
//      never reveals is a blank page, so the default is VISIBLE and the animation
//      is the enhancement.
//   3. Shift layout. Only opacity and transform are touched, both composited.
//   4. Touch anything already on screen at load. Only content that will be
//      scrolled INTO view earns an entrance — see the layout effect below.

import {
  useLayoutEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/cn';

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  /** Stagger, in ms. Keep a row inside ~200ms total or it reads as lag. */
  delay?: number;
  className?: string;
  as?: ElementType;
}) {
  const ref = useRef<HTMLElement | null>(null);

  // Start shown. Hide only once we know the element is below the fold and can be
  // observed — an element that renders hidden and never gets a callback is
  // invisible content.
  const [animate, setAnimate] = useState(false);
  const [shown, setShown] = useState(true);

  // A LAYOUT effect, deliberately. The decision has to land before the browser
  // paints. Made in a plain useEffect, an element already on screen paints
  // visible, is hidden a frame later, then fades back in: a flicker on every
  // above-the-fold element, and the hero headline — the page's largest paint —
  // held behind a 500ms transition that Lighthouse charges to LCP.
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const node = ref.current;
    if (!node) return;

    // Already on screen, or already scrolled past (a reload part-way down the
    // page): leave it exactly as it is.
    if (node.getBoundingClientRect().top < window.innerHeight) return;

    setAnimate(true);
    setShown(false);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setShown(true);
          observer.disconnect();
        }
      },
      // No negative margin. A `-60px` bottom margin looked tidier in theory, but
      // anything resting in the last 60px of the screen at load was hidden and
      // then never revealed until the visitor scrolled — a band of missing
      // content sitting right at the fold. Reveal as soon as a pixel shows.
      { rootMargin: '0px', threshold: 0.01 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={cn(
        animate && 'transition-[opacity,transform] duration-500 ease-out',
        animate && !shown && 'translate-y-4 opacity-0',
        animate && shown && 'translate-y-0 opacity-100',
        className,
      )}
      // The delay has to survive the state flip: it is what staggers the
      // reveal, and clearing it on the way in would fire every child at once.
      style={animate && delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

export default Reveal;
