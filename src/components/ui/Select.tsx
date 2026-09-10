import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface SelectOption<V extends string = string> {
  label: string;
  value: V;
}

interface SelectProps<V extends string = string> {
  label?: ReactNode;
  value: V | '';
  onChange: (value: V) => void;
  options: readonly SelectOption<V>[];
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  disabled?: boolean;
  /** Line-item fields are 40px; standard form controls are 48. */
  compact?: boolean;
  className?: string;
  containerClassName?: string;
}

/**
 * A plain select. Metrics match <Input> deliberately — 48px tall, 10px radius,
 * 16px padding — because the app's CustomDropdown was built to sit beside
 * CustomInput in the same row without either one drifting.
 *
 * For long or searchable lists use <Combobox> instead.
 */
export function Select<V extends string = string>({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  error,
  hint,
  disabled,
  compact,
  className,
  containerClassName,
}: SelectProps<V>) {
  const id = useId();
  const describedById = error || hint ? `${id}-description` : undefined;

  return (
    <div className={cn('flex flex-col gap-xxs', containerClassName)}>
      {label && (
        <label htmlFor={id} className="text-label-md text-text-secondary">
          {label}
        </label>
      )}

      <RadixSelect.Root
        value={value || undefined}
        onValueChange={(v) => onChange(v as V)}
        disabled={disabled}
      >
        <RadixSelect.Trigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedById}
          className={cn(
            'flex w-full items-center justify-between gap-xs rounded-md border bg-surface px-md text-left',
            'text-body-md text-text-primary outline-none transition-colors',
            'data-[placeholder]:text-text-tertiary',
            'focus:border-[1.5px] focus:border-primary',
            compact ? 'h-10' : 'h-12',
            error ? 'border-danger' : 'border-border',
            disabled && 'bg-background text-text-disabled opacity-70',
            className,
          )}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon>
            <ChevronDown className="size-4 text-text-tertiary" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-72 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-surface shadow-md"
          >
            <RadixSelect.Viewport className="p-xxs">
              {options.map((opt) => (
                <RadixSelect.Item
                  key={opt.value}
                  value={opt.value}
                  className="flex cursor-pointer items-center justify-between gap-xs rounded-sm px-sm py-xs text-body-md text-text-primary outline-none data-[highlighted]:bg-primary-tint"
                >
                  <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator>
                    <Check className="size-4 text-primary" />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>

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

export default Select;
