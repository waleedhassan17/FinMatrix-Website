import { Link } from 'react-router-dom';

import { CONTACT_EMAIL_PRIMARY } from '@/features/landing/constants';
import { WhatsAppPolicySection } from '@/features/site/WhatsAppPolicySection';

import { LegalLayout, LegalSection } from './LegalLayout';

const list = 'flex list-disc flex-col gap-xs pl-lg';
const link = 'text-primary underline';

/**
 * /acceptable-use-policy, with the WhatsApp messaging policy at #whatsapp.
 * Part of the terms of service. Plain rules a business owner can read in two
 * minutes; nothing here promises enforcement machinery FinMatrix does not have.
 */
export default function AcceptableUsePage() {
  const email = (
    <a className={link} href={`mailto:${CONTACT_EMAIL_PRIMARY}?subject=${encodeURIComponent('Reporting misuse of FinMatrix')}`}>
      {CONTACT_EMAIL_PRIMARY}
    </a>
  );
  return (
    <LegalLayout
      title="Acceptable use policy"
      updated="8 November 2026"
      intro={
        <p>
          FinMatrix is software for running a business: its stock, sales, purchases, accounts and deliveries. This
          policy says what it may not be used for, and how WhatsApp messages sent through it must be handled. It is part
          of the{' '}
          <Link className={link} to="/terms-of-service">
            terms of service
          </Link>{' '}
          and applies to every company, owner and team member using FinMatrix.
        </p>
      }
    >
      <LegalSection title="Use FinMatrix for real business records">
        <p>
          Use FinMatrix to record and run your own company&apos;s genuine operations. Each person who uses it should
          have their own sign-in, created by the company owner, so that what they do is recorded under their name.
        </p>
      </LegalSection>

      <LegalSection title="Do not use FinMatrix to">
        <ul className={list}>
          <li>
            record or support anything illegal where you or your customers are, including trade in goods or services
            that are prohibited there;
          </li>
          <li>
            create false invoices, fake transactions or records meant to mislead anyone, such as tax authorities,
            auditors, lenders, customers or suppliers;
          </li>
          <li>
            store information about people that you have no right to hold, or use it in ways they have not been told
            about;
          </li>
          <li>send spam, or send messages to people who have not agreed to receive them;</li>
          <li>
            reach another company&apos;s data, get around the limits of your role, or test FinMatrix&apos;s security
            without our written permission;
          </li>
          <li>upload malware, overload the service, or interfere with other people&apos;s use of it;</li>
          <li>harass, threaten or impersonate anyone;</li>
          <li>resell, rent or share access to FinMatrix outside your own company without our written agreement.</li>
        </ul>
      </LegalSection>

      <WhatsAppPolicySection />

      <LegalSection title="Reporting misuse">
        <p>
          If you think someone is misusing FinMatrix, including a WhatsApp message you did not agree to receive,
          email {email} with what happened and, if you can, the business name and the date.
        </p>
      </LegalSection>

      <LegalSection title="If this policy is broken">
        <p>
          We may warn the company, switch off the feature being misused, or suspend or close the account, as set out in
          the terms of service. Where the law requires it, we may report illegal activity to the authorities.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
