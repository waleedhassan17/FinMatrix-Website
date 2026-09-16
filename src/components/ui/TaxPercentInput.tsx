import { useId } from 'react';

import { cn } from '@/lib/cn';
import { taxPercentError } from '@/models/taxRate';

/**
 * The tax field on every document line. Tax is typed, never picked from a fixed
 * list — see models/taxRate.ts for the rule and where it applies.
 */
export function TaxPercentInput({
  value,
  onChange,
  label = 'Tax %',
  disabled,
  compact,
  containerClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
  /** 40px, for a line row; otherwise the standard 48px field. */
  compact?: boolean;
  containerClassName?: string;
}) {
  const id = useId();
  const error = taxPercentError(value);
  return (
    <label htmlFor={id} className={cn('flex flex-col gap-xxs', containerClassName)}>
      <span className="text-caption text-text-secondary">{label}</span>
      <span className="relative">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
          inputMode="decimal"
          placeholder="0"
          disabled={disabled}
          aria-invalid={!!error}
          className={cn(
            'w-full rounded-md border bg-surface pr-8 pl-sm text-right text-body-md text-text-primary tabular',
            'outline-none transition-colors focus:border-[1.5px] focus:border-primary',
            'placeholder:text-text-tertiary disabled:bg-background disabled:opacity-70',
            compact ? 'h-10' : 'h-12',
            error ? 'border-danger' : 'border-border',
          )}
        />
        <span className="pointer-events-none absolute top-1/2 right-sm -translate-y-1/2 text-body-sm text-text-tertiary">
          %
        </span>
      </span>
      {error && <span className="text-caption text-danger">{error}</span>}
    </label>
  );
}
