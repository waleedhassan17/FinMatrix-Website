// ═══════════════════════════════════════════════════════
// FinMatrix — the brand mark
// ═══════════════════════════════════════════════════════
// What stood here before was `BarChart3` from lucide-react in a rounded box:
// an icon from an open-source set that thousands of other sites also ship, used
// as a logo. A buyer who has seen any other Lucide site recognises it on sight,
// and the product reads as a template. A company selling financial software
// internationally needs a mark that is its own.
//
// THE MARK is an F monogram built from ledger rules. The stem and the top rule
// are the primary record; the shorter middle rule is the second one, aligned to
// it — which is the whole product claim ("your stock and your books, the same
// number"). It is geometric rather than drawn so it holds at 16px in a browser
// tab, and the radius is deliberately small: a pill-shaped rule reads friendly,
// and this is meant to read precise.
//
// IT IS MONOCHROME, and the second rule is separated by opacity rather than by
// the brand teal. Teal is not free in this system — it is the staff portal's
// wayfinding colour ("a different door to a different surface"), and spending it
// on the logo would blunt that meaning everywhere it is actually load-bearing.
// Opacity also survives every ground the mark lands on; #0f766e on navy does not.
//
// COLOUR is `currentColor` throughout, never a hex — scripts/check-design-tokens.js
// gates .tsx and would fail the build on one. The consequence worth knowing: the
// parent sets the mark's colour with an ordinary text colour class.
//
// The public/favicon.svg is this same geometry with the token hexes inlined,
// since a file in public/ cannot import anything.

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
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn('size-8 shrink-0', className)}
    >
      {/* Stem and top rule — the primary record. */}
      <rect x="7" y="5" width="5" height="22" rx="1.6" fill="currentColor" />
      <rect x="7" y="5" width="18" height="5" rx="1.6" fill="currentColor" />
      {/* The second record, aligned to the first. */}
      <rect
        x="7"
        y="13.5"
        width="12"
        height="5"
        rx="1.6"
        fill="currentColor"
        opacity="0.55"
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
  // On a light ground.
  dark: 'text-primary-900',
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
