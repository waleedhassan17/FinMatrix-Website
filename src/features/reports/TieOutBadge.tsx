import { AlertTriangle, Check } from 'lucide-react';

import { cn } from '@/lib/cn';
import { formatAmount } from '@/utils/money';

export interface TieOutBadgeProps {
  /** The server's verdict, taken on raw figures — never recomputed here. */
  ok: boolean;
  /** What a pass is called: "Balanced" (A = L + E, Dr = Cr) or "Ties" (two reports agree). */
  okLabel?: 'Balanced' | 'Ties';
  /** The difference when it does not tie. Shown unsigned. */
  gap?: number;
  /** What is being tied, in words: "Assets = Liabilities + Equity". */
  title: string;
  className?: string;
}

/**
 * A statement's tie-out as a small badge in its header: "✓ Balanced",
 * "✓ Ties", or "⚠ Gap: 12.40". Quiet when the books agree — the reader does
 * not need a green banner on every visit — and pointed when they do not, with
 * the full `BalanceWarning` card shown on the page as well.
 */
export function TieOutBadge({ ok, okLabel = 'Balanced', gap = 0, title, className }: TieOutBadgeProps) {
  return (
    <span
      title={title}
      aria-label={ok ? `${title}: ${okLabel.toLowerCase()}` : `${title}: out by ${formatAmount(Math.abs(gap))}`}
      className={cn(
        'inline-flex items-center gap-[3px] rounded-full border px-xs py-[1px] text-label-sm',
        ok
          ? 'border-border-light bg-surface-2 text-text-secondary'
          : 'border-danger-light bg-danger-lighter text-danger',
        className,
      )}
    >
      {ok ? (
        <Check className="size-3 text-success" aria-hidden="true" />
      ) : (
        <AlertTriangle className="size-3" aria-hidden="true" />
      )}
      {ok ? okLabel : `Gap: ${formatAmount(Math.abs(gap))}`}
    </span>
  );
}

export default TieOutBadge;
