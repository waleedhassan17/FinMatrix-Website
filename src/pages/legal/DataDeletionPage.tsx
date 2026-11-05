import { CONTACT_EMAIL_PRIMARY } from '@/features/landing/constants';

import { LegalLayout, LegalSection } from './LegalLayout';

const steps = 'flex list-decimal flex-col gap-xs pl-lg';
const list = 'flex list-disc flex-col gap-xs pl-lg';

/**
 * /data-deletion: how to have data removed. This is the URL Meta and Google
 * Play ask apps for. Deletion is done by FinMatrix staff on request, so every
 * promise here must stay one the team can keep by hand.
 */
export default function DataDeletionPage() {
  const mail = `mailto:${CONTACT_EMAIL_PRIMARY}?subject=${encodeURIComponent('Delete my FinMatrix data')}`;
  const email = (
    <a className="text-primary underline" href={mail}>
      {CONTACT_EMAIL_PRIMARY}
    </a>
  );
  return (
    <LegalLayout title="Deleting your data" updated="6 November 2026">
      <LegalSection title="If you have a FinMatrix account">
        <ol className={steps}>
          <li>
            Email {email} from the address you sign in with, with the subject &ldquo;Delete my FinMatrix data&rdquo;
            and your company&apos;s name. A company&apos;s owner can ask for the whole company to be deleted. Team
            members and riders can ask their owner to remove them, or write to us.
          </li>
          <li>We confirm the request with you first, so nobody else can delete your account.</li>
          <li>
            Within 30 days of confirming, we delete the account and its information from our active systems: the
            company&apos;s records, its team members, uploaded files and messages. We tell you when it is done.
          </li>
        </ol>
      </LegalSection>

      <LegalSection title="What we keep">
        <ul className={list}>
          <li>
            Information we must keep by law, such as records of payments made to FinMatrix, and what we need to resolve
            disputes, prevent fraud or keep FinMatrix secure.
          </li>
          <li>Backups, until they are overwritten on their rolling schedule.</li>
        </ul>
        <p>
          Businesses often have to keep financial records for several years under tax law, so export the reports and
          lists you need before asking for deletion.
        </p>
      </LegalSection>

      <LegalSection title="If a business sent you documents through FinMatrix">
        <ul className={list}>
          <li>
            To stop WhatsApp messages, reply <strong className="text-text-primary">STOP</strong> to any of them.
          </li>
          <li>
            To have your details removed from that business&apos;s records, ask the business: its contact details are
            on the documents it sent you.
          </li>
          <li>You can also email {email} with your WhatsApp number and we will remove it from FinMatrix&apos;s messaging.</li>
        </ul>
      </LegalSection>
    </LegalLayout>
  );
}
