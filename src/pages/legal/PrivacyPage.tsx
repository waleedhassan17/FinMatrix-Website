import { Link } from 'react-router-dom';

import { CONTACT_EMAIL_PRIMARY } from '@/features/landing/constants';

import { LegalLayout, LegalSection } from './LegalLayout';

const list = 'flex list-disc flex-col gap-xs pl-lg';
const strong = 'text-text-primary';

/**
 * /privacy-policy (and its older address /privacy, which Meta's app settings
 * still use). Every statement here was checked against what FinMatrix actually
 * does (backend, web and mobile code, 6 Nov 2026; WhatsApp status re-checked
 * 8 Nov 2026). When a feature changes what is collected, stored or shared,
 * change this page and its date with it.
 */
export default function PrivacyPage() {
  const email = (
    <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL_PRIMARY}`}>
      {CONTACT_EMAIL_PRIMARY}
    </a>
  );
  return (
    <LegalLayout title="Privacy policy" updated="8 November 2026">
      <p>
        FinMatrix provides accounting, inventory, purchasing, payroll and delivery software to businesses, through our
        website, web app, mobile app and WhatsApp messaging (together, &ldquo;FinMatrix&rdquo;). This policy explains
        what information FinMatrix holds, why, who it is shared with, and the choices you have.
      </p>

      <LegalSection title="Who is responsible for your information">
        <p>
          FinMatrix is responsible for the information it needs to run your account, such as your sign-in details and
          your company&apos;s subscription.
        </p>
        <p>
          The business records a company keeps in FinMatrix &mdash; about its customers, suppliers, employees and
          transactions &mdash; belong to that company. FinMatrix stores and processes them on the company&apos;s behalf
          and on its instructions. The company decides what to enter and is responsible for having the right to do so,
          including telling the people concerned and getting any consent they need to give.
        </p>
        <p>
          If you are a customer, supplier, employee or rider of a business that uses FinMatrix, please contact that
          business first about your information.
        </p>
      </LegalSection>

      <LegalSection title="What we collect">
        <ul className={list}>
          <li>
            <strong className={strong}>Account and company details:</strong> names, email addresses, phone numbers and
            passwords (stored only in hashed form, so we never see them); company name, address, tax registration number
            and logo; team members&apos; usernames and roles.
          </li>
          <li>
            <strong className={strong}>Business records:</strong> customers and suppliers (names, contact details,
            addresses, WhatsApp numbers and messaging consent), invoices, estimates, sales and purchase orders, bills and
            payments (with any proof of payment attached), bank and cash entries, inventory with item photos, budgets, tax settings and reports.
          </li>
          <li>
            <strong className={strong}>Payroll records:</strong> when a company runs payroll in FinMatrix, its
            employees&apos; names, contact details, job details, start and leaving dates, salaries or pay rates, tax
            numbers, bank account details and deductions.
          </li>
          <li>
            <strong className={strong}>Delivery records:</strong> delivery addresses and recipients, status updates,
            photos riders take of bills, and amounts collected.
          </li>
          <li>
            <strong className={strong}>Rider location:</strong> the FinMatrix mobile app collects a rider&apos;s precise
            location, including while the app is in the background, but only while the rider is on duty or working a
            delivery. The rider&apos;s company sees it to follow its deliveries, and it is kept with the delivery
            records. Tracking stops when the rider goes off duty.
          </li>
          <li>
            <strong className={strong}>Payments for FinMatrix:</strong> proof-of-payment images you upload when you pay
            for a subscription.
          </li>
          <li>
            <strong className={strong}>Technical and security information:</strong> the IP address and browser or
            device details recorded with sign-ins and important changes, server logs, and error reports we use to fix
            problems.
          </li>
          <li>
            <strong className={strong}>On your device:</strong> the web app and mobile app keep your sign-in session and
            preferences in your browser&apos;s or the app&apos;s storage. FinMatrix does not use advertising or tracking
            cookies.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="WhatsApp messages">
        <p>
          Sending from FinMatrix&apos;s own WhatsApp number is being set up and is not yet available to businesses;
          this section describes how it will handle information once it is. When a business switches on WhatsApp in
          FinMatrix, FinMatrix sends that business&apos;s documents (such as invoices, receipts, purchase orders,
          statements and payment reminders) to its customers and suppliers from FinMatrix&apos;s WhatsApp number. Every
          message names the business it comes from. The rules for these messages are in our{' '}
          <Link className="text-primary underline" to="/acceptable-use-policy#whatsapp">
            WhatsApp messaging policy
          </Link>
          .
        </p>
        <ul className={list}>
          <li>Messages go only to contacts the business has recorded as agreeing to receive them on WhatsApp.</li>
          <li>
            To send them we use the recipient&apos;s name, WhatsApp number and the document. Meta&apos;s WhatsApp
            Business Platform delivers each message and tells us whether it was delivered and read; it may also give us
            a WhatsApp user ID, which we use only to recognise that contact&apos;s replies.
          </li>
          <li>
            Reply <strong className={strong}>STOP</strong> at any time and no more messages will be sent to your number.
            Reply <strong className={strong}>START</strong> to receive them again.
          </li>
          <li>
            Any other reply gets at most one automatic answer a day, with the business&apos;s own contact details.
            Replies are not read by FinMatrix staff.
          </li>
          <li>
            Information we receive from Meta is used only to deliver messages, show their status, answer replies and
            honour opt-outs.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="How we use information">
        <ul className={list}>
          <li>To provide FinMatrix: keep the books, run payroll, produce documents and reports, and manage deliveries.</li>
          <li>To send the documents and notices a business asks us to send, by WhatsApp or email.</li>
          <li>
            To send service emails, such as verification codes and account and subscription notices. We do not send
            marketing emails.
          </li>
          <li>To keep accounts secure, prevent fraud and misuse, and find and fix problems.</li>
          <li>To answer support requests and to bill for subscriptions.</li>
          <li>To meet our legal obligations.</li>
        </ul>
        <p>We do not sell personal information, and we do not use it for advertising.</p>
      </LegalSection>

      <LegalSection title="Who we share it with">
        <ul className={list}>
          <li>
            <strong className={strong}>Within your company:</strong> the people the owner adds, with the access their
            role allows.
          </li>
          <li>
            <strong className={strong}>Service providers</strong> that run parts of FinMatrix for us, and only for that
            purpose: cloud hosting and databases (such as Heroku and Vercel), file storage (Cloudinary), email delivery,
            maps (Google Maps, which receives delivery addresses to place them on the map), WhatsApp delivery (Meta),
            and error monitoring (such as Sentry, set up not to collect personal information).
          </li>
          <li>
            <strong className={strong}>FinMatrix staff:</strong> only authorised staff, to approve accounts, manage
            subscriptions, give the support you ask for, and keep FinMatrix secure.
          </li>
          <li>
            <strong className={strong}>When the law requires it</strong>, or to protect the rights, property or safety of
            FinMatrix, our users or others.
          </li>
          <li>
            <strong className={strong}>If FinMatrix changes ownership:</strong> in a merger, acquisition or sale of
            assets, information may be transferred as part of the business, and this policy will continue to apply to
            it.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Where it is stored">
        <p>
          Our service providers store and process information in data centres outside Pakistan, including in the United
          States. We choose providers that protect it with industry-standard security.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <ul className={list}>
          <li>For as long as the company&apos;s account is open.</li>
          <li>
            When an account is closed or deletion is requested, we delete its information from our active systems within
            30 days of confirming the request, except what we must keep by law or need to resolve disputes, prevent fraud
            or keep FinMatrix secure. Backups are overwritten on a rolling schedule.
          </li>
          <li>
            Businesses often have to keep financial records for several years under tax law, so export what you need
            before asking for deletion.
          </li>
        </ul>
        <p>
          How to ask: see <a className="text-primary underline" href="/data-deletion">deleting your data</a>.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Connections to FinMatrix are encrypted, passwords are stored hashed, each person&apos;s access within a
          company follows their role and is checked on our servers, secrets such as access tokens are stored encrypted,
          and important changes are recorded in an audit trail. No system is completely secure; if a breach affects your
          information, we will tell you as the law requires.
        </p>
      </LegalSection>

      <LegalSection title="Your choices">
        <ul className={list}>
          <li>See and correct most of your information in FinMatrix, and export your reports and lists.</li>
          <li>Ask us for a copy of your information, or for it to be deleted, at {email}.</li>
          <li>
            Riders can change location permission in their phone&apos;s settings; without it, their company cannot
            follow their deliveries.
          </li>
          <li>Reply STOP to any WhatsApp message from FinMatrix to stop them.</li>
          <li>Depending on where you live, you may have further rights over your information; contact us to use them.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Children">
        <p>FinMatrix is made for businesses and is not meant for anyone under 18.</p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          When our practices change we update this page and the date at the top. For significant changes we will also
          tell account owners in FinMatrix or by email.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
