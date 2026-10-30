import * as RadixPopover from '@radix-ui/react-popover';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface PopoverProps {
  /** The element that opens it — a button. Passed through `asChild`. */
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Width cap; the panel never runs off a phone screen. */
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * A small panel anchored to a control — an explanation, a formula, a short
 * editor. Click or Enter opens it, Escape and an outside click close it, and
 * focus returns to the trigger; Radix supplies all three.
 *
 * Not a tooltip: a tooltip is hover-only and unreachable by keyboard or touch,
 * and what these panels say (how a KPI was computed, why a row is flagged)
 * is worth reaching on every device.
 */
export function Popover({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  className,
  open,
  onOpenChange,
}: PopoverProps) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={16}
          className={cn(
            'z-50 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-md text-body-sm text-text-primary shadow-md outline-none',
            className,
          )}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

export default Popover;
