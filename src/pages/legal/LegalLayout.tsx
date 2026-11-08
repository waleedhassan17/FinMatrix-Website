import type { ReactNode } from 'react';

import { CONTACT_EMAIL_PRIMARY } from '@/features/landing/constants';
import { PublicLayout } from '@/features/site/PublicLayout';

/**
 * The frame for FinMatrix's public policy pages (/privacy-policy,
 * /terms-of-service, /acceptable-use-policy, /data-deletion). Public on purpose:
 * Meta's WhatsApp Business Platform and the app stores need to open them
 * without an account. The header and footer are the homepage's, via
 * PublicLayout; this adds the narrow reading column, the date and the contact
 * line every policy ends with.
 */
export function LegalLayout({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  /** Optional lead paragraph under the title, before the sections. */
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PublicLayout>
      <article className="mx-auto max-w-[760px] px-lg py-xxl">
        <h1 className="text-h1 text-text-primary">{title}</h1>
        <p className="mt-xs text-body-sm text-text-tertiary">Last updated {updated}</p>
        {intro && <div className="mt-lg text-body-lg text-text-secondary">{intro}</div>}
        <div className="mt-xl flex flex-col gap-xl text-body-md text-text-secondary">{children}</div>
        <p className="mt-xxl border-t border-border-light pt-lg text-body-sm text-text-secondary">
          Questions about this page:{' '}
          <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL_PRIMARY}`}>
            {CONTACT_EMAIL_PRIMARY}
          </a>
        </p>
      </article>
    </PublicLayout>
  );
}

export function LegalSection({
  title,
  id,
  children,
}: {
  title: string;
  /** Anchor for a deep link, e.g. /acceptable-use-policy#whatsapp. */
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-sm">
      <h2 className="text-h3 text-text-primary">{title}</h2>
      {children}
    </section>
  );
}
