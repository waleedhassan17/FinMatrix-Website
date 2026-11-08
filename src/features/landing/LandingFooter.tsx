// ═══════════════════════════════════════════════════════
// FinMatrix Web — Footer
// ═══════════════════════════════════════════════════════
// The darkest step of the page's navy ramp, with the grid pattern fading in
// from the top so the footer reads as a surface rather than a black bar.
//
// Every link goes somewhere real. A footer full of href="#" placeholders looks
// complete in a screenshot and is broken the moment anyone clicks.
//
// It is the footer of every public page, not only the homepage, so the section
// links are written "/#modules" rather than "#modules": from /about they load
// the homepage at that section, and on the homepage the browser treats them as
// an in-page jump.

import { Globe2, Mail, MessageCircle, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Logo } from '@/components/brand/Logo';
import {
  COMPANY_ORIGIN,
  CONTACT_EMAILS,
  CONTACT_WHATSAPP,
  CONTACT_WHATSAPP_DISPLAY,
} from '@/features/landing/constants';
import { normalizeWhatsappPhone } from '@/features/share/shareDocument';

const PRODUCT = [
  { label: 'Features', href: '/#modules' },
  { label: 'Product tour', href: '/#product-tour' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'How it holds up', href: '/#how-it-holds-up' },
  // BILLING-DISABLED BUILD: dead anchor, see LandingPage.
  // { label: 'Pricing', href: '/#pricing' },
  { label: 'Questions', href: '/#faq' },
];

const COMPANY = [
  { label: 'About FinMatrix', to: '/about' },
  { label: 'Contact', to: '/contact' },
  { label: 'Sign in', to: '/get-started' },
  { label: 'Create an account', to: '/register' },
];

const LEGAL = [
  { label: 'Privacy policy', to: '/privacy-policy' },
  { label: 'Terms of service', to: '/terms-of-service' },
  { label: 'Acceptable use', to: '/acceptable-use-policy' },
  { label: 'WhatsApp messaging', to: '/acceptable-use-policy#whatsapp' },
  { label: 'Data deletion', to: '/data-deletion' },
];

const linkClass = 'text-body-sm text-white/65 transition-colors hover:text-text-inverse';

/** Opens a chat with the number, country code first — wa.me wants no leading 0. */
const WHATSAPP_HREF = `https://wa.me/${normalizeWhatsappPhone(CONTACT_WHATSAPP) ?? ''}`;

export function LandingFooter() {
  return (
    <footer className="relative isolate overflow-hidden bg-primary-950 text-text-inverse">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 pattern-grid-dark fade-mask-b"
      />

      <div className="mx-auto max-w-[1280px] px-xl pt-xxxxl pb-xl lg:pt-section">
        <div className="grid gap-xxxl sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_minmax(0,1.4fr)] lg:gap-xxl">
          <div>
            <Logo tone="light" />
            <p className="mt-lg max-w-[380px] text-body-sm text-white/65">
              ERP software for businesses: inventory, sales, purchases,
              accounting, deliveries and reporting in one system.
            </p>
            {/* Origin, kept and kept quiet. It used to read "Built in Pakistan ·
                Prices in PKR" — a single currency stated as a fact is a hard
                ceiling on who the page is addressed to. */}
            <p className="mt-lg inline-flex items-center gap-xs rounded-full border border-white/10 bg-white/5 px-sm py-xxs text-label-sm text-white/70">
              <Globe2 className="size-3.5 text-success-bright" aria-hidden="true" />
              {COMPANY_ORIGIN}
            </p>
          </div>

          <nav aria-labelledby="footer-product">
            <p id="footer-product" className="text-overline text-white/45">
              Product
            </p>
            <ul className="mt-md flex flex-col gap-sm">
              {PRODUCT.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className={linkClass}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-company">
            <p id="footer-company" className="text-overline text-white/45">
              Company
            </p>
            <ul className="mt-md flex flex-col gap-sm">
              {COMPANY.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-legal">
            <p id="footer-legal" className="text-overline text-white/45">
              Legal
            </p>
            <ul className="mt-md flex flex-col gap-sm">
              {LEGAL.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-contact">
            <p id="footer-contact" className="text-overline text-white/45">
              Contact
            </p>
            {/* Email first, WhatsApp under it. The order is the point: a chat
                app as a company's primary channel reads as a sole trader, and
                the named individual that used to head this list read the same
                way. WhatsApp stays because it is a real support channel in
                several of these markets.

                Two addresses, neither labelled "sales" or "support", because
                that split would be a fiction the first reply contradicts — and
                nothing here says who is behind them. Who answers is not the
                visitor's business; that they get an answer is. */}
            <ul className="mt-md flex flex-col gap-sm">
              {CONTACT_EMAILS.map((email) => (
                <li key={email}>
                  <a
                    href={`mailto:${email}`}
                    className={`flex items-center gap-xs ${linkClass}`}
                  >
                    <Mail className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{email}</span>
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={WHATSAPP_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Chat on WhatsApp: ${CONTACT_WHATSAPP_DISPLAY}`}
                  className={`flex items-center gap-xs ${linkClass}`}
                >
                  <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
                  <span className="tabular">{CONTACT_WHATSAPP_DISPLAY}</span>
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-xxxl flex flex-col gap-sm border-t border-white/10 pt-lg md:flex-row md:items-center md:justify-between">
          <p className="flex flex-wrap items-center gap-x-md gap-y-xs text-caption text-white/50">
            <span>© {new Date().getFullYear()} FinMatrix. All rights reserved.</span>
            <span>ERP software · Not a bank or payment provider</span>
          </p>
          <p className="flex items-center gap-xs text-caption text-white/50">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Role-based access, enforced on the server
          </p>
        </div>
      </div>
    </footer>
  );
}

export default LandingFooter;
