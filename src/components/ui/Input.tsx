import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  /** Shown under the field in danger red. Also sets aria-invalid. */
  error?: string;
  /** Shown under the field when there is no error. */
  hint?: ReactNode;
  /** Rendered inside the field, on the right — a unit, a visibility toggle. */
  trailing?: ReactNode;
  containerClassName?: string;
}

/**
 * Ported from the app's Custom-Components/CustomInput.tsx: 48px tall, 10px
 * radius, 16px horizontal padding, a 1px border that thickens on focus.
 * CustomDropdown shares those metrics deliberately, so a select and a text
 * field sitting in the same row are the same shape.
 *
 * Type roles follow the ROLE MAP in theme/tokens.ts — field label `labelMd` on
 * textSecondary, value `bodyMd` on textPrimary, helper `caption` on
 * textTertiary. (CustomInput itself drifted to bodyMd/bodyLg; the ROLE MAP is
 * the stated contract, and it is the one worth carrying forward.)
 */
export function Input({
  label,
  error,
  hint,
  trailing,
  className,
  containerClassName,
  id,
  disabled,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedById = error || hint ? `${inputId}-description` : undefined;

  return (
    <div className={cn('flex flex-col gap-xxs', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="text-label-md text-text-secondary">
          {label}
        </label>
      )}

      <div className="relative">
        <input
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedById}
          className={cn(
            'h-12 w-full rounded-md border bg-surface px-md text-body-md text-text-primary',
            'transition-colors outline-none',
            'placeholder:text-text-tertiary',
            // The focus ring is the border thickening rather than an added
            // outline, so the control does not change size on focus.
            'border-border focus:border-[1.5px] focus:border-primary',
            error && 'border-danger focus:border-danger',
            disabled && 'bg-background text-text-disabled opacity-70',
            trailing && 'pr-12',
            className,
          )}
          {...props}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-sm">
            {trailing}
          </div>
        )}
      </div>

      {(error || hint) && (
        <span
          id={describedById}
          className={cn(
            'text-caption',
            error ? 'text-danger' : 'text-text-tertiary',
          )}
        >
          {error || hint}
        </span>
      )}
    </div>
  );
}

export default Input;
