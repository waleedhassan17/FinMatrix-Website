import { LifeBuoy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Textarea } from '@/components/ui/Field';
import { migrationErrorMessage } from '@/config/migrationErrors';
import { supportReference } from '@/config/migrationSources';
import { fill } from '@/config/launchStrings';
import { ApiError } from '@/networks/network/apiHelpers';
import { requestMigrationHelp } from '@/networks/settings/migrationNetwork';

const T = {
  button: 'Ask for help',
  title: 'Ask FinMatrix for help',
  body: 'We send our support team this migration’s reference ({ref}), its open problems and check results — not your figures or files. They reply by email, usually within one business day.',
  message: 'What do you need help with? (optional)',
  send: 'Send to support',
  sending: 'Sending…',
  sent: 'Sent — quote {ref} if you write to us.',
  noInbox: 'Recorded. Our support inbox is not set up on this server — quote {ref} when you contact us.',
} as const;

/**
 * Sends this migration to FinMatrix support (POST /migrations/:id/help-request):
 * the reference, open problems and check results, plus the owner's note. It
 * replaced a mailto: link, so it works without a mail client and support gets
 * the facts it needs.
 */
export function AskForHelpButton({ batchId }: { batchId: string }) {
  const ref = supportReference(batchId);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const r = await requestMigrationHelp(batchId, message);
      toast.success(fill(r.sent ? T.sent : T.noInbox, { ref: r.reference || ref }));
      setMessage('');
      setOpen(false);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      toast.error(migrationErrorMessage(err?.code, err?.message ?? (e instanceof Error ? e.message : null)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="text" size="sm" onClick={() => setOpen(true)} aria-label={T.button}>
        <LifeBuoy className="h-4 w-4" aria-hidden />
        {T.button}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={T.title}
        description={<span>{fill(T.body, { ref })}</span>}
        confirmLabel={busy ? T.sending : T.send}
        busy={busy}
        onConfirm={() => void send()}
      >
        <div>
          <Textarea
            label={T.message}
            value={message}
            maxLength={1000}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
      </ConfirmDialog>
    </>
  );
}

export default AskForHelpButton;
