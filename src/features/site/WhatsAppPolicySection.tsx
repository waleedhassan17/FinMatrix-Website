// ═══════════════════════════════════════════════════════
// FinMatrix — WhatsApp messaging policy
// ═══════════════════════════════════════════════════════
// Lives on /acceptable-use-policy#whatsapp, linked from the footer, /about and
// the privacy policy.
//
// EVERY LINE MATCHES THE CODE, NOT THE ROADMAP (checked 8 Nov 2026 against
// FinMatrix-Backend src/modules/messaging):
//   - Sending from FinMatrix's own number is built but switched off in
//     production (WHATSAPP_ENABLED=false). The page says "not yet available".
//     Change that paragraph, and only that one, on the day it is switched on.
//   - What is live today is the hand-off: FinMatrix opens the user's own
//     WhatsApp with the document ready and the user presses send.
//   - The message list is the templates that exist: invoices, receipts,
//     purchase orders, remittances, statements, payment reminders, plus the
//     once-a-day auto-reply (inbound-reply.ts). Order confirmations, delivery
//     updates and account alerts are NOT built, so they are not listed.
//   - Consent: a send is skipped as `no_consent` unless the contact has an
//     opt-in recorded or the owner confirmed their contacts agreed.
//   - STOP / UNSUBSCRIBE opts that number out for every company and cancels
//     anything queued; START / SUBSCRIBE restores it (message-status.service).
//   - A monthly allowance per company exists (plan-config whatsappMonthlyMessages).

import { Link } from 'react-router-dom';

import { LegalSection } from '@/pages/legal/LegalLayout';

const list = 'flex list-disc flex-col gap-xs pl-lg';
const strong = 'text-text-primary';
const link = 'text-primary underline';

export function WhatsAppPolicySection() {
  return (
    <LegalSection id="whatsapp" title="WhatsApp messaging policy">
      <p>
        <strong className={strong}>Where it stands today.</strong> FinMatrix can open WhatsApp on your own phone or
        computer with an invoice or other document ready to share; you check it and press send from your own WhatsApp
        account. Sending documents from FinMatrix&apos;s own WhatsApp Business number, on a business&apos;s behalf, is
        being set up and is <strong className={strong}>not yet available</strong>. The rules below apply to it from
        the day it is. A document you share from your own WhatsApp is your own message, sent under WhatsApp&apos;s
        terms, and the &ldquo;No marketing&rdquo; and consent rules below are expected of it too.
      </p>

      <p>
        <strong className={strong}>What may be sent.</strong> Only transactional messages about the recipient&apos;s
        own dealings with the business sending them:
      </p>
      <ul className={list}>
        <li>invoices and receipts for payments, to that business&apos;s customers;</li>
        <li>purchase orders and remittance advice, to its suppliers;</li>
        <li>statements of account;</li>
        <li>reminders about invoices that are due or overdue;</li>
        <li>
          one automatic reply a day to anyone who writes back, giving the business&apos;s own contact details.
        </li>
      </ul>
      <p>Every message names the business it comes from, and its documents carry that business&apos;s name.</p>

      <p>
        <strong className={strong}>No marketing.</strong> FinMatrix does not send marketing, promotional or bulk
        messages, and a business may not use FinMatrix to send them. If FinMatrix ever offers promotional messages,
        they will go only to people who have separately agreed to receive them.
      </p>

      <p>
        <strong className={strong}>Consent first.</strong> A business may message a customer or supplier through
        FinMatrix only if that person gave the business their WhatsApp number and agreed to receive these messages on
        WhatsApp. FinMatrix sends only to contacts the business has recorded as having agreed, and skips everyone else.
      </p>

      <p>
        <strong className={strong}>Opting out.</strong> Reply <strong className={strong}>STOP</strong> (or
        UNSUBSCRIBE) to any message from FinMatrix&apos;s number and nothing more is sent to that number, for any
        business, including anything still waiting to go. Reply <strong className={strong}>START</strong> to receive
        messages again. You can also ask the business itself to stop.
      </p>

      <p>
        <strong className={strong}>The rules businesses must follow.</strong> A business using FinMatrix&apos;s
        WhatsApp messaging must follow the{' '}
        <a className={link} href="https://whatsappbusiness.com/policy/" target="_blank" rel="noopener noreferrer">
          WhatsApp Business Messaging Policy
        </a>
        , including WhatsApp&apos;s policy for commerce, and the law where it and its recipients are. Messages must be
        accurate and about real transactions.
      </p>

      <p>
        <strong className={strong}>Enforcement.</strong> Each business has a monthly message allowance. FinMatrix may
        pause or switch off WhatsApp messaging for a business that breaks these rules or draws repeated complaints.
        How message data is handled is set out in the{' '}
        <Link className={link} to="/privacy-policy">
          privacy policy
        </Link>
        .
      </p>
    </LegalSection>
  );
}

export default WhatsAppPolicySection;
