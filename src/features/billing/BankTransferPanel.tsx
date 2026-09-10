// ═══════════════════════════════════════════════════════
// FinMatrix Web — Bank transfer + payment proof
// ═══════════════════════════════════════════════════════
// The pay step for both onboarding and renewal. Manual by design: there is no
// card processor behind this, so there are no card fields — the buyer transfers
// to the account shown and uploads the receipt, and a person approves it.
//
// Every bank field is copy-to-clipboard, because the alternative is someone
// re-typing an account number from a screen into their banking app. That is where
// a payment goes to the wrong account.

import { AlertCircle, Check, Copy, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { BankDetails } from '@/networks/billing/billingNetwork';

/** The server rejects larger uploads; catching it here saves a failed round-trip. */
const MAX_BYTES = 8 * 1024 * 1024;

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  // Clear the confirmation on a timer, and cancel it on unmount so a late
  // setState cannot fire into an unmounted component.
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      /* clipboard blocked — the value is on screen to read */
    }
  };

  return (
    <div className="flex items-center justify-between gap-md py-sm">
      <div className="min-w-0">
        <p className="text-label-sm text-text-secondary">{label}</p>
        <p className="mt-xxs truncate text-body-md tabular text-text-primary">
          {value || '—'}
        </p>
      </div>
      {value && (
        <button
          type="button"
          onClick={() => void copy()}
          className="flex shrink-0 items-center gap-xxs rounded-sm px-xs py-xxs text-label-sm text-primary hover:bg-primary-tint"
          aria-label={`Copy ${label}`}
        >
          {copied ? (
            <>
              <Check className="size-4" aria-hidden="true" /> Copied
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden="true" /> Copy
            </>
          )}
        </button>
      )}
    </div>
  );
}

export function BankTransferPanel({
  details,
  onSubmit,
  submitting,
  error,
  disabled,
  disabledNote,
}: {
  details: BankDetails;
  onSubmit: (file: File) => void;
  submitting: boolean;
  error?: string | null;
  /** True while a previous submission is still with an administrator. */
  disabled?: boolean;
  disabledNote?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState('');

  // Object URLs are a real leak if they are not revoked — the browser holds the
  // whole file in memory until they are.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (next: File | null) => {
    setLocalError('');
    if (!next) {
      setFile(null);
      return;
    }
    if (!next.type.startsWith('image/')) {
      setLocalError('Upload a screenshot or photo of the transfer (JPG or PNG).');
      return;
    }
    if (next.size > MAX_BYTES) {
      setLocalError('That image is larger than 8 MB. Try a screenshot instead.');
      return;
    }
    setFile(next);
  };

  const shownError = error || localError;

  return (
    <div className="grid gap-xl lg:grid-cols-[1fr_1fr]">
      {/* What to pay, and where */}
      <div className="rounded-lg border border-border-light bg-surface p-xl shadow-card">
        <p className="text-overline text-neutral-500">Amount due</p>
        <p className="mt-xs text-display-sm tabular text-text-primary">
          {details.amountDueLabel || '—'}
        </p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          {details.planLabel}
          {details.durationMonths ? ` · ${details.durationMonths} months` : ''}
          {details.monthlyLabel ? ` · ${details.monthlyLabel}/month` : ''}
        </p>

        <div className="my-lg h-px bg-border-light" />

        <p className="text-overline text-neutral-500">Transfer to</p>
        <div className="mt-xs divide-y divide-border-light">
          <CopyRow label="Account title" value={details.bankAccount.accountTitle} />
          <CopyRow label="Bank" value={details.bankAccount.bankName} />
          <CopyRow label="Account number" value={details.bankAccount.accountNumber} />
        </div>

        {details.bankAccount.instructions && (
          <p className="mt-lg rounded-md bg-surface-2 p-md text-body-sm text-text-secondary">
            {details.bankAccount.instructions}
          </p>
        )}
      </div>

      {/* Proof of payment */}
      <div className="flex flex-col rounded-lg border border-border-light bg-surface p-xl shadow-card">
        <p className="text-overline text-neutral-500">Upload your receipt</p>
        <p className="mt-xs text-body-sm text-text-secondary">
          Transfer the amount above, then attach a screenshot or photo of the
          confirmation. We verify it and activate your account — usually within
          one business day.
        </p>

        {shownError && (
          <div
            role="alert"
            className="mt-lg flex items-start gap-xs rounded-md bg-danger-lighter p-sm"
          >
            <AlertCircle className="mt-[2px] size-4 shrink-0 text-danger" />
            <span className="text-body-sm text-danger">{shownError}</span>
          </div>
        )}

        {disabled && disabledNote && (
          <div className="mt-lg flex items-start gap-xs rounded-md bg-warning-lighter p-sm">
            <AlertCircle className="mt-[2px] size-4 shrink-0 text-warning" />
            <span className="text-body-sm text-warning-hover">{disabledNote}</span>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />

        <div className="mt-lg flex-1">
          {previewUrl ? (
            <div className="relative overflow-hidden rounded-md border border-border-light">
              <img
                src={previewUrl}
                alt="Your payment receipt"
                className="max-h-64 w-full object-contain"
              />
              <button
                type="button"
                onClick={() => pick(null)}
                className="absolute top-xs right-xs flex size-8 items-center justify-center rounded-full bg-surface shadow-card"
                aria-label="Remove this image"
              >
                <X className="size-4 text-text-primary" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className={cn(
                'flex w-full flex-col items-center gap-sm rounded-md border-2 border-dashed border-border p-xxl',
                'text-center transition-colors hover:border-primary hover:bg-primary-tint',
                'disabled:pointer-events-none disabled:opacity-60',
              )}
            >
              <Upload className="size-6 text-text-secondary" aria-hidden="true" />
              <span className="text-label-md text-text-primary">
                Choose an image
              </span>
              <span className="text-caption text-text-secondary">
                JPG or PNG, up to 8 MB
              </span>
            </button>
          )}
        </div>

        <Button
          type="button"
          full
          size="lg"
          className="mt-xl"
          disabled={!file || submitting || disabled}
          onClick={() => file && onSubmit(file)}
        >
          {submitting ? 'Submitting…' : 'Submit payment proof'}
        </Button>
      </div>
    </div>
  );
}

export default BankTransferPanel;
