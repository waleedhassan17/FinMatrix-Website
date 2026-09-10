// ═══════════════════════════════════════════════════════
// FinMatrix Web — Section intro
// ═══════════════════════════════════════════════════════
// The overline pill, heading and lede that open every landing section. One
// component so the rhythm between them is set once: seven sections each
// hand-spacing their own heading is how a page ends up subtly uneven.
//
// The heading is always an <h2> — the page has exactly one <h1>, in the hero,
// and landingHonesty.test.tsx holds it to that.

import type { ReactNode } from 'react';

import { Reveal } from '@/components/motion/Reveal';
import { cn } from '@/lib/cn';

export function SectionIntro({
  id,
  overline,
  title,
  body,
  align = 'left',
  tone = 'light',
}: {
  /** Target for the section's aria-labelledby. */
  id: string;
  overline: string;
  title: ReactNode;
  body?: ReactNode;
  align?: 'left' | 'center';
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';

  return (
    <Reveal
      className={cn(
        'flex flex-col',
        align === 'center' ? 'items-center text-center' : 'items-start',
      )}
    >
      <p
        className={cn(
          'inline-flex items-center rounded-full border px-sm py-xxs text-overline',
          dark
            ? 'border-white/15 bg-white/5 text-primary-200'
            : 'border-primary-100 bg-primary-50 text-primary',
        )}
      >
        {overline}
      </p>

      <h2
        id={id}
        className={cn(
          'mt-md max-w-[760px] text-display-sm sm:text-display-md lg:text-display-lg',
          dark ? 'text-text-inverse' : 'text-text-primary',
        )}
      >
        {title}
      </h2>

      {body && (
        <p
          className={cn(
            'mt-md max-w-[640px] text-body-lg',
            dark ? 'text-white/75' : 'text-text-secondary',
          )}
        >
          {body}
        </p>
      )}
    </Reveal>
  );
}

export default SectionIntro;
