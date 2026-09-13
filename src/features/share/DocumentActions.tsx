import {
  ChevronDown,
  Download,
  Loader2,
  Mail,
  MessageCircle,
  Printer,
  Share2,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { downloadBlob, printBlob } from '@/features/pdf/renderPdf';
import {
  canShareFiles,
  mailtoUrl,
  pdfFilename,
  shareSubject,
  shareText,
  whatsappUrl,
  type ShareableDocument,
} from '@/features/share/shareDocument';
import { cn } from '@/lib/cn';

type Busy = 'print' | 'download' | 'share' | null;

export interface DocumentActionsProps {
  /** What the document is — drives the filename, message and recipients. */
  document: ShareableDocument;
  /** Produce the PDF. Called lazily and cached against `cacheKey`. */
  getPdf: () => Promise<Blob>;
  /** Changes whenever the document does (id + updatedAt), so a stale PDF is never reused. */
  cacheKey: string;
  disabled?: boolean;
  /** Icon-only buttons at every width — for a row in a table. */
  compact?: boolean;
}

/**
 * Print, Download PDF and Share for any document or report.
 *
 * One PDF feeds all three, so what prints, what downloads and what is shared
 * are the same file. Opening the Share menu starts rendering in the background:
 * the share sheet and new windows must open within the click that asked for
 * them, and a PDF that is already made is what lets them.
 */
export function DocumentActions({
  document: doc,
  getPdf,
  cacheKey,
  disabled,
  compact = false,
}: DocumentActionsProps) {
  const [busy, setBusy] = useState<Busy>(null);
  const cache = useRef<{ key: string; blob: Promise<Blob> } | null>(null);
  const shareFiles = useMemo(() => canShareFiles(), []);
  const filename = pdfFilename(doc);

  const pdf = (): Promise<Blob> => {
    if (!cache.current || cache.current.key !== cacheKey) {
      const blob = getPdf();
      cache.current = { key: cacheKey, blob };
      // A failed render must not be cached.
      blob.catch(() => {
        if (cache.current?.blob === blob) cache.current = null;
      });
    }
    return cache.current.blob;
  };

  const run = async (kind: Exclude<Busy, null>, action: (blob: Blob) => void | Promise<void>) => {
    setBusy(kind);
    try {
      await action(await pdf());
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      toast.error('Could not prepare the PDF', {
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setBusy(null);
    }
  };

  const onPrint = () => run('print', (blob) => printBlob(blob));

  const onDownload = () =>
    run('download', (blob) => {
      downloadBlob(blob, filename);
      toast.success('PDF downloaded', { description: filename });
    });

  const onShareFile = () =>
    run('share', async (blob) => {
      const file = new File([blob], filename, { type: 'application/pdf' });
      await navigator.share({ files: [file], title: shareSubject(doc), text: shareText(doc) });
    });

  const onWhatsApp = () => {
    // Opened now, inside the click, so a popup blocker lets it through; pointed
    // at the chat once the PDF is saved.
    const chat = window.open('about:blank', '_blank');
    void run('share', (blob) => {
      downloadBlob(blob, filename);
      const url = whatsappUrl(doc.partyPhone, shareText(doc));
      if (chat) chat.location.replace(url);
      else window.open(url, '_blank', 'noopener');
      toast.success('PDF downloaded', {
        description: 'Attach it in the WhatsApp chat — the message is already written.',
      });
    }).then(() => {
      if (chat && chat.location.href === 'about:blank') chat.close();
    });
  };

  const onEmail = () =>
    run('share', (blob) => {
      downloadBlob(blob, filename);
      window.location.href = mailtoUrl(doc.partyEmail, shareSubject(doc), shareText(doc));
      toast.success('PDF downloaded', {
        description: 'Attach it to the email draft that just opened.',
      });
    });

  const spinner = <Loader2 className="size-4 animate-spin" aria-hidden="true" />;
  const buttonClass = compact ? 'px-sm' : 'px-sm sm:px-md';
  // Compact hides the text outright: each button already carries its
  // aria-label, and an sr-only span is absolutely positioned, so inside a
  // scrolling table it escapes the scroll box and widens the page.
  const labelClass = compact ? 'hidden' : 'hidden sm:inline';

  return (
    <div className="flex items-center gap-xs">
      <Button
        variant="secondary"
        size="sm"
        onClick={onPrint}
        disabled={disabled || busy !== null}
        aria-label="Print"
        title={compact ? 'Print' : undefined}
        className={buttonClass}
      >
        {busy === 'print' ? spinner : <Printer className="size-4" aria-hidden="true" />}
        <span className={labelClass}>Print</span>
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={onDownload}
        disabled={disabled || busy !== null}
        aria-label="Download PDF"
        title={compact ? 'Download PDF' : undefined}
        className={buttonClass}
      >
        {busy === 'download' ? spinner : <Download className="size-4" aria-hidden="true" />}
        <span className={labelClass}>PDF</span>
      </Button>

      <DropdownMenu
        onOpenChange={(open) => {
          // Warm the cache so the share sheet opens inside the click.
          if (open && !disabled) pdf().catch(() => undefined);
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled || busy !== null}
            aria-label="Share"
            title={compact ? 'Share' : undefined}
            className={buttonClass}
          >
            {busy === 'share' ? spinner : <Share2 className="size-4" aria-hidden="true" />}
            <span className={labelClass}>Share</span>
            <ChevronDown className={cn('size-3.5', compact ? 'hidden' : 'hidden sm:inline')} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-60">
          <DropdownMenuLabel>Share {doc.kind.toLowerCase()}</DropdownMenuLabel>
          {shareFiles && (
            <>
              <DropdownMenuItem icon={<Share2 aria-hidden="true" />} onSelect={onShareFile}>
                Share PDF…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem icon={<MessageCircle aria-hidden="true" />} onSelect={onWhatsApp}>
            <span className="flex flex-col">
              WhatsApp
              {doc.partyPhone && (
                <span className="text-caption text-text-tertiary">{doc.partyPhone}</span>
              )}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem icon={<Mail aria-hidden="true" />} onSelect={onEmail}>
            <span className="flex min-w-0 flex-col">
              Email
              {doc.partyEmail && (
                <span className="truncate text-caption text-text-tertiary">{doc.partyEmail}</span>
              )}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default DocumentActions;
