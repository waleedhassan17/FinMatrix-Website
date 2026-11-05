import { CONTACT_EMAIL_PRIMARY } from '@/features/landing/constants';

import { LegalLayout, LegalSection } from './LegalLayout';

const list = 'flex list-disc flex-col gap-xs pl-lg';

/** /privacy: what FinMatrix keeps, why, and who else touches it. */
export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy policy" updated="6 November 2026">
      <p>
        FinMatrix is accounting, inventory, purchasing and delivery software used by businesses. This page explains what
        information FinMatrix holds, why, and the choices you have.
      </p>

      <LegalSection title="Who this covers">
        <ul className={list}>
          <li>
            <strong className="text-text-primary">Businesses that use FinMatrix</strong> and their team members and
            delivery riders.
          </li>
          <li>
            <strong className="text-text-primary">Their customers and suppliers</strong>, whose details a business
            enters into FinMatrix and who may receive documents from that business.
          </li>
        </ul>
        <p>
          For the records a business keeps about its customers and suppliers, that business decides what is entered and
          why. FinMatrix stores and processes those records for the business.
        </p>
      </LegalSection>

      <LegalSection title="What we hold">
        <ul className={list}>
          <li>Account details: name, email address, phone number, company name and address.</li>
          <li>
            Business records a company enters: customers, suppliers, invoices, payments, bills, purchase orders,
            inventory, deliveries and reports.
          </li>
          <li>Delivery data: while a rider is on a delivery, the app records the delivery&apos;s location and status.</li>
          <li>Security logs: sign-ins and important changes, to protect accounts and investigate problems.</li>
        </ul>
      </LegalSection>

      <LegalSection title="WhatsApp messages">
        <p>
          When a business switches on WhatsApp in FinMatrix, FinMatrix sends that business&apos;s documents (such as
          invoices, receipts, purchase orders, statements and payment reminders) to its customers and suppliers from
          FinMatrix&apos;s WhatsApp number. Every message names the business it comes from and attaches its document.
        </p>
        <ul className={list}>
          <li>
            Messages go only to contacts the business has recorded as agreeing to receive them on WhatsApp.
          </li>
          <li>
            To deliver them we use the recipient&apos;s name, WhatsApp number and the document. Meta&apos;s WhatsApp
            Business Platform carries the message and tells us whether it was delivered and read.
          </li>
          <li>
            Reply <strong className="text-text-primary">STOP</strong> at any time and no more messages will be sent to
            your number. Reply <strong className="text-text-primary">START</strong> to receive them again.
          </li>
          <li>
            Other replies get one automatic answer with the business&apos;s own contact details; replies are not read by
            a person at FinMatrix.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="How we use it">
        <p>
          To run the service a business signed up for, keep accounts secure, send the documents and notices described
          above, and answer support requests. We do not sell personal information and we do not use it for advertising.
        </p>
      </LegalSection>

      <LegalSection title="Who else handles it">
        <p>
          The providers that host FinMatrix and store its files and emails, and Meta for WhatsApp delivery. Each only
          receives what it needs for its part of the service. We share information with others only when the law
          requires it.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <p>
          While the business&apos;s account is open. When an account is closed, or deletion is requested, we delete its
          data (see <a className="text-primary underline" href="/data-deletion">data deletion</a>), except what we must
          keep by law. Backups are overwritten within a limited period.
        </p>
      </LegalSection>

      <LegalSection title="Your choices">
        <ul className={list}>
          <li>
            Customers and suppliers of a business: ask that business to correct or remove your details, or reply STOP
            to stop WhatsApp messages.
          </li>
          <li>
            Account holders: you can see and correct your details in FinMatrix, and ask us for a copy or for deletion
            at <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL_PRIMARY}`}>{CONTACT_EMAIL_PRIMARY}</a>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Connections are encrypted, access inside a company follows each person&apos;s role and is checked on the
          server, and secrets such as WhatsApp access tokens are stored encrypted.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>When this policy changes, the date at the top changes with it.</p>
      </LegalSection>
    </LegalLayout>
  );
}
