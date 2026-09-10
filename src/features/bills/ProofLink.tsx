import { AlertTriangle, FileText, Loader2, Paperclip } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { getPaymentProofUrl } from '@/networks/purchases/billNetwork';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'image'; url: string }
  | { kind: 'pdf'; url: string }
  | { kind: 'unavailable'; reason: string };

/**
 * View the proof attached to a bill payment.
 *
 * `GET /bill-payments/proofs/:id/file` is the only StreamableFile in the API,
 * and it is served with `@Res({ passthrough: true })` — which leaves the global
 * response-envelope interceptor in the chain. A StreamableFile has no `data`
 * key, so the envelope wraps it and Express serialises JSON, while the handler
 * has already set `Content-Type: image/png`. Right header, wrong body.
 *
 * No client can fix that, so this one defends: it fetches the blob, checks what
 * actually came back, and if it is JSON it says the proof cannot be displayed
 * and shows the filename from the payment record instead. A broken image icon
 * would read as "the proof is missing", which is a different and much worse
 * claim than "the server could not send it".
 */
export function ProofLink({
  proofId,
  fileName,
  mimeType,
}: {
  proofId: string;
  fileName?: string;
  mimeType?: string;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  // Blob URLs are pinned in memory until revoked, and a payment list can hold
  // a dozen of them.
  useEffect(() => {
    return () => {
      if (state.kind === 'image' || state.kind === 'pdf') {
        URL.revokeObjectURL(state.url);
      }
    };
  }, [state]);

  if (!proofId) return null;

  const open = async () => {
    setState({ kind: 'loading' });
    try {
      const url = await getPaymentProofUrl(proofId);
      // Sniff the blob rather than trusting the response header.
      const blob = await (await fetch(url)).blob();

      if (blob.type.startsWith('image/')) {
        setState({ kind: 'image', url });
        return;
      }
      if (blob.type === 'application/pdf') {
        setState({ kind: 'pdf', url });
        return;
      }

      URL.revokeObjectURL(url);
      setState({
        kind: 'unavailable',
        reason:
          blob.type.includes('json') || blob.type === ''
            ? 'The server returned a JSON envelope instead of the file. This is a known backend issue with this one route — the proof is stored, but cannot be displayed here yet.'
            : `The server sent an unexpected file type (${blob.type}).`,
      });
    } catch (e) {
      setState({
        kind: 'unavailable',
        reason: e instanceof Error ? e.message : 'Could not load the proof.',
      });
    }
  };

  if (state.kind === 'image') {
    return (
      <img
        src={state.url}
        alt={fileName || 'Payment proof'}
        className="max-h-64 rounded-md border border-border-light"
      />
    );
  }

  if (state.kind === 'pdf') {
    return (
      <a
        href={state.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-xxs text-label-md text-primary hover:underline"
      >
        <FileText className="size-4" />
        {fileName || 'Open proof (PDF)'}
      </a>
    );
  }

  if (state.kind === 'unavailable') {
    return (
      <div className="flex items-start gap-xs rounded-md border border-warning-light bg-warning-lighter p-sm">
        <AlertTriangle className="mt-[2px] size-4 shrink-0 text-warning" />
        <div>
          <p className="text-label-md text-text-primary">
            {fileName || 'Payment proof'}
            {mimeType && (
              <span className="ml-xxs text-caption text-text-secondary">
                {mimeType}
              </span>
            )}
          </p>
          <p className="mt-xxs text-caption text-text-secondary">{state.reason}</p>
        </div>
      </div>
    );
  }

  return (
    <Button
      variant="text"
      size="sm"
      className="px-0"
      onClick={open}
      disabled={state.kind === 'loading'}
    >
      {state.kind === 'loading' ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Paperclip className="size-4" />
      )}
      {state.kind === 'loading' ? 'Loading proof…' : 'View proof'}
    </Button>
  );
}

export default ProofLink;
