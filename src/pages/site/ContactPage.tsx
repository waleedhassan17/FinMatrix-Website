// ═══════════════════════════════════════════════════════
// FinMatrix — /contact
// ═══════════════════════════════════════════════════════
// Every channel listed here reaches a person today. No street address, office
// hours or response-time promise: none has been given, and a made-up one is
// worse than none. When FinMatrix has a registered address, add it to
// siteMeta.ts and show it here.
//
// No contact form: there is no endpoint behind one, and a form that silently
// drops what a visitor types is worse than a mailto link.

import { Globe2, Mail, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import {
  CONTACT_EMAILS,
  CONTACT_EMAILS_MAILTO,
  CONTACT_WHATSAPP,
  CONTACT_WHATSAPP_DISPLAY,
} from '@/features/landing/constants';
import { normalizeWhatsappPhone } from '@/features/share/shareDocument';
import { BUSINESS } from '@/features/site/siteMeta';
import { PublicLayout } from '@/features/site/PublicLayout';

const WHATSAPP_HREF = `https://wa.me/${normalizeWhatsappPhone(CONTACT_WHATSAPP) ?? ''}`;

const mailto = (subject: string) =>
  `mailto:${CONTACT_EMAILS_MAILTO}?subject=${encodeURIComponent(subject)}`;

const TOPICS: { title: string; body: string; action: { label: string; href?: string; to?: string } }[] = [
  {
    title: 'Questions about FinMatrix or a demo',
    body: 'What it does, whether it fits your business, or a walk-through of the product.',
    action: { label: 'Email us', href: mailto('FinMatrix question') },
  },
  {
    title: 'Help with your account',
    body: 'Signing in, setting up your company, adding your team or anything that is not working.',
    action: { label: 'Email support', href: mailto('FinMatrix account help') },
  },
  {
    title: 'Privacy questions',
    body: 'What information FinMatrix holds about you and how it is used.',
    action: { label: 'Read the privacy policy', to: '/privacy-policy' },
  },
  {
    title: 'Deleting your data',
    body: 'Closing your account and removing your company’s records.',
    action: { label: 'How deletion works', to: '/data-deletion' },
  },
  {
    title: 'Reporting misuse',
    body: 'Including a WhatsApp message you did not agree to receive.',
    action: { label: 'Acceptable use policy', to: '/acceptable-use-policy' },
  },
];

export default function ContactPage() {
  return (
    <PublicLayout>
      <section className="border-b border-border-light bg-surface">
        <div className="mx-auto max-w-[1080px] px-xl py-xxxl lg:py-section">
          <p className="text-overline text-primary">Contact</p>
          <h1 className="mt-sm text-h1 text-text-primary">Contact FinMatrix</h1>
          <p className="mt-lg max-w-[680px] text-body-lg text-text-secondary">
            Write to us by email or WhatsApp. Either one reaches the FinMatrix team.
          </p>
        </div>
      </section>

      <div className="mx-auto flex max-w-[1080px] flex-col gap-xxxl px-xl py-xxxl lg:py-section">
        <section aria-label="How to reach us" className="grid gap-md md:grid-cols-3">
          <div className="flex flex-col gap-sm rounded-xl border border-border-light bg-surface p-xl shadow-card">
            <Mail className="size-6 text-primary" aria-hidden="true" />
            <h2 className="text-h4 text-text-primary">Email</h2>
            <ul className="flex flex-col gap-xs">
              {CONTACT_EMAILS.map((email) => (
                <li key={email}>
                  <a className="break-all text-body-md text-primary underline" href={`mailto:${email}`}>
                    {email}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-sm rounded-xl border border-border-light bg-surface p-xl shadow-card">
            <MessageCircle className="size-6 text-primary" aria-hidden="true" />
            <h2 className="text-h4 text-text-primary">WhatsApp</h2>
            <a
              className="text-body-md text-primary underline tabular"
              href={WHATSAPP_HREF}
              target="_blank"
              rel="noopener noreferrer"
            >
              {CONTACT_WHATSAPP_DISPLAY}
            </a>
            <p className="text-body-sm text-text-tertiary">Opens a chat in WhatsApp.</p>
          </div>

          <div className="flex flex-col gap-sm rounded-xl border border-border-light bg-surface p-xl shadow-card">
            <Globe2 className="size-6 text-primary" aria-hidden="true" />
            <h2 className="text-h4 text-text-primary">Where we are</h2>
            <p className="text-body-md text-text-primary">{BUSINESS.country}</p>
            <p className="text-body-sm text-text-tertiary">
              FinMatrix is online software, so there is no office to visit; everything happens by email, WhatsApp and
              in the product.
            </p>
          </div>
        </section>

        <section aria-labelledby="contact-topics">
          <h2 id="contact-topics" className="text-h2 text-text-primary">
            What can we help with?
          </h2>
          <ul className="mt-lg divide-y divide-border-light overflow-hidden rounded-xl border border-border-light bg-surface">
            {TOPICS.map(({ title, body, action }) => (
              <li
                key={title}
                className="flex flex-col gap-sm px-lg py-md sm:flex-row sm:items-center sm:justify-between sm:gap-lg"
              >
                <div>
                  <h3 className="text-label-lg text-text-primary">{title}</h3>
                  <p className="mt-xxs text-body-sm text-text-secondary">{body}</p>
                </div>
                {action.to ? (
                  <Link className="shrink-0 text-label-md text-primary underline" to={action.to}>
                    {action.label}
                  </Link>
                ) : (
                  <a className="shrink-0 text-label-md text-primary underline" href={action.href}>
                    {action.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col items-start gap-md rounded-xl border border-border-light bg-surface p-xl shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-h3 text-text-primary">Already using FinMatrix?</h2>
            <p className="mt-xs text-body-md text-text-secondary">Sign in to your company, or create a new account.</p>
          </div>
          <div className="flex flex-wrap gap-sm">
            <Button asChild>
              <Link to="/get-started">Sign in</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/register">Create an account</Link>
            </Button>
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
