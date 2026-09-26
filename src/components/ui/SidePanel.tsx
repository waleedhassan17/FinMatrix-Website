import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface SidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** One line under the title — what the panel covers. */
  description?: ReactNode;
  /** Pinned under the scrolling body — a total, an action. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A panel that slides in from the right, over the page it was opened from.
 *
 * For drilling into a figure without leaving it: the page underneath stays
 * exactly where it was — no content pushed down, no scroll position lost —
 * and closing the panel is Escape, the ✕ or a click on the scrim. Radix
 * supplies the focus trap and returns focus to whatever opened it.
 *
 * Full width on a phone, 32rem beside a desktop page.
 */
export function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  className,
}: SidePanelProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-neutral-900/40 data-[state=closed]:animate-scrim-out data-[state=open]:animate-scrim-in motion-reduce:animate-none" />
        <Dialog.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-[32rem] flex-col bg-surface shadow-lg outline-none',
            'data-[state=closed]:animate-panel-out data-[state=open]:animate-panel-in motion-reduce:animate-none',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-md border-b border-border-light px-lg py-md">
            <div className="min-w-0">
              <Dialog.Title className="text-h5 text-text-primary">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-[2px] text-caption text-text-tertiary">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">Details</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="rounded-sm p-xxs text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="border-t border-border-light bg-surface-2 px-lg py-sm">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default SidePanel;
