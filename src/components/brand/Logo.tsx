// ═══════════════════════════════════════════════════════
// FinMatrix — the brand mark
// ═══════════════════════════════════════════════════════
// THE MARK is a rounded "m" over a red rule — the FinMatrix logo. It replaces an
// F monogram (and, before that, lucide's BarChart3 in a box).
//
// THE GEOMETRY is one stroke of width 20: three stems 40 apart, two arches with
// a centreline radius of 20 (so the counters are exactly half a stroke wide),
// round ends, and the rule beneath. It was fitted to the logo artwork to the
// pixel. The same geometry is in public/favicon.svg, the app's BrandMark.tsx and
// both apps' launcher icons — change one, change all of them.
//
// COLOUR: the "m" is `currentColor`, so the parent sets it with an ordinary
// text colour class — white on the navy sidebar, the logo's ink on a light
// ground. The rule is always the logo's red, through the `brand-red` token:
// scripts/check-design-tokens.js gates .tsx and would fail the build on a hex.
//
// public/favicon.svg inlines the token hexes, since a file in public/ cannot
// import anything.

import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

type MarkProps = {
  /** Sizing utility for the square mark, e.g. `size-8`. */
  className?: string;
};

/**
 * The mark alone, for tight spaces — the mobile drawer, an avatar slot, a
 * favicon-like context. `aria-hidden` because the wordmark beside it carries
 * the name; a lone mark needs a label from its caller.
 */
export function LogoMark({ className }: MarkProps) {
  return (
    // The mark's box is x -3.86…103.86, y 0…91.61; the square viewBox centres it
    // with a little air, so it sits in a `size-*` square like any icon.
    <svg
      viewBox="-12 -16.2 124 124"
      fill="none"
      aria-hidden="true"
      className={cn('size-8 shrink-0', className)}
    >
      {/* The "m": three stems, two arches, one stroke. */}
      <path
        d="M10 62.36V30a20 20 0 0 1 40 0v32.36M50 30a20 20 0 0 1 40 0v32.36"
        stroke="currentColor"
        strokeWidth="20"
        strokeLinecap="round"
      />
      {/* The rule beneath — always the logo's red. */}
      <rect
        x="-3.86"
        y="79.25"
        width="107.72"
        height="12.36"
        rx="6.18"
        className="fill-brand-red"
      />
    </svg>
  );
}

/**
 * Extends the span's own props, and that is load-bearing rather than tidiness.
 *
 * Radix's `asChild` works by cloning its child and handing it the props the
 * primitive would have rendered itself — for Dialog.Title, the `id` that the
 * dialog's `aria-labelledby` points at. A component that accepts only its own
 * named props silently swallows that id, the id then matches no element, and
 * the dialog ends up with NO accessible name at all. Nothing throws and nothing
 * looks wrong; it only shows up in an accessibility tree.
 */
type LogoProps = ComponentProps<'span'> & {
  /**
   * Whether the wordmark sits on a dark ground. It only picks the wordmark's
   * colour — the mark itself inherits `currentColor` from the caller either
   * way, so a caller that needs something other than these two can set a text
   * colour and pass `tone="inherit"`.
   */
  tone?: 'light' | 'dark' | 'inherit';
  /** Wordmark size role. Defaults to the nav's. */
  wordmarkClassName?: string;
};

const TONE: Record<NonNullable<LogoProps['tone']>, string> = {
  // On a dark ground.
  light: 'text-text-inverse',
  // On a light ground: the logo's own ink.
  dark: 'text-brand-ink',
  inherit: '',
};

/**
 * Mark plus wordmark, as one lockup.
 *
 * Set in the display face and tracked in, because a wordmark is a piece of
 * lettering rather than a line of UI text — at the nav's size the product's
 * default tracking leaves it looking loose.
 */
export function Logo({
  tone = 'light',
  className,
  wordmarkClassName,
  ...rest
}: LogoProps) {
  return (
    <span
      {...rest}
      className={cn('flex items-center gap-xs', TONE[tone], className)}
    >
      <LogoMark className="size-8" />
      <span
        className={cn(
          'font-display text-h2 tracking-tight',
          wordmarkClassName,
        )}
      >
        FinMatrix
      </span>
    </span>
  );
}

export default Logo;
