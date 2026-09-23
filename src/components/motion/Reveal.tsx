// ═══════════════════════════════════════════════════════
// FinMatrix Web — Scroll reveal
// ═══════════════════════════════════════════════════════
// A fade and a short rise as a section scrolls in, staggered down a row.
//
// Why not framer-motion: the effects the landing needs are a fade and a short
// rise. That is an IntersectionObserver and a CSS transition. A 60 KB animation
// runtime on the route whose load time is the first thing a visitor experiences
// is a bad trade.
//
// The observe-once decision now lives in useInView, which the hero chart and the
// KPI counters share. Read its header before changing anything here: the guard
// that keeps the jsdom suite green is subtler than it looks.
//
// Three things this must never do:
//   1. Animate under prefers-reduced-motion. Motion sickness is not a taste.
//   2. Hide content it cannot observe — a non-visible element that never reveals
//      is a blank page, so the default is VISIBLE and the animation is the
//      enhancement.
//   3. Shift layout. Only opacity and transform are touched, both composited.
//
// ── CALLERS: DO NOT PUT A `transition-*` CLASS ON THIS ──
// The wrapper sets `transition-[opacity,transform]` on ITSELF. cn() resolves two
// transition utilities by letting the later one win, so passing `transition-colors`
// through `className` silently deletes the reveal. Put it on a child instead.

import { type ElementType, type ReactNode } from 'react';

import { useInView } from '@/components/motion/useInView';
import { cn } from '@/lib/cn';

export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  /** Stagger, in ms. Keep a row inside ~250ms total or it reads as lag. */
  delay?: number;
  className?: string;
  as?: ElementType;
}) {
  const { ref, armed, inView } = useInView<HTMLElement>();

  return (
    <Tag
      ref={ref as never}
      className={cn(
        // 24px of travel, not the 16px this shipped with. At 16px over 500ms the
        // movement sat under the threshold where people register it at all — the
        // page was reported as having no animation while every reveal was in
        // fact firing. The easing is a soft overshoot-free curve rather than
        // plain ease-out, which arrives too evenly to read as deliberate.
        armed &&
          'transition-[opacity,transform] duration-[650ms] ease-[cubic-bezier(0.22,0.8,0.28,1)]',
        armed && !inView && 'translate-y-6 opacity-0',
        armed && inView && 'translate-y-0 opacity-100',
        className,
      )}
      // The delay has to survive the state flip: it is what staggers the
      // reveal, and clearing it on the way in would fire every child at once.
      style={armed && delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

export default Reveal;
