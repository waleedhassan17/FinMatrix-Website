import { AlertCircle, CheckCircle2, FileText, Loader2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/Card';
import {
  PROOF_ACCEPT,
  PROOF_MAX_BYTES,
  uploadPaymentProof,
  type PaymentProof,
} from '@/networks/purchases/billNetwork';

type Status =
  | { kind: 'empty' }
  | { kind: 'uploading'; name: string }
  | { kind: 'done'; proof: PaymentProof }
  | { kind: 'failed'; name: string; message: string };

const humanSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * The payment proof for a bill payment.
 *
 * `PayBillsDto.proofId` is **required**, with its own message: "A payment proof
 * (receipt or screenshot) is required to record a bill payment." There is no
 * route into BillsService.pay that skips it — money leaving the bank is
 * evidenced, while money arriving is not.
 *
 * So this uploads on selection and reports the resulting **id** upward. The
 * submit button gates on that id, not on a file having been chosen: without
 * the distinction a failed upload would look like a ready form and the payment
 * would be refused at the last step, after the allocations were typed.
 *
 * Size and type are checked here as well as server-side so a 6 MB photo fails
 * in a millisecond rather than after uploading 6 MB.
 */
export function PaymentProofField({
  proofId,
  onChange,
  disabled,
}: {
  proofId: string;
  onChange: (proofId: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'empty' });
  const [preview, setPreview] = useState<string>('');

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const reset = () => {
    setStatus({ kind: 'empty' });
    if (preview) URL.revokeObjectURL(preview);
    setPreview('');
    onChange('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const upload = async (file: File) => {
    if (file.size > PROOF_MAX_BYTES) {
      setStatus({
        kind: 'failed',
        name: file.name,
        message: `That file is ${humanSize(file.size)}. The limit is 5 MB.`,
      });
      onChange('');
      return;
    }
    if (!PROOF_ACCEPT.split(',').includes(file.type)) {
      setStatus({
        kind: 'failed',
        name: file.name,
        message: 'Only JPEG, PNG, WebP images and PDFs are accepted.',
      });
      onChange('');
      return;
    }

    // Cleared first: an id from a previous successful upload must not survive
    // the start of a new one, or a failure would submit the old proof.
    onChange('');
    setStatus({ kind: 'uploading', name: file.name });

    if (file.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(file));
    }

    try {
      const proof = await uploadPaymentProof(file);
      setStatus({ kind: 'done', proof });
      onChange(proof.id);
    } catch (e) {
      setStatus({
        kind: 'failed',
        name: file.name,
        message: e instanceof Error ? e.message : 'Upload failed.',
      });
      onChange('');
    }
  };

  const lastFile = useRef<File | null>(null);

  return (
    <div>
      <SectionHeader title="Payment proof *" />
      <p className="mt-xs text-caption text-text-tertiary">
        A receipt, bank screenshot or transfer confirmation. Required — the
        server will not record a bill payment without one.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={PROOF_ACCEPT}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            lastFile.current = file;
            void upload(file);
          }
        }}
      />

      <div className="mt-md">
        {status.kind === 'empty' && (
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" />
            Choose a file
          </Button>
        )}

        {status.kind === 'uploading' && (
          <div className="flex items-center gap-sm rounded-md border border-border bg-surface-2 p-md">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span className="text-body-sm text-text-secondary">
              Uploading {status.name}…
            </span>
          </div>
        )}

        {status.kind === 'done' && (
          <div className="flex items-start gap-sm rounded-md border border-success-light bg-success-lighter p-md">
            {preview ? (
              <img
                src={preview}
                alt=""
                className="size-16 shrink-0 rounded-md object-cover"
              />
            ) : (
              <FileText className="mt-[2px] size-5 shrink-0 text-success" />
            )}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-xxs text-label-md text-text-primary">
                <CheckCircle2 className="size-4 shrink-0 text-success" />
                <span className="truncate">{status.proof.fileName}</span>
              </p>
              <p className="mt-xxs text-caption text-text-secondary">
                {humanSize(status.proof.fileSize)} · uploaded
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              disabled={disabled}
              aria-label="Remove the payment proof"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-text-secondary transition-colors hover:bg-neutral-200"
            >
              <X className="size-[14px]" />
            </button>
          </div>
        )}

        {status.kind === 'failed' && (
          <div className="flex items-start gap-sm rounded-md border border-danger-light bg-danger-lighter p-md">
            <AlertCircle className="mt-[2px] size-4 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-label-md text-text-primary">
                {status.name}
              </p>
              <p className="mt-xxs text-caption text-danger">{status.message}</p>
              <div className="mt-sm flex gap-xs">
                {/* Retry re-sends the same file — a transient failure should
                    not cost the user another trip through the file picker. */}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                  onClick={() => {
                    if (lastFile.current) void upload(lastFile.current);
                  }}
                >
                  Try again
                </Button>
                <Button
                  variant="text"
                  size="sm"
                  disabled={disabled}
                  onClick={() => inputRef.current?.click()}
                >
                  Choose another file
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* The distinction that matters: a file was chosen, but there is no id. */}
      {!proofId && status.kind === 'done' && (
        <p className="mt-xs text-caption text-danger">
          The upload did not return an id. Try again before submitting.
        </p>
      )}
    </div>
  );
}

export default PaymentProofField;
