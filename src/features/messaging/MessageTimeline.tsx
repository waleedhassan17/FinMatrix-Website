import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { RailSection } from '@/components/layout/DetailLayout';
import { getMessageMedia, resendMessage } from '@/networks/messaging/messagingNetwork';
import { STATUS_WORDS, type TimelineMessage } from '@/models/messaging';
import { MessageStatusTicks } from './MessageStatusTicks';
import { messagingKeys, useTimeline } from './useConnect';

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};


/**
 * Every WhatsApp message about a document, newest first, as a rail section:
 * what it was, who (masked), when, its ticks, and in plain words why it did
 * not go. "View PDF sent" opens the exact copy; Resend for what failed.
 */
export function MessageTimeline({
  docType,
  docId,
  title = 'WhatsApp',
  onLatest,
}: {
  docType: string;
  docId: string | null | undefined;
  title?: string;
  onLatest?: (m: TimelineMessage | null) => void;
}) {
  const queryClient = useQueryClient();
  const q = useTimeline(docType, docId);
  const latest = q.data?.[0] ?? null;
  useEffect(() => {
    if (q.data) onLatest?.(latest);
  }, [q.data, latest, onLatest]);

  const resend = useMutation({
    mutationFn: (id: string) => resendMessage(id),
    onSuccess: (r) => {
      if (r.status === 'queued') toast.success('Queued', { description: 'It goes out in a few seconds.' });
      else toast.info('Not sent', { description: r.skipReason ?? STATUS_WORDS[r.status] });
      void queryClient.invalidateQueries({ queryKey: messagingKeys.all });
    },
    onError: (e: Error) => toast.error('Could not resend', { description: e.message }),
  });

  const viewPdf = async (m: TimelineMessage) => {
    // Opened inside the click so a popup blocker lets it through.
    const tab = window.open('about:blank', '_blank');
    try {
      const url = URL.createObjectURL(await getMessageMedia(m.id));
      if (tab) tab.location.replace(url);
      else window.open(url, '_blank', 'noopener');
    } catch (e) {
      tab?.close();
      toast.error('Could not open the PDF', { description: e instanceof Error ? e.message : undefined });
    }
  };

  if (!docId) return null;
  return (
    <RailSection title={title}>
      {q.isLoading ? (
        <p className="text-body-sm text-text-tertiary">Loading…</p>
      ) : !q.data || q.data.length === 0 ? (
        <p className="text-body-sm text-text-tertiary">No WhatsApp messages for this document yet.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border-light" aria-label="WhatsApp messages">
          {q.data.map((m) => (
            <li key={m.id} className="py-sm first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-sm">
                <span className="truncate text-label-md text-text-primary">
                  {m.eventLabel}
                  {m.channel === 'wa_link' ? ' · shared by hand' : ''}
                </span>
                <MessageStatusTicks status={m.status} showLabel />
              </div>
              <p className="mt-xxs text-caption text-text-tertiary">
                {[m.recipientName, m.toPhoneMasked, when(m.createdAt)].filter(Boolean).join(' · ')}
              </p>
              {m.reason ? (
                <p className={m.status === 'failed' ? 'mt-xxs text-caption text-danger' : 'mt-xxs text-caption text-text-secondary'}>
                  {m.reason}
                </p>
              ) : null}
              {(m.hasMedia || m.canResend) && (
                <div className="mt-xs flex gap-sm">
                  {m.hasMedia ? (
                    <Button variant="text" size="sm" onClick={() => void viewPdf(m)}>
                      <FileText className="size-4" aria-hidden="true" />
                      View PDF sent
                    </Button>
                  ) : null}
                  {m.canResend ? (
                    <Button variant="text" size="sm" onClick={() => resend.mutate(m.id)} disabled={resend.isPending}>
                      <RotateCcw className="size-4" aria-hidden="true" />
                      Resend
                    </Button>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </RailSection>
  );
}
