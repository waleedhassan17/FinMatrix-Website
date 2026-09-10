import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';
import type { SelectOption } from '@/components/ui/Select';

interface ComboboxProps<V extends string = string> {
  label?: ReactNode;
  value: V | '';
  onChange: (value: V) => void;
  options: readonly SelectOption<V>[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  error?: string;
  hint?: ReactNode;
  disabled?: boolean;
  compact?: boolean;
  containerClassName?: string;
}

/**
 * A searchable picker, for the lists a plain <Select> cannot serve: customers
 * and inventory items, both of which run to hundreds of rows in a real
 * company. The app's CustomDropdown grows a `searchable` flag for the same
 * reason.
 *
 * Built on Popover rather than Radix Select because Select owns keyboard
 * typeahead itself and will not host a text input.
 */
export function Combobox<V extends string = string>({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches.',
  error,
  hint,
  disabled,
  compact,
  containerClassName,
}: ComboboxProps<V>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const describedById = error || hint ? `${id}-description` : undefined;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const pick = (v: V) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className={cn('flex flex-col gap-xxs', containerClassName)}>
      {label && (
        <label htmlFor={id} className="text-label-md text-text-secondary">
          {label}
        </label>
      )}

      <Popover.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery('');
        }}
      >
        <Popover.Trigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedById}
            className={cn(
              'flex w-full items-center justify-between gap-xs rounded-md border bg-surface px-md text-left',
              'text-body-md outline-none transition-colors',
              'focus:border-[1.5px] focus:border-primary',
              compact ? 'h-10' : 'h-12',
              error ? 'border-danger' : 'border-border',
              disabled && 'bg-background opacity-70',
              selected ? 'text-text-primary' : 'text-text-tertiary',
            )}
          >
            <span className="truncate">{selected?.label ?? placeholder}</span>
            <ChevronDown className="size-4 shrink-0 text-text-tertiary" />
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            className="z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-md border border-border bg-surface shadow-md"
            // Keep focus in the search box when the list opens.
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              (
                listRef.current?.parentElement?.querySelector('input') ?? null
              )?.focus();
            }}
          >
            <div className="relative border-b border-border-light">
              <Search className="pointer-events-none absolute left-sm top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-10 w-full bg-transparent pl-[34px] pr-sm text-body-sm text-text-primary outline-none placeholder:text-text-tertiary"
                onKeyDown={(e) => {
                  // Enter picks the only remaining match — the fast path when
                  // you have typed enough to be unambiguous.
                  if (e.key === 'Enter' && filtered.length === 1) {
                    e.preventDefault();
                    pick(filtered[0].value);
                  }
                }}
              />
            </div>

            <div ref={listRef} className="max-h-64 overflow-y-auto p-xxs">
              {filtered.length === 0 ? (
                <p className="px-sm py-md text-body-sm text-text-tertiary">
                  {emptyText}
                </p>
              ) : (
                filtered.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => pick(opt.value)}
                    className={cn(
                      'flex w-full items-center justify-between gap-xs rounded-sm px-sm py-xs text-left text-body-md',
                      'hover:bg-primary-tint',
                      opt.value === value
                        ? 'text-primary'
                        : 'text-text-primary',
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {opt.value === value && (
                      <Check className="size-4 shrink-0 text-primary" />
                    )}
                  </button>
                ))
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

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

export default Combobox;
