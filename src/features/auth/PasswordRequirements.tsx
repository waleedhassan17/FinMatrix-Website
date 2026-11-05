import { Check } from 'lucide-react';

import { cn } from '@/lib/cn';
import { passwordChecks } from '@/utils/password';

/**
 * The password rule as a checklist that ticks itself off while the person
 * types — so a rejected password is never the first time they hear the rule.
 * Reads the same `passwordChecks` the submit guard uses.
 */
export function PasswordRequirements({
  password,
  className,
}: {
  password: string;
  className?: string;
}) {
  const checks = passwordChecks(password);

  return (
    <ul aria-label="Password requirements" className={cn('grid gap-x-md gap-y-xs sm:grid-cols-2', className)}>
      {checks.map((check) => (
        <li
          key={check.key}
          className={cn(
            'flex items-center gap-xs text-caption transition-colors',
            check.met ? 'text-success' : 'text-text-tertiary',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex size-4 shrink-0 items-center justify-center rounded-full transition-colors',
              check.met ? 'bg-success text-text-inverse' : 'border border-border-strong',
            )}
          >
            {check.met && <Check className="size-3" strokeWidth={3} />}
          </span>
          {check.label}
          <span className="sr-only">{check.met ? '(done)' : '(not yet)'}</span>
        </li>
      ))}
    </ul>
  );
}

export default PasswordRequirements;
