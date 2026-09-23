import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge, taught this project's scales.
 *
 * Out of the box it only recognises Tailwind's DEFAULT theme, and a class name it
 * does not recognise gets filed in the wrong conflict group. The expensive case
 * is the type scale: `text-label-lg`, `text-overline` and every other role here
 * are not t-shirt sizes, so the merger took them for text COLOURS — and when a
 * real colour followed, it deleted the "duplicate".
 *
 * That was silent and app-wide. `cn('text-label-lg', 'text-text-inverse')`
 * returned only the colour, so every Button lost its 600 weight and 20px leading,
 * and every `cn('text-overline', 'text-primary')` eyebrow rendered as ordinary
 * sentence-case body text instead of an 11px uppercase overline.
 *
 * `shadow-card` and the named spacing scale had the milder form of the same
 * problem: unrecognised, so `cn('p-xl', 'p-lg')` kept both and left the winner to
 * CSS source order rather than to the caller.
 *
 * Keep these lists in step with the @theme block in src/index.css. The test in
 * src/lib/__tests__/cn.test.ts fails if a role is dropped again.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'hero-xl',
        'hero-lg',
        'hero-md',
        'display-xl',
        'display-lg',
        'display-md',
        'display-sm',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'body-lg',
        'body-md',
        'body-sm',
        'label-lg',
        'label-md',
        'label-sm',
        'caption',
        'overline',
      ],
      shadow: ['card'],
      // `font` is the font-FAMILY group, which is separate from `text` above —
      // that one is font-size. Without this, `font-display` is unrecognised and
      // will not resolve against `font-sans`, so both would survive a merge and
      // the winner would be left to CSS source order.
      font: ['display'],
      spacing: [
        'xxs',
        'xs',
        'sm',
        'md',
        'lg',
        'xl',
        'xxl',
        'xxxl',
        'xxxxl',
        'section',
        'section-lg',
      ],
    },
  },
});

/** Merge conditional class names, letting later Tailwind utilities win. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
