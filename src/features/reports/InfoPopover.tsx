import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

import { Popover } from '@/components/ui/Popover';
import { cn } from '@/lib/cn';

export interface InfoPopoverProps {
  /** What the button says to a screen reader: "How current ratio is calculated". */
  label: string;
  children: ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end';
}

/**
 * A small ⓘ that opens an explanation — how a KPI was computed, why a line is
 * computed rather than posted. A real button, so it is reachable by Tab and
 * opens with Enter; the explanation is never hover-only.
 */
export function InfoPopover({ label, children, className, align = 'start' }: InfoPopoverProps) {
  return (
    <Popover
      align={align}
      trigger={
        <button
          type="button"
          aria-label={label}
          title={label}
          // Clicks stop here: an ⓘ inside a clickable row explains the row,
          // it does not also open it.
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors',
            'hover:bg-surface-2 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-border-focus',
            className,
          )}
        >
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      }
    >
      {children}
    </Popover>
  );
}

export default InfoPopover;
