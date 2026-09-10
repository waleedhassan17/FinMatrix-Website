import * as RadixSwitch from '@radix-ui/react-switch';
import * as RadixTabs from '@radix-ui/react-tabs';
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';

import { cn } from '@/lib/cn';

// ───────────────────────────────────────────────────────────────────────────
// DateField
// ───────────────────────────────────────────────────────────────────────────

interface DateFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label?: ReactNode;
  /** ISO `YYYY-MM-DD`, the only format the API accepts. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: ReactNode;
  containerClassName?: string;
}

/**
 * A date field on `<input type="date">`.
 *
 * The app hand-rolls a calendar because React Native has no date input worth
 * using. The browser does, and it brings keyboard entry, locale-aware display,
 * and the platform's own picker for free — while its value is already the
 * `YYYY-MM-DD` the server's `@IsDateString()` wants, with no timezone in play.
 * Building a calendar here would be strictly worse.
 */
export function DateField({
  label,
  value,
  onChange,
  error,
  hint,
  className,
  containerClassName,
  ...props
}: DateFieldProps) {
  const id = useId();
  const describedById = error || hint ? `${id}-description` : undefined;

  return (
    <div className={cn('flex flex-col gap-xxs', containerClassName)}>
      {label && (
        <label htmlFor={id} className="text-label-md text-text-secondary">
          {label}
        </label>
      )}
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
        className={cn(
          'h-12 w-full rounded-md border bg-surface px-md text-body-md text-text-primary',
          'outline-none transition-colors focus:border-[1.5px] focus:border-primary',
          error ? 'border-danger' : 'border-border',
          className,
        )}
        {...props}
      />
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

// ───────────────────────────────────────────────────────────────────────────
// Textarea
// ───────────────────────────────────────────────────────────────────────────

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  containerClassName?: string;
}

export function Textarea({
  label,
  error,
  hint,
  className,
  containerClassName,
  rows = 4,
  ...props
}: TextareaProps) {
  const id = useId();
  const describedById = error || hint ? `${id}-description` : undefined;

  return (
    <div className={cn('flex flex-col gap-xxs', containerClassName)}>
      {label && (
        <label htmlFor={id} className="text-label-md text-text-secondary">
          {label}
        </label>
      )}
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
        className={cn(
          'w-full rounded-md border bg-surface px-md py-sm text-body-md text-text-primary',
          'outline-none transition-colors placeholder:text-text-tertiary',
          'focus:border-[1.5px] focus:border-primary',
          error ? 'border-danger' : 'border-border',
          className,
        )}
        {...props}
      />
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

// ───────────────────────────────────────────────────────────────────────────
// Switch
// ───────────────────────────────────────────────────────────────────────────

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-sm">
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors outline-none',
          'data-[state=checked]:bg-primary data-[state=unchecked]:bg-neutral-300',
          disabled && 'opacity-60',
        )}
      >
        <RadixSwitch.Thumb className="block size-5 translate-x-[2px] rounded-full bg-neutral-0 shadow-xs transition-transform data-[state=checked]:translate-x-[22px]" />
      </RadixSwitch.Root>
      {label && (
        <label htmlFor={id} className="text-body-md text-text-primary">
          {label}
        </label>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Tabs
// ───────────────────────────────────────────────────────────────────────────

export const Tabs = RadixTabs.Root;

export function TabsList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <RadixTabs.List
      className={cn('flex gap-xs border-b border-border', className)}
    >
      {children}
    </RadixTabs.List>
  );
}

export function TabsTrigger({
  value,
  children,
  count,
}: {
  value: string;
  children: ReactNode;
  count?: number;
}) {
  return (
    <RadixTabs.Trigger
      value={value}
      className={cn(
        'relative -mb-px flex items-center gap-xs border-b-2 px-sm py-sm text-label-lg transition-colors',
        'border-transparent text-text-secondary hover:text-text-primary',
        'data-[state=active]:border-primary data-[state=active]:text-primary',
      )}
    >
      {children}
      {count !== undefined && (
        <span
          className={cn(
            'rounded-full px-[6px] py-[1px] text-label-sm tabular',
            // A zero count is dimmed rather than hidden — the app dims empty
            // filter tabs so the set of options stays stable as data changes.
            count === 0
              ? 'bg-neutral-100 text-text-tertiary'
              : 'bg-primary-tint text-primary',
          )}
        >
          {count}
        </span>
      )}
    </RadixTabs.Trigger>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RadixTabs.Content value={value} className={cn('pt-lg outline-none', className)}>
      {children}
    </RadixTabs.Content>
  );
}
