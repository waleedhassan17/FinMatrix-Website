import { CONTACT_EMAIL_PRIMARY } from '@/features/landing/constants';

import { LegalLayout, LegalSection } from './LegalLayout';

const list = 'flex list-decimal flex-col gap-xs pl-lg';

/** /data-deletion: how to have data removed (the URL Meta asks apps for). */
export default function DataDeletionPage() {
  const mail = `mailto:${CONTACT_EMAIL_PRIMARY}?subject=${encodeURIComponent('Delete my FinMatrix data')}`;
  return (
    <LegalLayout title="Deleting your data" updated="6 November 2026">
      <LegalSection title="If you have a FinMatrix account">
        <ol className={list}>
          <li>
            Email{' '}
            <a className="text-primary underline" href={mail}>
              {CONTACT_EMAIL_PRIMARY}
            </a>{' '}
            from the address you sign in with, with the subject &ldquo;Delete my FinMatrix data&rdquo; and your company
            name.
          </li>
          <li>We confirm the request with you, so nobody else can delete your account.</li>
          <li>
            Within 30 days we delete the account and the company&apos;s records, except anything we must keep by law,
            and tell you when it is done.
          </li>
        </ol>
      </LegalSection>

      <LegalSection title="If a business sent you documents through FinMatrix">
        <ul className="flex list-disc flex-col gap-xs pl-lg">
          <li>
            To stop WhatsApp messages, reply <strong className="text-text-primary">STOP</strong> to any of them.
          </li>
          <li>
            To have your details removed from that business&apos;s records, ask the business: its contact details are on
            the documents it sent you.
          </li>
          <li>
            You can also email{' '}
            <a className="text-primary underline" href={mail}>
              {CONTACT_EMAIL_PRIMARY}
            </a>{' '}
            with your WhatsApp number and we will remove it from FinMatrix&apos;s messaging.
          </li>
        </ul>
      </LegalSection>
    </LegalLayout>
  );
}
