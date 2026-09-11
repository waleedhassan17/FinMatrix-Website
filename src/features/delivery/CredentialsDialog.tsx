import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { RiderCredentials } from '@/networks/delivery/personnelNetwork';

/**
 * A rider's sign-in, shown once after it is issued.
 *
 * Riders have no inbox and no self-service reset — the office hands these
 * over in person. The server keeps an encrypted copy that can be revealed
 * again later, and records every reveal.
 */
export function CredentialsDialog({
  open,
  title,
  credentials,
  onClose,
}: {
  open: boolean;
  title: string;
  credentials: RiderCredentials | null;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description="Pass these to the rider — they sign in to the rider app with them. You can show them again from the rider’s page; every time they are shown is recorded."
      confirmLabel="Done"
      cancelLabel="Close"
      onConfirm={onClose}
    >
      {credentials ? (
        <div className="flex flex-col gap-sm">
          <CopyField label="Username" value={credentials.username} />
          <CopyField label="Password" value={credentials.password} />
        </div>
      ) : (
        <p className="text-body-sm text-text-secondary">
          The server did not return the credentials. Use Reset password on the rider’s page
          to issue new ones.
        </p>
      )}
    </ConfirmDialog>
  );
}

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused (an insecure origin, a denied
      // permission); the value is on screen to copy by hand either way.
    }
  };

  return (
    <div className="flex items-center justify-between gap-sm rounded-md bg-surface-2 px-md py-sm">
      <div className="min-w-0">
        <p className="text-caption text-text-secondary">{label}</p>
        <p className="font-mono text-body-md break-all text-text-primary">{value}</p>
      </div>
      <Button type="button" variant="text" size="sm" onClick={copy}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}
