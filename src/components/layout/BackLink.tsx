import { ArrowLeft, ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { useBack, type BackTarget } from '@/features/shell/navHistory';

/**
 * Back, as a page header shows it: a quiet chevron and where it goes.
 *
 * `fallback` is the record's list — used only when the page was opened cold
 * (a pasted URL, a new tab). Otherwise this returns to the page the user came
 * from and says which one: "Dashboard", "Estimate", "General Ledger".
 */
export function BackLink({ fallback, className }: { fallback: BackTarget; className?: string }) {
  const back = useBack(fallback);
  return (
    <Link
      to={back.to}
      onClick={back.onClick}
      className={cn(
        'inline-flex w-fit items-center gap-xxs rounded-sm text-label-md text-text-secondary transition-colors hover:text-primary',
        className,
      )}
    >
      <ChevronLeft className="size-4" aria-hidden="true" />
      {back.label}
    </Link>
  );
}

/** Back above a form or a working page, in the text-button style those use. */
export function BackButton({ fallback, className }: { fallback: BackTarget; className?: string }) {
  const back = useBack(fallback);
  return (
    <Button asChild variant="text" size="sm" className={cn('self-start px-0', className)}>
      <Link to={back.to} onClick={back.onClick}>
        <ArrowLeft className="size-4" />
        {back.label}
      </Link>
    </Button>
  );
}

/**
 * A form's Cancel: leaves the way Back does, to the page the form was opened
 * from. `fallback` is where it goes when there is no such page.
 */
export function CancelButton({ fallback, disabled }: { fallback: string; disabled?: boolean }) {
  const back = useBack({ to: fallback, label: 'Cancel' });
  return (
    <Button asChild variant="secondary" disabled={disabled}>
      <Link to={back.to} onClick={back.onClick}>
        Cancel
      </Link>
    </Button>
  );
}
