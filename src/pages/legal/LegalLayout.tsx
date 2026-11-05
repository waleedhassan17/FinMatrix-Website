import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Logo } from '@/components/brand/Logo';
import { CONTACT_EMAIL_PRIMARY } from '@/features/landing/constants';

/**
 * The frame for FinMatrix's public legal pages (/privacy, /data-deletion).
 * Public on purpose: Meta's WhatsApp Business Platform and the app stores
 * need to open them without an account.
 */
export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border-light bg-surface">
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-lg py-md">
          <Link to="/" aria-label="FinMatrix home">
            <Logo tone="dark" />
          </Link>
          <nav className="flex gap-md text-body-sm text-text-secondary">
            <Link to="/privacy" className="hover:text-text-primary">
              Privacy
            </Link>
            <Link to="/data-deletion" className="hover:text-text-primary">
              Data deletion
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[760px] px-lg py-xxl">
        <h1 className="text-h1 text-text-primary">{title}</h1>
        <p className="mt-xs text-body-sm text-text-tertiary">Last updated {updated}</p>
        <div className="mt-xl flex flex-col gap-xl text-body-md text-text-secondary">{children}</div>
        <p className="mt-xxl border-t border-border-light pt-lg text-body-sm text-text-secondary">
          Questions about this page:{' '}
          <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL_PRIMARY}`}>
            {CONTACT_EMAIL_PRIMARY}
          </a>
        </p>
      </main>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-sm">
      <h2 className="text-h3 text-text-primary">{title}</h2>
      {children}
    </section>
  );
}
