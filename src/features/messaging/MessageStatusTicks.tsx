import { Check, CheckCheck, CircleAlert, CircleMinus, CircleX, Clock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { STATUS_WORDS, tickSpec, type MessageStatus } from '@/models/messaging';

const TONE = {
  muted: 'text-text-tertiary',
  neutral: 'text-text-secondary',
  accent: 'text-info',
  danger: 'text-danger',
} as const;

/**
 * WhatsApp delivery ticks: a clock while waiting, one check sent, two checks
 * delivered, two checks in the accent colour when read, an alert when it
 * failed, muted when it was not sent. The status is always there in words for
 * screen readers (and visibly with `showLabel`).
 */
export function MessageStatusTicks({
  status,
  showLabel = false,
  className,
}: {
  status: MessageStatus;
  showLabel?: boolean;
  className?: string;
}) {
  const spec = tickSpec(status);
  const words = STATUS_WORDS[status];
  const tone = TONE[spec.tone];
  const Icon =
    spec.icon === 'clock'
      ? Clock
      : spec.icon === 'alert-circle'
        ? CircleAlert
        : spec.icon === 'x-circle'
          ? CircleX
          : spec.icon === 'minus-circle'
            ? CircleMinus
            : spec.double
              ? CheckCheck
              : Check;
  return (
    <span
      className={cn('inline-flex items-center gap-xxs', tone, className)}
      title={`WhatsApp: ${words}`}
      data-status={status}
    >
      <Icon className="size-4" aria-hidden="true" />
      {showLabel ? <span className="text-label-sm">{words}</span> : <span className="sr-only">WhatsApp: {words}</span>}
    </span>
  );
}
