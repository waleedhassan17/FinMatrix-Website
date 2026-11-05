import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CONTACT_STATUS_WORDS, type ContactStatus } from '@/models/messaging';
import { formatWhatsappPreview } from './whatsappPreview';
import { useConnect, useContactWhatsapp } from './useConnect';

const TONE: Record<ContactStatus, string> = {
  ready: 'bg-success-lighter text-success',
  unverified: 'bg-success-lighter text-success',
  no_consent: 'bg-warning-lighter text-warning',
  missing: 'bg-neutral-100 text-text-secondary',
  invalid: 'bg-neutral-100 text-text-secondary',
  not_on_whatsapp: 'bg-danger-lighter text-danger',
  opted_out: 'bg-danger-lighter text-danger',
};

/**
 * Whether FinMatrix Connect can message this customer or vendor: Ready, No
 * number, Not on WhatsApp, Opted out (or No consent). Nothing when Connect is off.
 */
export function ContactWhatsappStatus({
  partyType,
  partyId,
  className,
}: {
  partyType: 'customer' | 'vendor';
  partyId: string | null | undefined;
  className?: string;
}) {
  const { enabled } = useConnect();
  const row = useContactWhatsapp(partyType, partyId, enabled);
  if (!enabled || !row) return null;
  const number = formatWhatsappPreview(row.whatsappE164);
  return (
    <span className={cn('inline-flex items-center gap-xs', className)}>
      <MessageCircle className="size-4 text-text-secondary" aria-hidden="true" />
      <span className={cn('rounded-full px-xs py-xxs text-label-sm', TONE[row.status])}>
        WhatsApp: {CONTACT_STATUS_WORDS[row.status]}
      </span>
      {number ? <span className="text-body-sm text-text-secondary tabular">{number}</span> : null}
    </span>
  );
}
