import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import { DELIVERY_STATUS_LABELS, type DeliveryStatus } from '@/models/delivery';
import { PRIORITY_CONFIG } from '@/theme/status';

/** A delivery's status in the product's words — `pending` reads "Assigned". */
export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  return <StatusBadge status={status} label={DELIVERY_STATUS_LABELS[status] ?? status} />;
}

/**
 * Priority, in the colours both clients share (theme/status PRIORITY_CONFIG).
 * Inline colours for the same reason StatusBadge uses them: the value is a
 * runtime token, not a class Tailwind saw at build time.
 */
export function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.normal;
  return (
    <span
      className="inline-flex items-center rounded-xs px-2 py-1 text-label-sm whitespace-nowrap"
      style={{ color: cfg.color, backgroundColor: cfg.bg }}
    >
      {cfg.label}
    </span>
  );
}

/**
 * Is this rider working?
 *
 * The dot reports DUTY — whether the rider has put themselves on shift — and
 * the tooltip adds whether their phone is currently reporting GPS. Those are
 * two facts, and this used to show only the second while calling it "Online":
 * a rider who went on duty with an empty queue sent no location pings and so
 * appeared offline everywhere, including to the dispatcher deciding who could
 * take a job.
 *
 * `locationLive` is deliberately optional. Omit it where GPS is not known and
 * the dot still answers the question that matters.
 */
export function DutyDot({
  onDuty,
  locationLive,
}: {
  onDuty: boolean;
  locationLive?: boolean;
}) {
  const duty = onDuty ? 'On duty' : 'Off duty';
  const gps =
    locationLive === undefined ? '' : locationLive ? ' · location live' : ' · no recent location';
  return (
    <span
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        onDuty ? 'bg-success' : 'bg-neutral-200',
      )}
      title={`${duty}${gps}`}
      aria-label={duty}
    />
  );
}
