import { AlertTriangle, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { getBillPhotoUrl } from '@/networks/delivery/completionsNetwork';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'image'; url: string }
  | { kind: 'unavailable'; reason: string };

/**
 * The customer-signed bill a rider photographed at the door.
 *
 * The photo route is auth-gated, so a plain <img src> would 401 — it is
 * fetched with the session and shown from a blob URL. Loaded on request
 * rather than with the card, since a queue can hold a dozen of them.
 */
export function BillPhotoButton({ completionId }: { completionId: string }) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  useEffect(() => {
    return () => {
      if (state.kind === 'image') URL.revokeObjectURL(state.url);
    };
  }, [state]);

  const open = async () => {
    setState({ kind: 'loading' });
    try {
      const url = await getBillPhotoUrl(completionId);
      // Sniff what came back rather than trusting the header.
      const blob = await (await fetch(url)).blob();
      if (!blob.type.startsWith('image/')) {
        URL.revokeObjectURL(url);
        setState({ kind: 'unavailable', reason: 'The server did not send an image.' });
        return;
      }
      setState({ kind: 'image', url });
    } catch (e) {
      setState({
        kind: 'unavailable',
        reason: e instanceof Error ? e.message : 'Could not load the photo.',
      });
    }
  };

  if (state.kind === 'image') {
    return (
      <a href={state.url} target="_blank" rel="noreferrer" className="block w-fit">
        <img
          src={state.url}
          alt="Signed bill"
          className="max-h-64 rounded-md border border-border-light object-contain"
        />
      </a>
    );
  }

  if (state.kind === 'unavailable') {
    return (
      <p className="flex items-center gap-xs text-caption text-text-secondary">
        <AlertTriangle className="size-4 text-warning" />
        {state.reason}
      </p>
    );
  }

  return (
    <Button type="button" variant="text" size="sm" onClick={open} disabled={state.kind === 'loading'}>
      {state.kind === 'loading' ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <ImageIcon className="size-4" />
      )}
      View signed bill
    </Button>
  );
}
