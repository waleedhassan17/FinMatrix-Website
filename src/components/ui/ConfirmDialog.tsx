import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useEffect, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { cn } from '@/lib/cn';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  /**
   * Ask for a written reason and pass it to onConfirm.
   *
   * Not decoration: `POST /invoices/:id/void` has `reason` as a REQUIRED
   * string, and the approvals API rejects a decision comment shorter than 3
   * characters. The floor below mirrors the server's.
   */
  reason?: { label: string; placeholder?: string; minLength?: number };
  /** Extra controls rendered above the buttons — a date override, say. */
  children?: ReactNode;
  onConfirm: (reason?: string) => void;
}

const overlay =
  'fixed inset-0 z-50 bg-[color:var(--color-overlay)] data-[state=open]:animate-in';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  busy,
  reason,
  children,
  onConfirm,
}: ConfirmDialogProps) {
  const [text, setText] = useState('');
  const min = reason?.minLength ?? 3;

  // Clear on every open as well as every close: a reason left over from a
  // previous void is worse than an empty box.
  useEffect(() => {
    if (!open) setText('');
  }, [open]);

  const tooShort = !!reason && text.trim().length < min;

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlay} />
        <AlertDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2',
            'rounded-lg bg-surface p-xl shadow-lg',
          )}
        >
          <AlertDialog.Title className="text-h4 text-text-primary">
            {title}
          </AlertDialog.Title>
          {description && (
            <AlertDialog.Description className="mt-xs text-body-md text-text-secondary">
              {description}
            </AlertDialog.Description>
          )}

          {children && <div className="mt-lg">{children}</div>}

          {reason && (
            <div className="mt-lg">
              <Textarea
                label={reason.label}
                placeholder={reason.placeholder}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                autoFocus
                hint={`At least ${min} characters.`}
              />
            </div>
          )}

          <div className="mt-xl flex justify-end gap-sm">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={busy}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              disabled={busy || tooShort}
              onClick={() => onConfirm(reason ? text.trim() : undefined)}
            >
              {busy ? 'Working…' : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export default ConfirmDialog;
