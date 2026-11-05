import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { normalizeWhatsappPhone, whatsappUrl } from '@/features/share/shareDocument';
import { logManualShare, sendMessage } from '@/networks/messaging/messagingNetwork';
import type { SendableDocType } from '@/models/messaging';
import { messagingKeys, useConnect } from './useConnect';

/**
 * One WhatsApp button for any document.
 * - Connect on: the SERVER sends (with the PDF); the toast says "Queued".
 * - Connect off: the wa.me chat opens with `text`, as before, and the share is
 *   recorded on the document's timeline when the plan has Connect.
 * - No usable number or opted out: disabled, and says why.
 */
export function SendOnWhatsAppButton({
  label,
  docType,
  docId,
  event,
  phone,
  optedOut,
  text,
  variant = 'secondary',
}: {
  label: string;
  docType: SendableDocType;
  docId: string;
  event?: string;
  phone: string | null | undefined;
  optedOut?: boolean;
  /** The message for the wa.me hand-off (Connect off). */
  text: string;
  variant?: 'primary' | 'secondary' | 'text';
}) {
  const { enabled, featureOn } = useConnect();
  const queryClient = useQueryClient();
  const number = normalizeWhatsappPhone(phone ?? '');
  const reason = optedOut ? 'Opted out of WhatsApp' : !number ? 'No WhatsApp number' : null;

  const send = useMutation({
    mutationFn: () => sendMessage({ docType, docId, event }),
    onSuccess: (r) => {
      if (r.status === 'queued' || r.status === 'sending' || r.status === 'sent') {
        toast.success('Queued', { description: 'WhatsApp sends it in a few seconds.' });
      } else {
        toast.info('Not sent', { description: r.skipReason ?? 'WhatsApp did not take it.' });
      }
      void queryClient.invalidateQueries({ queryKey: messagingKeys.all });
    },
    onError: (e: Error) => toast.error('Could not send', { description: e.message }),
  });

  const onClick = () => {
    if (reason) return;
    if (enabled) {
      send.mutate();
      return;
    }
    window.open(whatsappUrl(phone ?? '', text), '_blank', 'noopener');
    if (featureOn && phone) {
      void logManualShare({ docType, docId, toPhone: phone, event })
        .then(() => queryClient.invalidateQueries({ queryKey: messagingKeys.all }))
        .catch(() => undefined);
    }
  };

  return (
    <span className="inline-flex flex-col items-start">
      <Button
        variant={variant}
        onClick={onClick}
        disabled={!!reason || send.isPending}
        title={reason ?? undefined}
        aria-describedby={reason ? `wa-reason-${docId}` : undefined}
      >
        <MessageCircle className="size-4" aria-hidden="true" />
        {send.isPending ? 'Sending…' : label}
      </Button>
      {reason ? (
        <span id={`wa-reason-${docId}`} className="mt-xxs text-caption text-text-tertiary">
          {reason}
        </span>
      ) : null}
    </span>
  );
}
