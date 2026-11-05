import { useId, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * A one-time code, drawn as one box per digit.
 *
 * The boxes are only a picture. Underneath them is a single real input,
 * transparent and stretched over the row, so everything a code field needs
 * keeps working without per-box focus juggling: pasting the whole code, the
 * phone's "from Messages" autofill (`one-time-code`), backspace, and a screen
 * reader announcing one field rather than six.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  label,
  hint,
  error,
  disabled,
  autoFocus,
}: OtpInputProps) {
  const inputId = useId();
  const describedById = error || hint ? `${inputId}-description` : undefined;
  const [focused, setFocused] = useState(false);
  // The box the next digit lands in; the last box once the code is full.
  const active = Math.min(value.length, length - 1);

  return (
    <div className="flex flex-col gap-xxs">
      {label && (
        <label htmlFor={inputId} className="text-label-md text-text-secondary">
          {label}
        </label>
      )}

      <div className="relative">
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={length}
          autoFocus={autoFocus}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedById}
          // 16px keeps iOS from zooming the page on focus; the text itself is
          // invisible, the boxes below draw it.
          className="absolute inset-0 z-10 h-full w-full cursor-text text-body-lg opacity-0 disabled:cursor-not-allowed"
        />
        <div aria-hidden="true" className="grid gap-xs" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
          {Array.from({ length }, (_, i) => {
            const char = value[i] ?? '';
            const isActive = focused && i === active;
            return (
              <div
                key={i}
                className={cn(
                  'flex h-14 items-center justify-center rounded-md border bg-surface text-h2 text-text-primary tabular transition-[border-color,box-shadow] duration-150',
                  isActive ? 'border-primary ring-4 ring-primary-100' : 'border-border',
                  char && !isActive && 'border-border-strong',
                  error && 'border-danger',
                  error && isActive && 'ring-danger-lighter',
                  disabled && 'bg-background opacity-70',
                )}
              >
                {char ||
                  (isActive && (
                    <span className="h-6 w-px animate-pulse bg-primary motion-reduce:animate-none" />
                  ))}
              </div>
            );
          })}
        </div>
      </div>

      {(error || hint) && (
        <span
          id={describedById}
          className={cn('text-caption', error ? 'text-danger' : 'text-text-tertiary')}
        >
          {error || hint}
        </span>
      )}
    </div>
  );
}

export default OtpInput;
