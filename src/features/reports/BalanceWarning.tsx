import { AlertTriangle, Check } from 'lucide-react';

import { cn } from '@/lib/cn';
import { formatMoney } from '@/utils/money';

export interface BalanceWarningProps {
  balanced: boolean;
  /** What should tie, and against what. */
  left: { label: string; value: number };
  right: { label: string; value: number };
  className?: string;
}

/**
 * The verdict on a statement that must tie, and by how much it does not.
 *
 * **The amount is the point.** The app shows a bare "Out of balance" badge, which
 * tells a user their books are wrong and gives them nothing to go looking for — a
 * paisa of presentation rounding and a missing fifty-thousand-rupee entry look
 * identical. Naming the difference is the difference between an alarm and a lead.
 *
 * Both statements that use this get `isBalanced` from the server, decided on
 * unrounded four-decimal figures before presentation rounding. That flag is
 * trusted rather than recomputed here: re-testing the rounded totals is exactly
 * how a ledger that ties to the last unit comes to report a one-paisa gap, and
 * telling a business its books do not balance when they do sends someone hunting
 * an error that was never posted.
 */
export function BalanceWarning({
  balanced,
  left,
  right,
  className,
}: BalanceWarningProps) {
  const difference = left.value - right.value;

  if (balanced) {
    return (
      <div
        className={cn(
          'flex items-center gap-sm rounded-md border border-success-light bg-success-lighter p-md',
          className,
        )}
      >
        <Check className="size-4 shrink-0 text-success" />
        <p className="text-body-sm text-text-primary">
          In balance — {left.label} equals {right.label.toLowerCase()} at{' '}
          {formatMoney(left.value)}.
        </p>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-sm rounded-md border border-danger-light bg-danger-lighter p-md',
        className,
      )}
    >
      <AlertTriangle className="mt-[2px] size-4 shrink-0 text-danger" />
      <div className="text-body-sm text-text-primary">
        <p>
          <strong>Out of balance by {formatMoney(Math.abs(difference))}.</strong>{' '}
          {left.label} is {formatMoney(left.value)} against {right.label.toLowerCase()}{' '}
          of {formatMoney(right.value)}.
        </p>
        <p className="mt-xxs text-text-secondary">
          Every posted entry balances on its own, so a gap here points at a posting
          that did not complete rather than at this report. The journal entries list
          is the place to start.
        </p>
      </div>
    </div>
  );
}

export default BalanceWarning;
