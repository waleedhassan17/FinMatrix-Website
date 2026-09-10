import { cn } from '@/lib/cn';
import { statusLabel, statusStyle } from '@/theme/status';

interface StatusBadgeProps {
  /** Raw status word from the API — `paid`, `pending_approval`, `overdue`… */
  status: string;
  /** Override the derived label. Use when the domain word differs from the UI word. */
  label?: string;
  className?: string;
}

/**
 * The one badge. Colours come from statusStyle(), which both clients share, so
 * an overdue invoice is the same red here as it is on the phone.
 *
 * Colours are inline rather than utility classes because the tier is resolved
 * at runtime from an arbitrary status string — Tailwind cannot generate a class
 * for a value it never sees at build time.
 */
export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const { fg, bg } = statusStyle(status);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-xs px-2 py-1 text-label-sm whitespace-nowrap',
        className,
      )}
      style={{ color: fg, backgroundColor: bg }}
    >
      {label ?? statusLabel(status)}
    </span>
  );
}

export default StatusBadge;
