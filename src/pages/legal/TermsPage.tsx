import { Link } from 'react-router-dom';

import {
  CONTACT_EMAILS,
  CONTACT_EMAIL_PRIMARY,
  CONTACT_WHATSAPP,
  CONTACT_WHATSAPP_DISPLAY,
} from '@/features/landing/constants';
import { normalizeWhatsappPhone } from '@/features/share/shareDocument';

import { LegalLayout, LegalSection } from './LegalLayout';

const list = 'flex list-disc flex-col gap-xs pl-lg';
const strong = 'text-text-primary';
const link = 'text-primary underline';

/**
 * /terms-of-service.
 *
 * Written from what FinMatrix actually is on 8 Nov 2026: hosted ERP software,
 * free during a testing phase (BILLING_DISABLED build), accounts reviewed by a
 * person, owners create staff sign-ins, exports and manual deletion within 30
 * days (see /data-deletion).
 *
 * NEEDS OWNER AND LAWYER REVIEW before it is relied on: there is no registered
 * legal entity yet, so the terms name "FinMatrix" as the provider; the
 * governing-law clause (Pakistan) and the liability limit are reasonable
 * defaults, not advice. Do not add an entity name, address or registration
 * number until they exist.
 */
export default function TermsPage() {
  const email = (
    <a className={link} href={`mailto:${CONTACT_EMAIL_PRIMARY}`}>
      {CONTACT_EMAIL_PRIMARY}
    </a>
  );
  const whatsappHref = `https://wa.me/${normalizeWhatsappPhone(CONTACT_WHATSAPP) ?? ''}`;

  return (
    <LegalLayout
      title="Terms of service"
      updated="8 November 2026"
      intro={
        <p>
          These terms apply when a business, its owner or its team uses FinMatrix. By creating an account or using
          FinMatrix you agree to them on behalf of yourself and the company you set up or work for. In these terms
          &ldquo;FinMatrix&rdquo;, &ldquo;we&rdquo; and &ldquo;us&rdquo; mean the team that provides FinMatrix, and
          &ldquo;you&rdquo; means the company using it and the people it lets in.
        </p>
      }
    >
      <LegalSection title="1. The service">
        <p>
          FinMatrix is enterprise resource planning (ERP) software provided online as a service. It lets a business
          manage inventory, sales and invoicing, purchasing, accounting and its general ledger, deliveries, customers
          and suppliers, payroll and business reports, through a web console and an Android app.
        </p>
        <p>
          FinMatrix is a record-keeping and management tool. It is not a bank, lender, payment provider or financial
          institution: it does not hold, move or lend money, and payments you record in it happen outside it. It does
          not give accounting, tax or legal advice; the figures it produces are only as accurate as what is entered,
          and you remain responsible for your own filings and decisions.
        </p>
      </LegalSection>

      <LegalSection title="2. Accounts">
        <ul className={list}>
          <li>
            The person who registers a company becomes its owner. New companies are reviewed by our team before they
            are switched on, and we may decline a registration.
          </li>
          <li>
            The owner decides who else gets access, creates their sign-ins and chooses their roles, and is responsible
            for what those users do in the company&apos;s account.
          </li>
          <li>
            Keep passwords to yourself, give every person their own sign-in, and tell us at {email} as soon as possible if you
            think an account has been misused.
          </li>
          <li>Information you give us when you register, such as your company details, must be accurate.</li>
          <li>You must be at least 18 and able to agree to these terms for your company.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Acceptable use">
        <p>
          You must use FinMatrix lawfully and in line with our{' '}
          <Link className={link} to="/acceptable-use-policy">
            acceptable use policy
          </Link>
          , which includes the rules for WhatsApp messages sent through FinMatrix.
        </p>
      </LegalSection>

      <LegalSection title="4. Your data">
        <ul className={list}>
          <li>
            Your company&apos;s records stay yours. We store and process them only to provide FinMatrix to you, as
            described in our{' '}
            <Link className={link} to="/privacy-policy">
              privacy policy
            </Link>
            .
          </li>
          <li>You are responsible for having the right to enter information about your customers, suppliers and staff.</li>
          <li>You can export your reports and lists at any time while your account is open.</li>
          <li>
            You can ask for your account and records to be deleted, as described on our{' '}
            <Link className={link} to="/data-deletion">
              data deletion page
            </Link>
            .
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Fees and billing">
        <p>
          FinMatrix is currently in a testing phase, and every feature is provided{' '}
          <strong className={strong}>free of charge</strong>. No card details are taken. If we introduce paid plans, we
          will tell account owners in advance, with the price and what is included, and nothing will be charged unless
          the owner chooses a plan. Plans will not renew automatically without the owner agreeing to it.
        </p>
      </LegalSection>

      <LegalSection title="6. Availability and changes">
        <p>
          We work to keep FinMatrix available and your data safe, but we provide it &ldquo;as is&rdquo; and do not
          promise that it will be uninterrupted or error-free, particularly during the testing phase. We may improve or
          change features over time; if a change takes away something you rely on, we will tell account owners in
          advance where we reasonably can.
        </p>
      </LegalSection>

      <LegalSection title="7. Suspension and termination">
        <ul className={list}>
          <li>You can stop using FinMatrix at any time and ask us to delete your account and records.</li>
          <li>
            We may suspend or close an account, or switch off a feature for it, if it breaks these terms or the
            acceptable use policy, puts other users or the service at risk, is used for fraud or anything illegal, or if
            the law requires it. Unless the situation is urgent, we will tell the owner first and give a chance to put
            it right.
          </li>
          <li>
            When an account is closed you can ask for an export of your records first; after deletion, records cannot be
            recovered, except copies we must keep by law.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="8. Limitation of liability">
        <p>
          As far as the law allows, FinMatrix is not liable for indirect or consequential losses, such as lost profits,
          lost business or lost data that could have been exported, arising from the use of FinMatrix or from being
          unable to use it. Our total liability for any claim is limited to the fees you paid us in the twelve months
          before the claim. Nothing in these terms limits liability that cannot be limited by law.
        </p>
      </LegalSection>

      <LegalSection title="9. Support">
        <p>
          We provide support by email at{' '}
          {CONTACT_EMAILS.map((address, i) => (
            <span key={address}>
              {i > 0 && ' or '}
              <a className={link} href={`mailto:${address}`}>
                {address}
              </a>
            </span>
          ))}{' '}
          and on WhatsApp at{' '}
          <a className={link} href={whatsappHref} target="_blank" rel="noopener noreferrer">
            {CONTACT_WHATSAPP_DISPLAY}
          </a>
          . We answer as soon as we can; during the testing phase there is no guaranteed response time.
        </p>
      </LegalSection>

      <LegalSection title="10. Governing law">
        <p>
          These terms are governed by the laws of Pakistan, where FinMatrix is based. If a dispute arises, please
          contact us first so we can try to resolve it together.
        </p>
      </LegalSection>

      <LegalSection title="11. Changes to these terms">
        <p>
          When these terms change we update this page and the date at the top. For significant changes we will also tell
          account owners in FinMatrix or by email before they take effect. Continuing to use FinMatrix after that means
          you accept the new terms.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
