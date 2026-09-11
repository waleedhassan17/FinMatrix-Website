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

/** Green when the rider's phone has reported a location in the last two minutes. */
export function OnlineDot({ online }: { online: boolean }) {
  return (
    <span
      className={cn('inline-block size-2 shrink-0 rounded-full', online ? 'bg-success' : 'bg-neutral-200')}
      title={online ? 'Sharing location now' : 'No recent location'}
      aria-label={online ? 'Online' : 'Offline'}
    />
  );
}
