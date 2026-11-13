import { Check } from 'lucide-react';

import { cn } from '@/lib/cn';
import { WIZARD_STEPS } from '@/models/migration';

/**
 * The seven steps as a rail. Steps up to `reachable` can be opened; later ones
 * wait their turn. The server decides `reachable` from the batch's status, so
 * leaving and coming back lands on the same step.
 */
export function WizardStepper({ current, reachable, onSelect }: { current: number; reachable: number; onSelect: (step: number) => void }) {
  return (
    <ol className="flex flex-wrap items-center gap-xs" aria-label="Migration steps">
      {WIZARD_STEPS.map(({ step, label }, i) => {
        const done = step < reachable;
        const active = step === current;
        const open = step <= reachable;
        return (
          <li key={step} className="flex items-center gap-xs">
            <button
              type="button"
              disabled={!open}
              onClick={() => onSelect(step)}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex items-center gap-xs rounded-full px-sm py-xs text-label-md transition-colors',
                active ? 'bg-primary text-text-inverse' : open ? 'text-text-primary hover:bg-primary-tint' : 'cursor-not-allowed text-text-disabled',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full border text-caption',
                  active ? 'border-text-inverse' : done ? 'border-success bg-success text-text-inverse' : 'border-border',
                )}
              >
                {done && !active ? <Check className="h-3 w-3" aria-hidden /> : step}
              </span>
              {label}
            </button>
            {i < WIZARD_STEPS.length - 1 && <span className="hidden h-px w-[1rem] bg-border sm:block" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

export default WizardStepper;
