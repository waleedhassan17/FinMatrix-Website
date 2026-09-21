// ═══════════════════════════════════════════════════════
// FinMatrix Web — Footer
// ═══════════════════════════════════════════════════════
// The darkest step of the page's navy ramp, with the grid pattern fading in
// from the top so the footer reads as a surface rather than a black bar.
//
// Every link goes somewhere real. A footer full of href="#" placeholders looks
// complete in a screenshot and is broken the moment anyone clicks.

import { BarChart3, Mail, MapPin, MessageCircle, ShieldCheck, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  CONTACT_EMAIL,
  CONTACT_WHATSAPP,
  CONTACT_WHATSAPP_DISPLAY,
  OWNER_NAME,
} from '@/features/landing/constants';
import { normalizeWhatsappPhone } from '@/features/share/shareDocument';

const PRODUCT = [
  { label: 'Features', href: '#modules' },
  { label: 'How it works', href: '#how-it-works' },
  // BILLING-DISABLED BUILD: dead anchor, see LandingPage.
  // { label: 'Pricing', href: '#pricing' },
  { label: 'Questions', href: '#faq' },
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

      <div className="mx-auto max-w-[1200px] px-lg pt-xxxxl pb-xl lg:pt-section">
        <div className="grid gap-xxxl md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div className="flex items-center gap-sm">
              <span className="flex size-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/20">
                <BarChart3 className="size-5 text-text-inverse" aria-hidden="true" />
              </span>
              <span className="text-h3 text-text-inverse">FinMatrix</span>
            </div>
            <p className="mt-lg max-w-[380px] text-body-sm text-white/65">
              Accounting, inventory, purchasing and deliveries on one ledger —
              built for warehouse and distribution businesses in Pakistan.
            </p>
            <p className="mt-lg inline-flex items-center gap-xs rounded-full border border-white/10 bg-white/5 px-sm py-xxs text-label-sm text-white/70">
              <MapPin className="size-3.5 text-success-bright" aria-hidden="true" />
              Built in Pakistan · Prices in PKR
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

          <nav aria-labelledby="footer-contact">
            <p id="footer-contact" className="text-overline text-white/45">
              Contact
            </p>
            <ul className="mt-md flex flex-col gap-sm">
              <li className="flex items-center gap-xs text-body-sm text-text-inverse">
                <UserRound className="size-4 shrink-0 text-white/65" aria-hidden="true" />
                <span>{OWNER_NAME}</span>
              </li>
              <li>
                <a
                  href={WHATSAPP_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Chat on WhatsApp: ${CONTACT_WHATSAPP_DISPLAY}`}
                  className={`flex items-center gap-xs ${linkClass}`}
                >
                  <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
                  <span className="tabular">WhatsApp {CONTACT_WHATSAPP_DISPLAY}</span>
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className={`flex items-center gap-xs ${linkClass}`}
                >
                  <Mail className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{CONTACT_EMAIL}</span>
                </a>
              </li>
              <li className="mt-xs flex flex-wrap items-center gap-x-md gap-y-xs">
                <Link to="/get-started" className={linkClass}>
                  Sign in
                </Link>
                <Link to="/register" className={linkClass}>
                  Create an account
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-xxxl flex flex-col gap-sm border-t border-white/10 pt-lg md:flex-row md:items-center md:justify-between">
          <p className="text-caption text-white/50">
            © {new Date().getFullYear()} FinMatrix. All rights reserved.
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
